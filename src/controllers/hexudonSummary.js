const got = require("got");
const XLSX = require("xlsx");

const { Match, Question, Round, Team } = require("../models");
const { getServiceApi, serviceAdminToken } = require("../lib/common");
const { buildRoundSummary } = require("../lib/hexudonSummary");

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
 * ADMIN ONLY (mounted behind requireAdmin): a full cross-match leaderboard
 * exposes every team's standing in matches they are not part of.
 */

/** Practice matches run one game PER TEAM (`${questionId}:${teamId}`), so a
 * single /game/result for the question id does not exist for them. Competitive
 * practice (no_reset) and timed matches both have one shared game at the bare
 * question id and are included. */
const isPerTeamPractice = (question) => {
  try {
    const data = JSON.parse(question.question_data || "{}");
    return !!data.is_practice && !data.no_reset;
  } catch {
    return false;
  }
};

const fetchRoundSummary = async (roundId) => {
  const round = await Round.findByPk(roundId, {
    include: [
      {
        model: Match,
        as: "matches",
        include: [
          { model: Question, as: "questions" },
          { model: Team, as: "teams", attributes: ["id", "name"], through: { attributes: [] } },
        ],
      },
    ],
  });
  if (!round) return null;

  const teamsById = new Map();
  const matchesToScore = [];
  for (const match of round.matches || []) {
    for (const team of match.teams || []) {
      teamsById.set(String(team.id), { id: team.id, name: team.name });
    }
    for (const question of match.questions || []) {
      matchesToScore.push({ match, question });
    }
  }

  const authHeader = { Authorization: `Bearer ${serviceAdminToken()}` };
  const scored = [];
  const skipped = [];
  for (const { match, question } of matchesToScore) {
    if (isPerTeamPractice(question)) {
      skipped.push({
        question_id: question.id,
        question_name: question.name,
        match_name: match.name,
        reason: "practice match (one game per team)",
      });
      continue;
    }
    try {
      const result = await got
        .get(`${getServiceApi()}/game/result`, {
          searchParams: { game_id: question.id },
          headers: authHeader,
          timeout: { request: 10000 },
        })
        .json();
      scored.push({
        question_id: question.id,
        question_name: question.name,
        match_id: match.id,
        match_name: match.name,
        result,
      });
    } catch (error) {
      // One unreachable/never-initialised game must not sink the whole round:
      // report it and rank what is available.
      skipped.push({
        question_id: question.id,
        question_name: question.name,
        match_name: match.name,
        reason:
          error.response?.statusCode === 404
            ? "no game registered on the engine"
            : `engine error: ${error.response?.statusCode || error.message}`,
      });
    }
  }

  const summary = buildRoundSummary(scored, [...teamsById.values()]);
  return {
    round: { id: round.id, name: round.name },
    scoring:
      "sum of finishing positions (1st = 1); lowest total wins; a rostered " +
      "team that did not compete takes that match's last position",
    matches: summary.matches,
    teams: summary.teams,
    skipped,
  };
};

const getRoundHexudonSummary = async (req, res) => {
  try {
    const summary = await fetchRoundSummary(req.params.id);
    if (!summary) return res.status(404).json({ message: "Round not found" });
    return res.status(200).json(summary);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const exportRoundHexudonSummary = async (req, res) => {
  try {
    const summary = await fetchRoundSummary(req.params.id);
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
      "did not compete (no agent kinds chosen) - scored as that match's last place",
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
      const skipped = [["Match", "Question", "Reason"]];
      summary.skipped.forEach((s) =>
        skipped.push([s.match_name, s.question_name, s.reason])
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
  fetchRoundSummary,
  getRoundHexudonSummary,
  exportRoundHexudonSummary,
};
