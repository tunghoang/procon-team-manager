const got = require("got");
const useController = require("../lib/useController");
const { Match, Question, Answer, OptimalAnswer } = require("../models");
const { update } = useController(Question);
const {
  engineErrorMessage,
  getFilter,
  getServiceApi,
} = require("../lib/common");
const {
  isStaff,
  isManager,
  managerGroupId,
  canManageMatch,
} = require("../lib/scope");
const {
  MAX_MINUTES,
  MIN_MINUTES,
  nextDueSec,
} = require("../lib/autoResetPlan");
const { redactQuestionForTeam } = require("../lib/questionVisibility");
const {
  defaultResetStartsAt,
  parseStoredBoard,
  rejectResetStartsAt,
  shiftQuestionSchedule,
} = require("../lib/questionSchedule");
// Every engine call from here is made as the SERVICE, not with the caller's
// own token: a group manager's token is not an engine admin (it is only an
// admin over its own group's games, and only once those carry the group id
// this controller stamps on them at /game/init). Scope is enforced here, on
// the match, before any engine call is made. See lib/engineGames.js for the
// shared house rules (timeout, no retries, tolerated 404s, never throws).
const {
  deleteGamesQuietly,
  engineAuthHeader,
  engineGameIdsFor,
  pooled,
  resetGameOnEngine,
  rosterTeamIdsForMatch,
} = require("../lib/engineGames");
const { sequelize } = require("../models");
const { QueryTypes } = require("sequelize");

const include = [
  {
    model: Match,
    as: "match",
  },
];

// Stamp the match's practice flags onto a question's raw_questions body and
// report them back. Shared by the single and bulk create paths.
//
// startsAt inside raw_questions is an ABSOLUTE Day-1 time the admin picked
// (defaulting from the match's start_time) -- used as-is, no re-anchoring. A
// stray legacy `starts_in_minutes` (from an older client) is still honored for
// back-compat, then stripped.
const prepareRawQuestion = (raw, match) => {
  // Practice match? Each team then plays its OWN isolated, self-paced game.
  // Competitive practice (no_reset) is a practice match where submissions are
  // final (no day reset) and teams share a leaderboard.
  const isPractice = !!match?.is_practice;
  const noReset = isPractice && !!match?.no_reset;
  if (raw) {
    if (raw.starts_in_minutes != null) {
      raw.startsAt =
        Math.floor(Date.now() / 1000) + Number(raw.starts_in_minutes) * 60;
      delete raw.starts_in_minutes;
    }
    raw.is_practice = isPractice; // so the frontend detects practice from question_data
    raw.no_reset = noReset;
    // Owning group, if any. The engine stores it on the game so that group's
    // manager is treated as an admin of it there (reset, delete, spectate).
    raw.group_id = match?.group_id ?? null;
  }
  return { isPractice, noReset };
};

/**
 * Columns a CREATE may never set from the request body.
 *
 * `auto_reset_*` belong to PUT /question/:id/auto-reset, which is where their
 * bounds ([MIN_MINUTES, MAX_MINUTES]) and "first run one interval from now"
 * rule live; set straight through a create they skipped both. `id` is the
 * question's own UUID and doubles as the engine's game_id.
 */
const CREATE_ONLY_FORBIDDEN = [
  "id",
  "auto_reset_minutes",
  "auto_reset_at_sec",
  "question_data",
];

const stripCreateOnlyFields = (body) => {
  for (const field of CREATE_ONLY_FORBIDDEN) delete body[field];
  return body;
};

/**
 * A private copy of a board, so that mutating it (prepareRawQuestion stamps the
 * practice flags on it, applyMatchRoster rewrites its `teams`) cannot reach any
 * other entry in a bulk request that shares the same object.
 *
 * A board is always plain JSON off the wire, so a JSON round-trip is a faithful
 * deep copy -- and unlike structuredClone it cannot throw on an exotic value.
 */
/**
 * Roll a transaction back unless it is already finished, and never throw.
 *
 * Sequelize sets `transaction.finished` to "commit"/"rollback" and then
 * REFUSES a second call ("Transaction cannot be rolled back because it has
 * been finished"). Since a failing `commit()` sets that flag before throwing,
 * the catch block that follows must not assume the transaction is still open --
 * otherwise its own rollback throws and the engine-game cleanup after it is
 * skipped, which leaves games alive for a question that does not exist.
 */
const rollbackQuietly = async (transaction) => {
  if (!transaction || transaction.finished) return;
  try {
    await transaction.rollback();
  } catch (error) {
    console.warn("transaction rollback failed (ignored):", error.message);
  }
};

const cloneBoard = (raw) => {
  if (raw == null || typeof raw !== "object") return raw;
  try {
    return JSON.parse(JSON.stringify(raw));
  } catch {
    // Not serialisable -> not a board the engine could take either; hand it
    // back untouched and let the pre-flight refuse it.
    return raw;
  }
};

/**
 * Point a pasted board's `teams` at the match's REAL roster.
 *
 * The React "Generate" path already does this (dialogs/question.jsx: every team
 * shares the generated start cluster, because the docs require an identical
 * starting layout for every team), but the Manual-JSON path a group manager
 * must use kept whatever `teams[].team_id` values were in the pasted text --
 * usually the ids of whatever match the board was generated for. The engine
 * then registered a game whose roster is a set of strangers, and every rostered
 * team got a bare 403 on /game/day with nothing on the admin side to explain it.
 *
 * Two shapes are accepted:
 *   - the pasted list already IS the roster (same set of team ids, no
 *     duplicates): kept verbatim, so a deliberate per-team start layout
 *     survives;
 *   - anything else: rebuilt from the roster, reusing the first usable
 *     `agents` list as the shared template.
 *
 * `players` is left alone on purpose: the engine takes it on input but derives
 * the real value from `len(teams)` (game_service.py), so it is cosmetic here.
 *
 * @returns {Promise<string|null>} a 400 message, or null when the board is fine
 */
const applyMatchRoster = async (raw, match) => {
  if (!raw || typeof raw !== "object") {
    return "no board found -- put the /game/init fields under raw_questions";
  }
  const rosterIds = (await rosterTeamIdsForMatch(match.id)).map(String);
  if (!rosterIds.length) {
    return (
      "this match has no teams on its roster yet -- add the teams to the " +
      "match first, then create the question (the board's teams[] is built " +
      "from the roster)"
    );
  }

  const pasted = Array.isArray(raw.teams) ? raw.teams : [];
  const pastedIds = pasted.map((team) => String(team?.team_id));
  const rosterSet = new Set(rosterIds);
  const sameRoster =
    pastedIds.length === rosterIds.length &&
    new Set(pastedIds).size === pastedIds.length &&
    pastedIds.every((id) => rosterSet.has(id));
  if (sameRoster) return null;

  const template = pasted.find(
    (team) => Array.isArray(team?.agents) && team.agents.length,
  )?.agents;
  if (!template) {
    return (
      "the board needs at least one teams[] entry with a non-empty agents " +
      "list: it is the start layout every team shares"
    );
  }
  raw.teams = rosterIds.map((teamId) => ({
    team_id: teamId,
    agents: [...template],
  }));
  return null;
};

// Create the HEXUDON engine game(s) backing one question.
//
// raw_questions is the full /game/init body (startsAt, daySeconds, daySteps,
// map, spots, fuelLimits, players, busyThreshold, jammedThreshold, teams,
// agent_selection_time_limit) assembled client-side. game_id is spread last so
// a stray game_id inside a pasted body can't override the real id.
//
// Ids are appended to `created` AS THEY SUCCEED rather than returned at the
// end, so a caller can still clean up the games it did manage to create when a
// later one throws -- /game/init is not covered by the DB transaction.
const initEngineGames = async (
  questionId,
  raw,
  isPractice,
  noReset,
  authHeader,
  created = [],
) => {
  const base = { ...raw };
  delete base.game_id;

  if (isPractice && !noReset) {
    // Plain practice: one solo game per team, id "{question.id}:{team_id}".
    // All share the same board/start cells; each runs independently, self-paced.
    const teams = Array.isArray(raw?.teams) ? raw.teams : [];
    for (const t of teams) {
      const gameId = `${questionId}:${t.team_id}`;
      await got.post(`${getServiceApi()}/game/init`, {
        headers: { Authorization: authHeader },
        json: {
          ...base,
          game_id: gameId,
          teams: [t],
          players: 1,
          is_practice: true,
          no_reset: false,
        },
        timeout: { request: 10000 },
      });
      created.push(gameId);
    }
  } else {
    // ONE shared game for the whole match -- both timed competitive AND
    // competitive practice (no_reset): all teams compete on one board/timeline.
    // (base carries is_practice + no_reset from raw.)
    await got.post(`${getServiceApi()}/game/init`, {
      headers: { Authorization: authHeader },
      json: { ...base, game_id: questionId },
      timeout: { request: 10000 },
    });
    created.push(questionId);
  }
  return created;
};

const ignore = ["start_time", "end_time"];

const filterField = {
  match_id: {
    field: "id",
    op: "like",
  },
  gt_id: {
    field: "id",
    op: "gt",
  },
  lt_id: {
    field: "id",
    op: "lt",
  },
  match_name: {
    field: "name",
    op: "like",
  },
  match: {
    match_name: {
      field: "$match.name$",
      op: "like",
    },
    match_is_active: {
      field: "$match.is_active$",
      op: "like",
    },
    eq_round_id: {
      field: "$match.round_id$",
      op: "eq",
    },
    eq_id: {
      field: "$match.id$",
      op: "eq",
    },
  },
};
const getQuestions = async (req, res) => {
  const { id: teamId } = req.auth;
  try {
    // A group manager: only the questions of its own group's matches, in
    // full (no pre-start redaction -- it set the board up).
    const matchInclude = { model: Match, as: "match" };
    if (isManager(req.auth)) {
      matchInclude.where = { group_id: managerGroupId(req.auth) };
    }
    let questions = await Question.findAll({
      where: getFilter(req.query, filterField),
      attributes: {
        exclude: ignore,
      },
      include: [matchInclude],
      order: [
        ["order", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    if (!isStaff(req.auth)) {
      questions = (
        await Promise.all(
          questions.map(async (item) => {
            const team = await sequelize.query(
              `SELECT * FROM team_match where team_id = :teamId and match_id = :matchId`,
              { replacements: { teamId, matchId: item.match_id }, type: QueryTypes.SELECT },
            );
            if (team.length) return redactQuestionForTeam(item);
            return null;
          }),
        )
      ).filter((item) => !!item);
    }

    return res.status(200).json({ count: questions.length, data: questions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getQuestion = async (req, res) => {
  const { id: teamId } = req.auth;
  const id = req.params.id;
  try {
    const question = await Question.findByPk(id, {
      attributes: {
        exclude: ignore,
      },
      include,
    });

    if (!question) {
      return res.status(404).json({
        message: "Question not found",
      });
    }

    // Superadmin, or the manager of the owning group: the full row.
    if (canManageMatch(req.auth, question.match)) {
      return res.status(200).json(question);
    }

    const team = await sequelize.query(
      `SELECT * FROM team_match where team_id = :teamId and match_id = :matchId`,
      { replacements: { teamId, matchId: question.match_id }, type: QueryTypes.SELECT },
    );

    if (!team.length) {
      return res.status(404).json({
        message: "Question not found",
      });
    }

    return res.status(200).json(redactQuestionForTeam(question));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * The ONLY columns an edit may touch. Everything else about a question is
 * either derived from its match (`match_id`), owned by another endpoint
 * (`auto_reset_*` -> PUT /question/:id/auto-reset) or frozen at /game/init time
 * (`question_data`). Passing the whole row through `update()` let a manager
 * re-home a question under any match by id and set an auto-reset interval that
 * skipped its own bounds check.
 *
 * `difficulty` and `weight` are the organiser's own labels for weighting
 * questions BY HAND (models/question.js): nothing here or on the engine reads
 * them, and they are meant to be editable after the board exists.
 */
const QUESTION_UPDATE_FIELDS = [
  "name",
  "description",
  "order",
  "difficulty",
  "weight",
];

const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await Question.findByPk(id, { include });
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }
    if (!canManageMatch(req.auth, question.match)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    // A HEXUDON question's board (map/spots/teams/day config) is fixed at
    // /game/init time and cannot be changed afterwards -- only name/
    // description may be edited. This used to accept `type: "manual"` +
    // `raw_questions` and rewrite question_data into a prior contest year's
    // square-board shape, which would have silently corrupted a HEXUDON
    // question's data (and desynced it from the already-registered game).
    if (req.body.raw_questions || req.body.question_data || req.body.type) {
      return res.status(400).json({
        message:
          "A question's board is immutable once created. Delete and recreate the question instead.",
      });
    }

    // Whitelist, don't blacklist: an unknown extra field is dropped rather
    // than handed to the ORM.
    const body = {};
    for (const field of QUESTION_UPDATE_FIELDS) {
      if (req.body[field] === undefined) continue;
      if (field === "order") {
        const order = Number(req.body.order);
        if (!Number.isInteger(order)) {
          return res.status(400).json({ message: "order must be an integer" });
        }
        body.order = order;
        continue;
      }
      if (field === "name") {
        const name = String(req.body.name).trim();
        if (!name) return res.status(400).json({ message: "name is required" });
        body.name = name;
        continue;
      }
      if (field === "weight") {
        // A FLOAT column: "" from a cleared form means "no coefficient".
        if (req.body.weight === null || req.body.weight === "") {
          body.weight = null;
          continue;
        }
        const weight = Number(req.body.weight);
        if (!Number.isFinite(weight)) {
          return res
            .status(400)
            .json({ message: "weight must be a number (or null to clear it)" });
        }
        body.weight = weight;
        continue;
      }
      if (field === "difficulty") {
        // VARCHAR(32), free-form: it is a label the organiser reads, and no
        // code branches on its value.
        if (req.body.difficulty === null || req.body.difficulty === "") {
          body.difficulty = null;
          continue;
        }
        const difficulty = String(req.body.difficulty).trim().slice(0, 32);
        body.difficulty = difficulty || null;
        continue;
      }
      body[field] = req.body[field];
    }
    req.body = body;

    await update(req, res);
  } catch (error) {
    // No engine call happens in this handler, so this is a DB/validation
    // error: engineErrorMessage would have dressed it up as an engine one.
    return res.status(500).json({ message: error.message });
  }
};

/**
 * Turn the auto-reset cron on/off for one question (admin only).
 *
 * `minutes` 0 clears it; anything else must land inside [MIN_MINUTES,
 * MAX_MINUTES]. Enabling schedules the first reset one interval from now --
 * never immediately, so an admin can't wipe a running match by opening the
 * dialog. The cron itself lives in lib/autoReset.js.
 */
const setQuestionAutoReset = async (req, res) => {
  try {
    const question = await Question.findByPk(req.params.id, { include });
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }
    if (!canManageMatch(req.auth, question.match)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    const minutes = Number(req.body.minutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_MINUTES) {
      return res.status(400).json({
        message: `minutes must be an integer from 0 (off) to ${MAX_MINUTES}`,
      });
    }
    if (minutes > 0 && minutes < MIN_MINUTES) {
      return res
        .status(400)
        .json({ message: `the shortest interval is ${MIN_MINUTES} minute(s)` });
    }
    await question.update({
      auto_reset_minutes: minutes,
      auto_reset_at_sec: minutes > 0 ? nextDueSec(minutes) : null,
    });
    return res.status(200).json(question);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /question/:id/reset -- replay one question's game(s) from Day 1.
 *
 * The manual counterpart of the auto-reset cron, and the route the admin UI
 * uses. It exists here rather than in the browser because only this side knows
 * which engine games a question owns, holds the service admin token, and can
 * write the new schedule back to `question_data` -- which the UI could not do,
 * and whose absence made the board gate decorative after every reset (see
 * lib/questionSchedule.js).
 *
 * Body: { startsAt?: epoch seconds }. Defaults to
 * `now + agent_selection_time_limit + 60 s`; anything earlier than
 * `now + agent_selection_time_limit` is refused, because that window is the
 * pre-match phase and a replay that starts inside it defaults every team to
 * all-patrol.
 *
 * 200 when every game reset, 502 when some failed (the schedule is still
 * written if at least one did, so the rest can be retried).
 */
const resetQuestion = async (req, res) => {
  try {
    const question = await Question.findByPk(req.params.id, { include });
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }
    if (!canManageMatch(req.auth, question.match)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    // Unparseable board data must still be resettable (that is often WHY the
    // admin is resetting), so a corrupt row is treated as an empty one here.
    const data = parseStoredBoard(question.question_data) || {};
    // Practice games (plain AND competitive) are self-paced: the engine ignores
    // startsAt for them, and there is no window to re-anchor here either.
    const isPractice = !!data.is_practice;

    let startsAt = null;
    if (!isPractice) {
      if (req.body?.startsAt === undefined || req.body.startsAt === null) {
        startsAt = defaultResetStartsAt(data);
      } else {
        startsAt = Number(req.body.startsAt);
        const refusal = rejectResetStartsAt(data, startsAt);
        if (refusal) return res.status(400).json({ message: refusal });
      }
    }

    const gameIds = await engineGameIdsFor(question);
    const authHeader = engineAuthHeader();
    const reset = [];
    const failed = [];
    // A game the engine does not have: for plain practice the bare question id
    // never exists, so this is the normal case rather than a failure.
    const missing = [];
    const rows = await pooled(gameIds, (gameId) =>
      resetGameOnEngine(gameId, startsAt, authHeader),
    );
    rows.forEach((row, index) => {
      const gameId = gameIds[index];
      if (!row.ok) failed.push({ id: gameId, reason: row.message });
      else if (row.missing) missing.push(gameId);
      else reset.push(gameId);
    });

    // Persist the new Day 1 unless literally nothing on the engine took it.
    // The RAW stored text is passed in, not the tolerant `data` above, so a
    // corrupt question_data is left exactly as it is for an admin to inspect
    // rather than quietly replaced by a schedule-only body.
    let persisted = null;
    const fields = {};
    if (reset.length > 0 || failed.length === 0) {
      const shifted = shiftQuestionSchedule(question.question_data, startsAt);
      if (shifted.changed) {
        fields.question_data = shifted.json;
        persisted = shifted.data.startsAt;
      }
      // Push the cron's next run a full interval past the NEW Day 1. It was
      // anchored on whenever the interval was switched on, so a manual reset
      // could be followed seconds later by an automatic one that wiped the
      // freshly replayed game -- the same rule setQuestionAutoReset applies
      // (nextDueSec), just measured from the new start instead of from now.
      const minutes = Number(question.auto_reset_minutes) || 0;
      if (minutes > 0) {
        const anchorMs = (persisted ?? startsAt ?? null) != null
          ? Number(persisted ?? startsAt) * 1000
          : Date.now();
        fields.auto_reset_at_sec = nextDueSec(minutes, anchorMs);
      }
    }
    if (Object.keys(fields).length) await question.update(fields);

    const ok = failed.length === 0;
    return res.status(ok ? 200 : 502).json({
      ok,
      // null for a practice question: it has no timed window at all.
      startsAt: persisted ?? (isPractice ? null : startsAt),
      reset,
      failed,
      missing,
    });
  } catch (error) {
    // The engine's own failures are already captured per game in `failed`
    // (resetGameOnEngine never throws), so anything here is local.
    return res.status(500).json({ message: error.message });
  }
};

const removeQuestion = async (req, res) => {
  try {
    const existing = await Question.findByPk(req.params.id, { include });
    if (!existing) {
      return res.status(404).json({ message: "Question not found" });
    }
    if (!canManageMatch(req.auth, existing.match)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    // Resolved up front: the per-team ids come from the row about to go.
    const gameIds = await engineGameIdsFor(existing);
    const transaction = await sequelize.transaction();
    try {
      const deletedCount = await Question.destroy({
        where: { id: req.params.id },
        transaction,
      });
      if (deletedCount === 0) {
        await rollbackQuietly(transaction);
        return res.status(404).json({ message: "Question not found" });
      }

      await transaction.commit();
    } catch (error) {
      await rollbackQuietly(transaction);
      return res.status(500).json({ message: error.message });
    }
    // Best-effort engine cleanup AFTER the DB delete is committed: a game
    // may already be gone on the engine (404) or the engine briefly
    // unreachable -- neither should make the question undeletable here.
    // Pooled, so a practice question with a 20-team roster does not burst 21
    // deletes past the engine's rate limit.
    await deleteGamesQuietly(gameIds);
    return res.sendStatus(200);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Bulk delete questions
// Body: { question_ids: number[] }
const bulkDeleteQuestions = async (req, res) => {
  try {
    const { question_ids } = req.body;
    if (!question_ids?.length) {
      return res.status(400).json({
        message: "question_ids is required",
      });
    }
    // Scope the whole batch first: one question outside the caller's reach
    // rejects the request before anything is deleted.
    const existing = await Question.findAll({
      where: { id: question_ids },
      include,
    });
    const barred = existing.find((q) => !canManageMatch(req.auth, q.match));
    if (barred) {
      return res.status(403).json({ message: `Not allowed: "${barred.name}"` });
    }
    const gameIds = (await Promise.all(existing.map(engineGameIdsFor))).flat();
    const transaction = await sequelize.transaction();

    let deletedCount = 0;
    try {
      await Answer.destroy({
        where: { question_id: question_ids },
        transaction,
      });

      await OptimalAnswer.destroy({
        where: { question_id: question_ids },
        transaction,
      });

      deletedCount = await Question.destroy({
        where: { id: question_ids },
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await rollbackQuietly(transaction);
      return res.status(500).json({ message: error.message });
    }

    // Best-effort engine cleanup after the DB delete commits, one per game,
    // each swallowing its own error so one missing/failed game never rolls
    // back (and thus un-deletes) the whole batch.
    await deleteGamesQuietly(gameIds);

    return res.status(200).json({
      message: `Successfully deleted ${deletedCount} question(s)`,
      deleted_count: deletedCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createQuestion = async (req, res) => {
  try {
    if (!req.body.match_id) {
      return res.status(400).json({ message: "match_id is required" });
    }
    // Resolve, scope and validate EVERYTHING that can refuse the request
    // before opening the transaction. An early `return` from inside the
    // transaction never rolled it back, and with a pool of 5 connections five
    // duplicate-name attempts were enough to hang every query in the process
    // for the connection timeout.
    const match = await Match.findByPk(req.body.match_id);
    if (!match) {
      return res.status(400).json({ message: "match_id invalid" });
    }
    if (!canManageMatch(req.auth, match)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const existingQuestion = await Question.findOne({
      where: { name: req.body.name, match_id: req.body.match_id },
    });
    if (existingQuestion) {
      return res.status(400).json({ message: "Duplicated name" });
    }

    // The auto-reset interval has its own endpoint (and its own bounds check);
    // accepting it here let a create set an out-of-range interval, or a due
    // time in the past that fires on the very next cron tick.
    stripCreateOnlyFields(req.body);

    // Auto-increment order based on existing questions in the same match
    const maxOrderQuestion = await Question.findOne({
      where: { match_id: req.body.match_id },
      order: [["order", "DESC"]],
      attributes: ["order"],
    });
    req.body.order = (maxOrderQuestion?.order ?? -1) + 1;

    const raw = req.body.raw_questions;
    const rosterRefusal = await applyMatchRoster(raw, match);
    if (rosterRefusal) return res.status(400).json({ message: rosterRefusal });

    // let optimalAnswers = [];

    // if (req.body.type === "manual") {
    //   const size = req.body.raw_questions.length;
    //   if (size < 4 || size > 24 || size % 2 !== 0) {
    //     return res
    //       .status(406)
    //       .json({ message: "Invalid size of board" });
    //   }
    //   const field = {
    //     size: req.body.raw_questions.length,
    //     entities: req.body.raw_questions,
    //   }
    //   req.body.question_data = JSON.stringify({ field });
    //   // Manual questions don't have mode, max_ops, rotations
    //   req.body.mode = null;
    //   req.body.max_ops = null;
    //   req.body.rotations = null;
    // } else {
    //   // Auto-generated question
    //   const mode = req.body.mode || 0;
    //   const max_ops = req.body.max_ops || 2;
    //   const rotations = req.body.rotations || 3;
    //   const size = req.body.size || 12;

    //   const response = await got
    //     .get(`${getServiceApi()}/board`, {
    //       searchParams: {
    //         size,
    //         mode,
    //         max_ops,
    //         rotations,
    //       },
    //     })
    //     .json();
    //   req.body.question_data = JSON.stringify(response.question_data);

    //   // Save parameters to DB fields
    //   req.body.mode = mode;
    //   req.body.max_ops = max_ops;
    //   req.body.rotations = rotations;

    //   // Get optimal answers from response
    //   optimalAnswers = response.parameters?.answers || [];
    // }

    // // Create the question
    // const question = await Question.create(req.body);

    // // Save optimal answers if available
    // if (optimalAnswers.length > 0) {
    //   await OptimalAnswer.create({
    //     question_id: question.id,
    //     moves: JSON.stringify(optimalAnswers),
    //   });
    // }

    const { isPractice, noReset } = prepareRawQuestion(raw, match);

    // Nothing below may refuse the request: from here on every exit path goes
    // through the transaction's commit or its rollback.
    const transaction = await sequelize.transaction();
    const createdGameIds = [];
    try {
      req.body.question_data = JSON.stringify(raw);
      const question = await Question.create(req.body, { transaction });

      const authHeader = engineAuthHeader();
      await initEngineGames(
        question.id,
        raw,
        isPractice,
        noReset,
        authHeader,
        createdGameIds,
      );

      await transaction.commit();

      return res.status(201).json(question);
    } catch (error) {
      // `commit()` itself can fail, and it marks the transaction finished
      // before it throws -- an unguarded rollback then throws "already
      // finished" from inside the catch and the engine cleanup below is never
      // reached, stranding the games it had created.
      await rollbackQuietly(transaction);
      // The row is gone but any engine game already created is not -- /game/init
      // runs outside the transaction. A plain-practice question inits one game
      // per team, so a failure on team 3 would otherwise strand teams 1-2's games
      // and make the admin's next attempt collide with them on game_id.
      await deleteGamesQuietly(createdGameIds);
      // Surface the game service's own status (e.g. 400 = config validation
      // failed: bad day/steps/fuel/spot bounds) instead of masking it as 500,
      // so the admin sees WHY the board was rejected.
      const status = error.response?.statusCode || 500;
      return res.status(status).json({ message: engineErrorMessage(error) });
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// A batch is capped because the whole thing runs inside ONE transaction that
// stays open across every /game/init round-trip. Note a plain-practice match
// inits one game PER TEAM, so the engine-call count is questions x teams, not
// questions.
const MAX_BULK_QUESTIONS = 50;

// The question's OWN columns. Everything else in an entry is board data --
// that is what lets a /game/init payload be pasted in flat (see splitEntry).
//
// `auto_reset_*` are listed here even though a create REFUSES to set them
// (stripCreateOnlyFields, applied after this pick): recognising them as the
// question's own fields is what stops a stray one being mistaken for board
// data and forwarded to /game/init.
const QUESTION_FIELDS = [
  "name",
  "description",
  "match_id",
  "order",
  "start_time",
  "end_time",
  "auto_reset_minutes",
  "auto_reset_at_sec",
  // Organiser labels for weighting by hand. Listed here so the FLAT bulk form
  // treats them as the question's own fields rather than as board data -- the
  // engine never sees them.
  "difficulty",
  "weight",
];

const pickQuestionFields = (obj) =>
  Object.fromEntries(
    Object.entries(obj || {}).filter(([k]) => QUESTION_FIELDS.includes(k)),
  );

/**
 * Split one batch entry into the question's own fields and its board.
 *
 * The board is `raw_questions` when given (same shape as single-create), and
 * otherwise whatever remains of the entry once the question's columns are
 * removed -- so a generated /game/init payload can be pasted in as-is and just
 * given a `name`, with no re-nesting.
 *
 * CREATE_ONLY_FORBIDDEN keys are neither: they are dropped here rather than
 * counted as board data. Otherwise a NESTED entry that carried a stray `id`
 * (say, a row copied out of the API) had `{id: ...}` mistaken for its inline
 * board, which both shadowed `defaults.raw_questions` and got the entry
 * rejected for having no map -- and, worse, would have sent that `id` on to
 * /game/init as part of the board.
 */
const splitEntry = (entry) => {
  const inline = {};
  for (const [k, v] of Object.entries(entry || {})) {
    if (k === "raw_questions") continue;
    if (QUESTION_FIELDS.includes(k)) continue;
    if (CREATE_ONLY_FORBIDDEN.includes(k)) continue;
    inline[k] = v;
  }
  return {
    meta: pickQuestionFields(entry),
    raw:
      entry?.raw_questions ??
      (Object.keys(inline).length > 0 ? inline : undefined),
  };
};

/**
 * POST /question/bulk-create -- create several questions in one request.
 *
 * Two entry shapes, mix freely. FLAT -- paste a /game/init board and name it:
 *
 *   {
 *     "match_id": 22,                            // default for every entry
 *     "questions": [
 *       { "name": "Round 1", "startsAt": ..., "map": {...}, "spots": [...], ... },
 *       { "name": "Round 2", "startsAt": ..., "map": {...}, "spots": [...], ... }
 *     ]
 *   }
 *
 * NESTED -- exactly the single-create body, repeated:
 *
 *   {
 *     "defaults": { "match_id": 22 },
 *     "questions": [
 *       { "name": "Round 1", "raw_questions": { ...\/game\/init body... } }
 *     ]
 *   }
 *
 * A bare array is accepted too. Question fields at the top level (or in
 * `defaults`) apply to every entry; per-entry values win. `defaults` may also
 * carry a shared `raw_questions` when several questions reuse one board. Any
 * `game_id` inside a board is ignored -- the question's own id is used.
 *
 * ALL-OR-NOTHING. Setting up a contest is not a place for a half-created set of
 * rounds, so the first failure rolls the DB transaction back AND deletes every
 * engine game the request had already created. Either every question exists or
 * none does. The response names the entry that failed and forwards the game
 * service's own status, so a bad board reports which one it was.
 */
const bulkCreateQuestions = async (req, res) => {
  try {
  const body = req.body || {};
  const items = Array.isArray(body) ? body : body.questions;
  const defaults = Array.isArray(body)
    ? {}
    : { ...pickQuestionFields(body), ...(body.defaults || {}) };
  const defaultRaw = Array.isArray(body)
    ? undefined
    : body.defaults?.raw_questions;

  if (!Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ message: "questions must be a non-empty array" });
  }
  if (items.length > MAX_BULK_QUESTIONS) {
    return res.status(400).json({
      message: `too many questions: ${items.length}; at most ${MAX_BULK_QUESTIONS} per request`,
    });
  }

  const merged = items.map((item) => {
    const { meta, raw } = splitEntry(item);
    // Same rule as the single create: the auto-reset interval and the id are
    // not the request body's to set (see CREATE_ONLY_FORBIDDEN).
    return stripCreateOnlyFields({
      ...defaults,
      ...meta,
      // DEEP COPY. `defaults.raw_questions` is ONE object shared by every entry
      // that does not bring its own board, and both prepareRawQuestion and
      // applyMatchRoster MUTATE the board they are given -- so every such entry
      // ended up stored with (and initialised from) whatever the last entry's
      // match wrote into it, i.e. the wrong roster and the wrong practice flags.
      raw_questions: cloneBoard(raw ?? defaultRaw),
    });
  });

  // -- Pre-flight ---------------------------------------------------------
  // Validate the WHOLE batch before creating anything. A typo in the last
  // entry must not cost a rollback (and an engine cleanup) for the earlier
  // ones -- catching it here means nothing was ever created.
  const seenNames = new Set();
  for (let i = 0; i < merged.length; i++) {
    const q = merged[i];
    const at = `questions[${i}]`;
    if (!q.match_id) {
      return res.status(400).json({ message: `${at}: match_id is required` });
    }
    if (typeof q.name !== "string" || !q.name.trim()) {
      return res.status(400).json({ message: `${at}: name is required` });
    }
    if (!q.raw_questions || typeof q.raw_questions !== "object") {
      return res.status(400).json({
        message:
          `${at}: no board found -- put the /game/init fields (map, spots, ` +
          `daySteps, teams, ...) directly in the entry or under raw_questions`,
      });
    }
    // The (name, match_id) unique key would reject this at INSERT time anyway;
    // catching it up front keeps the failure cheap and says which entry.
    const key = `${q.match_id}\u0000${q.name}`;
    if (seenNames.has(key)) {
      return res.status(400).json({
        message: `${at}: duplicated name "${q.name}" within this batch`,
      });
    }
    seenNames.add(key);
  }

  const indexesByMatch = new Map();
  merged.forEach((q, i) => {
    if (!indexesByMatch.has(q.match_id)) indexesByMatch.set(q.match_id, []);
    indexesByMatch.get(q.match_id).push(i);
  });

  // Every referenced match must exist and be within the caller's scope.
  const matchesById = new Map();
  for (const matchId of indexesByMatch.keys()) {
    const match = await Match.findByPk(matchId);
    if (!match) {
      return res.status(400).json({ message: `match_id ${matchId} invalid` });
    }
    if (!canManageMatch(req.auth, match)) {
      return res.status(403).json({ message: `Not allowed: match "${match.name}"` });
    }
    matchesById.set(matchId, match);
  }

  // ...and against what is already stored, one IN() query per match.
  for (const [matchId, indexes] of indexesByMatch) {
    const clash = await Question.findOne({
      where: { match_id: matchId, name: indexes.map((i) => merged[i].name) },
      attributes: ["name"],
    });
    if (clash) {
      return res
        .status(400)
        .json({ message: `Duplicated name "${clash.name}"` });
    }
  }

  // Point every board at its match's real roster (see applyMatchRoster).
  // Still pre-flight: a board with no usable agents template, or a match with
  // an empty roster, refuses the batch before anything is created.
  for (let i = 0; i < merged.length; i++) {
    const refusal = await applyMatchRoster(
      merged[i].raw_questions,
      matchesById.get(merged[i].match_id),
    );
    if (refusal) {
      return res.status(400).json({ message: `questions[${i}]: ${refusal}` });
    }
  }

  // -- Create -------------------------------------------------------------
  const authHeader = engineAuthHeader();
  const transaction = await sequelize.transaction();
  const createdGameIds = [];
  const created = [];
  let failedIndex = null;

  try {
    // `order` picks up from the highest existing one in each match and then
    // increments across the batch, so a bulk create lands in the same order as
    // the equivalent run of single creates would have.
    const nextOrder = new Map();
    for (const matchId of indexesByMatch.keys()) {
      const top = await Question.findOne({
        where: { match_id: matchId },
        order: [["order", "DESC"]],
        attributes: ["order"],
        transaction,
      });
      nextOrder.set(matchId, (top?.order ?? -1) + 1);
    }

    for (let i = 0; i < merged.length; i++) {
      failedIndex = i;
      const q = merged[i];

      const raw = q.raw_questions;
      const { isPractice, noReset } = prepareRawQuestion(
        raw,
        matchesById.get(q.match_id),
      );

      const order = nextOrder.get(q.match_id);
      nextOrder.set(q.match_id, order + 1);

      const question = await Question.create(
        { ...q, order, question_data: JSON.stringify(raw) },
        { transaction },
      );
      await initEngineGames(
        question.id,
        raw,
        isPractice,
        noReset,
        authHeader,
        createdGameIds,
      );
      created.push(question);
    }
    failedIndex = null;

    await transaction.commit();

    return res.status(201).json({
      message: `Successfully created ${created.length} question(s)`,
      created_count: created.length,
      questions: created,
    });
  } catch (error) {
    // Guarded: a failing commit() has already marked the transaction finished,
    // and an unguarded rollback would throw out of this catch before the
    // engine games below were cleaned up.
    await rollbackQuietly(transaction);
    // The engine games are created OUTSIDE the transaction, so the rollback
    // does not touch them -- they have to be undone by hand before the admin
    // retries, or the next attempt collides with them on game_id.
    await deleteGamesQuietly(createdGameIds);

    // Forward the game service's own status (400 = board config rejected) so
    // the admin sees WHY, not a blanket 500.
    const status = error.response?.statusCode || 500;
    return res.status(status).json({
      message: engineErrorMessage(error),
      failed_index: failedIndex,
      failed_name: failedIndex === null ? null : merged[failedIndex]?.name,
      created_count: 0,
      rolled_back_games: createdGameIds.length,
    });
  }
  } catch (error) {
    // Anything thrown BEFORE the transaction opened (a DB error in the
    // pre-flight queries): a 500, never a request left hanging.
    return res.status(500).json({ message: error.message });
  }
};

const getTime = (req, res) => {
  return res.status(200).json({
    time: new Date(),
  });
};

// procon26-hexudon has no board-generation endpoint and no concept of
// regenerating a map in place -- a HEXUDON match's map/spots/teams are fixed
// for the whole match at /game/init. These two actions belonged to a prior
// (non-HEXUDON) contest year's auto-generated square-board puzzles and have
// no equivalent here; disabled rather than left to fail against a
// nonexistent /board endpoint.
const regenerateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await Question.findByPk(id);

    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    return res.status(400).json({
      message:
        "Regenerating a HEXUDON question's map is not supported. Delete and recreate the question instead.",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const regenerateWithParams = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await Question.findByPk(id);

    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    return res.status(400).json({
      message:
        "Regenerating a HEXUDON question's map is not supported. Delete and recreate the question instead.",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getOptimalAnswers = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await Question.findByPk(id, {
      include: [
        {
          model: OptimalAnswer,
          as: "optimal_answers",
        },
      ],
    });

    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    const optimalAnswers = question.optimal_answers || [];
    const moves =
      optimalAnswers.length > 0
        ? JSON.parse(optimalAnswers[0].moves || "[]")
        : [];

    return res.status(200).json({
      question_id: id,
      moves,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getQuestions,
  getQuestion,
  createQuestion,
  bulkCreateQuestions,
  updateQuestion,
  removeQuestion,
  bulkDeleteQuestions,
  regenerateQuestion,
  regenerateWithParams,
  getOptimalAnswers,
  getTime,
  resetQuestion,
  setQuestionAutoReset,
};
