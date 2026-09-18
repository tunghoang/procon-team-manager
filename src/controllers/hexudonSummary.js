const got = require("got");
const XLSX = require("xlsx");

const { Match, Question, Round, Team } = require("../models");
const { getServiceApi, serviceAdminToken } = require("../lib/common");
const { buildRoundSummary } = require("../lib/hexudonSummary");
const { managerGroupId, canManageMatch } = require("../lib/scope");

/**
 * Round standings for HEXUDON: rank every match, then add the ranks up
 * (1st = 1 point, smallest total wins; a rostered team that did not compete
 * takes the match's last position). See lib/hexudonSummary.js for the rules.
 *
 * The engine is the only source of scores -- HEXUDON teams submit straight to
 * the game service, so the manager's `answer` table is empty for these matches
 * and the older /answer/summary + /answer/export views have nothing to show.
 * These endpoints read /game/result per question instead.
 *
 * STAFF ONLY (mounted behind requireStaff): a full cross-match leaderboard
 * exposes every team's standing in matches they are not part of. A group
 * manager gets the same views narrowed to its own group's matches.
 */

/**
 * Why a question is NOT part of the ranked standings, or null when it is.
 *
 * Only PLAIN per-team practice (`is_practice && !no_reset`) is out: it runs one
 * game PER TEAM (`${questionId}:${teamId}`), so a single /game/result for the
 * question id does not exist at all.
 *
 * COMPETITIVE practice (`no_reset`) IS scored. Its one shared game used to come
 * back all zeros with `days_submitted: 0` -- `begin_game()` ran before the
 * teams' agent kinds were stored and play happened on scratch copies -- which
 * would have shown every rostered team as DNP in last place. The engine now
 * scores that timeline properly (`Game.competitive_final_result`: a team's score
 * is the best canonical score it ever put on the board, days owned =
 * `days_submitted`, flagged `competitive_practice: true`), so the rows are real
 * and belong in the standings.
 *
 * Returns the REASON (a string, truthy) when the question must be skipped, and
 * null when it is to be scored -- so one call both decides and explains.
 */
const isPracticeQuestion = (question) => {
  let data;
  try {
    data = JSON.parse(question.question_data || "{}");
  } catch {
    return null;
  }
  if (!data.is_practice || data.no_reset) return null;
  return "practice match (one game per team)";
};

const SCORING_NOTE =
  "sum of finishing positions (1st = 1); lowest total wins; a rostered " +
  "team that did not compete takes that match's last position";

const MATCH_INCLUDE = [
  { model: Question, as: "questions" },
  {
    model: Team,
    as: "teams",
    attributes: ["id", "name"],
    through: { attributes: [] },
  },
];

/**
 * How many /game/result calls may be in flight at once.
 *
 * Serial was up to ~10 s per question against a slow engine (a 12-question
 * round could take two minutes and time the browser out); unbounded would burst
 * one request per question straight through the engine's READ rate limit
 * (config.py: 5/s, burst 10) and get half of them rejected. Four keeps a big
 * round quick and stays under the burst.
 */
const RESULT_CONCURRENCY = 4;

/** Everything `skipped` says about a question, wherever it is skipped from. */
const skippedRow = (match, question, reason) => ({
  question_id: question.id,
  question_name: question.name,
  // match_id and question_order so the caller can group and order the skipped
  // rows the same way it groups the scored ones, instead of matching on names.
  match_id: match.id,
  match_name: match.name,
  question_order: question.order ?? 0,
  reason,
});

/**
 * Ask the engine for every listed question's result.
 *
 * Shared by the round and the per-match views so both score off exactly the
 * same data with the same rules. One unreachable or never-initialised game must
 * not sink the whole view: it is reported under `skipped` and the rest is
 * ranked regardless.
 */
const scoreQuestions = async (pairs) => {
  const authHeader = { Authorization: `Bearer ${serviceAdminToken()}` };
  const scored = [];
  const skipped = [];

  const scoreOne = async ({ match, question }) => {
    const practiceReason = isPracticeQuestion(question);
    if (practiceReason) {
      skipped.push(skippedRow(match, question, practiceReason));
      return;
    }
    try {
      const result = await got
        .get(`${getServiceApi()}/game/result`, {
          searchParams: { game_id: question.id },
          headers: authHeader,
          timeout: { request: 10000 },
          // got retries GETs twice by default, so one hung game cost 3 x the
          // timeout before this view gave up on it.
          retry: { limit: 0 },
        })
        .json();
      scored.push({
        question_id: question.id,
        question_name: question.name,
        match_id: match.id,
        match_name: match.name,
        // Lets the UI number a match's questions when their names carry no
        // <round>.<group>.<match> tag (procon-react utils/group-standings.js).
        question_order: question.order ?? 0,
        // Passed through untouched for whoever weights the questions by hand;
        // nothing here applies them.
        difficulty: question.difficulty ?? null,
        weight: question.weight ?? null,
        // The match ROSTER, so a team the engine never ranked still takes this
        // match's last place instead of vanishing (lib/hexudonSummary.js).
        roster: (match.teams || []).map((team) => String(team.id)),
        result,
      });
    } catch (error) {
      skipped.push(
        skippedRow(
          match,
          question,
          error.response?.statusCode === 404
            ? "no game registered on the engine"
            : `engine error: ${error.response?.statusCode || error.message}`,
        ),
      );
    }
  };

  // A fixed pool of workers over one shared cursor.
  let cursor = 0;
  const worker = async () => {
    while (cursor < pairs.length) {
      const pair = pairs[cursor++];
      await scoreOne(pair);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(RESULT_CONCURRENCY, pairs.length) }, worker),
  );

  // The pool finishes out of order; put both lists back in the caller's order
  // so the standings columns and the export sheets stay stable.
  const rank = new Map(pairs.map((pair, index) => [pair.question.id, index]));
  const byInput = (a, b) => rank.get(a.question_id) - rank.get(b.question_id);
  scored.sort(byInput);
  skipped.sort(byInput);
  return { scored, skipped };
};

const rosterOf = (matches) => {
  const teamsById = new Map();
  for (const match of matches) {
    for (const team of match.teams || []) {
      teamsById.set(String(team.id), { id: team.id, name: team.name });
    }
  }
  return [...teamsById.values()];
};

/**
 * @param groupId  when set, only that group's matches in the round are scored
 *                 (a manager's view); null scores the whole round.
 */
const fetchRoundSummary = async (roundId, groupId = null) => {
  const round = await Round.findByPk(roundId, {
    include: [{ model: Match, as: "matches", include: MATCH_INCLUDE }],
  });
  if (!round) return null;
  const matches = (round.matches || []).filter(
    (m) => groupId == null || Number(m.group_id) === Number(groupId),
  );

  const pairs = [];
  for (const match of matches) {
    for (const question of match.questions || []) {
      pairs.push({ match, question });
    }
  }

  const { scored, skipped } = await scoreQuestions(pairs);
  const summary = buildRoundSummary(scored, rosterOf(matches));
  return {
    round: { id: round.id, name: round.name },
    group_id: groupId,
    scoring: SCORING_NOTE,
    matches: summary.matches,
    teams: summary.teams,
    skipped,
  };
};

/**
 * The same standings scoped to ONE match: every question that match owns,
 * aggregated per team.
 *
 * A match can hold several questions (that is what bulk-create produces), so
 * this is a real aggregation, not a single scoreboard -- a team's total is the
 * sum of its positions across that match's questions. Identical rules to the
 * round view; it is literally the same scorer over a narrower set of questions.
 */
const fetchMatchSummary = async (matchId) => {
  const match = await Match.findByPk(matchId, { include: MATCH_INCLUDE });
  if (!match) return null;

  const pairs = (match.questions || []).map((question) => ({
    match,
    question,
  }));
  const { scored, skipped } = await scoreQuestions(pairs);
  const summary = buildRoundSummary(scored, rosterOf([match]));
  return {
    match: {
      id: match.id,
      name: match.name,
      round_id: match.round_id,
      is_practice: !!match.is_practice,
      questions: (match.questions || []).length,
    },
    scoring: SCORING_NOTE,
    // Named `questions` here rather than `matches`: within one match these ARE
    // the questions. Same row shape as the round view's `matches`.
    questions: summary.matches,
    teams: summary.teams,
    skipped,
  };
};

const getRoundHexudonSummary = async (req, res) => {
  try {
    const summary = await fetchRoundSummary(
      req.params.id,
      managerGroupId(req.auth),
    );
    if (!summary) return res.status(404).json({ message: "Round not found" });
    return res.status(200).json(summary);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getMatchHexudonSummary = async (req, res) => {
  try {
    const match = await Match.findByPk(req.params.id, {
      attributes: ["id", "group_id"],
    });
    if (!match || !canManageMatch(req.auth, match)) {
      return res.status(404).json({ message: "Match not found" });
    }
    const summary = await fetchMatchSummary(req.params.id);
    if (!summary) return res.status(404).json({ message: "Match not found" });
    return res.status(200).json(summary);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const exportRoundHexudonSummary = async (req, res) => {
  try {
    const summary = await fetchRoundSummary(
      req.params.id,
      managerGroupId(req.auth),
    );
    if (!summary) return res.status(404).json({ message: "Round not found" });

    const wb = XLSX.utils.book_new();
    const matches = summary.matches;

    // --- Sheet 1: the standings, one column of ranks per match -------------
    const header1 = ["#", "Team"];
    matches.forEach((m) => header1.push(`${m.match_name} / ${m.question_name}`));
    header1.push("Matches counted", "of which DNP", "Rank points (sum)");
    const rows = [header1];
    for (const team of summary.teams) {
      const row = [team.rank ?? "-", team.team_name];
      for (const m of matches) {
        const cell = team.per_match[m.question_id];
        if (!cell) row.push("-");                            // not on that roster
        else if (!cell.competed) row.push(`${cell.position} (DNP)`);
        else row.push(cell.position);
      }
      row.push(team.matches_counted, team.matches_missed, team.rank_points);
      rows.push(row);
    }
    rows.push([]);
    rows.push(["Scoring", summary.scoring]);
    rows.push([
      "DNP",
      // The old wording ("no agent kinds chosen") named the wrong cause: a team
      // that missed the agent-kind window is defaulted to all-patrol by the
      // engine and plays on, so it is ranked on what it scored. DNP is strictly
      // "answered no day at all".
      "did not submit any day (days_submitted = 0) - scored as that match's " +
        "last place; a missed agent-kind window still competes (all-patrol " +
        "default) and keeps the position it earned",
    ]);
    rows.push(["-", "not on that match's roster - the match does not count"]);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(rows),
      "Round standings"
    );

    // --- Sheet 2: the official metrics behind every position ---------------
    const detail = [[
      "Match",
      "Question",
      "Position",
      "Team",
      "Distinct types",
      "Cumulative daily types",
      "Servings",
      "Response time (s)",
      "Competed",
    ]];
    const nameOf = new Map(summary.teams.map((t) => [t.team_id, t.team_name]));
    for (const m of matches) {
      for (const row of m.rows) {
        detail.push([
          m.match_name,
          m.question_name,
          row.position,
          nameOf.get(row.team_id) || `#${row.team_id}`,
          row.distinct_types,
          row.cumulative_daily_types,
          row.total_servings,
          row.cumulative_response_time,
          row.competed ? "yes" : "no",
        ]);
      }
    }
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(detail),
      "Match detail"
    );

    if (summary.skipped.length) {
      const skipped = [["Match", "Question", "#", "Reason"]];
      summary.skipped.forEach((s) =>
        skipped.push([s.match_name, s.question_name, s.question_order, s.reason])
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(skipped),
        "Not scored"
      );
    }

    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=hexudon_round_${req.params.id}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  // Exported for hexudonSummary.test.js: which questions are ranked at all is
  // a competition rule, not an implementation detail.
  isPracticeQuestion,
  fetchRoundSummary,
  fetchMatchSummary,
  getRoundHexudonSummary,
  getMatchHexudonSummary,
  exportRoundHexudonSummary,
};
