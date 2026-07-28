const got = require("got");
const useController = require("../lib/useController");
const { Match, Question, Answer, OptimalAnswer } = require("../models");
const { update } = useController(Question);
const {
  getFilter,
  getServiceApi,
  resyncAutoIncrement,
} = require("../lib/common");
const {
  MAX_MINUTES,
  MIN_MINUTES,
  nextDueSec,
} = require("../lib/autoResetPlan");
const { redactQuestionForTeam } = require("../lib/questionVisibility");
const { sequelize } = require("../models");
const { QueryTypes } = require("sequelize");

const include = [
  {
    model: Match,
    as: "match",
  },
];

// Best-effort delete of a game on the HEXUDON engine. Never throws: a game
// that's already absent (404) or a briefly-unreachable engine must not block
// deleting the manager's own question record. An orphaned engine game is
// harmless (its id no longer matches any question).
const deleteGameQuietly = async (gameId, authHeader) => {
  try {
    await got.delete(`${getServiceApi()}/game/${gameId}`, {
      headers: { Authorization: authHeader },
    });
  } catch (err) {
    console.warn(
      `engine game delete for ${gameId} failed (ignored):`,
      err.response?.statusCode || err.message,
    );
  }
};

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
  }
  return { isPractice, noReset };
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
  const { id: teamId, is_admin: isAdmin } = req.auth;
  try {
    let questions = await Question.findAll({
      where: getFilter(req.query, filterField),
      attributes: {
        exclude: ignore,
      },
      include,
      order: [
        ["order", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    if (!isAdmin) {
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
  const { id: teamId, is_admin: isAdmin } = req.auth;
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

    const team = await sequelize.query(
      `SELECT * FROM team_match where team_id = :teamId and match_id = :matchId`,
      { replacements: { teamId, matchId: question.match_id }, type: QueryTypes.SELECT },
    );

    if (!isAdmin && !team.length) {
      return res.status(404).json({
        message: "Question not found",
      });
    }

    return res
      .status(200)
      .json(isAdmin ? question : redactQuestionForTeam(question));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await Question.findByPk(id);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
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

    await update(req, res);
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(500).json({ message: errMsg });
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
    const question = await Question.findByPk(req.params.id);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
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

const removeQuestion = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const deletedCount = await Question.destroy({
      where: { id: req.params.id },
      transaction,
    });
    if (deletedCount === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: "Question not found" });
    }

    await transaction.commit();
    await resyncAutoIncrement(Question);
    // Best-effort engine cleanup AFTER the DB delete is committed: the game
    // may already be gone on the engine (404) or the engine briefly
    // unreachable -- neither should make the question undeletable here.
    await deleteGameQuietly(req.params.id, `Bearer ${req.get("Authorization")}`);
    return res.sendStatus(200);
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

// Bulk delete questions
// Body: { question_ids: number[] }
const bulkDeleteQuestions = async (req, res) => {
  const { question_ids } = req.body;
  const transaction = await sequelize.transaction();

  try {
    if (!question_ids?.length) {
      return res.status(400).json({
        message: "question_ids is required",
      });
    }

    await Answer.destroy({
      where: { question_id: question_ids },
      transaction,
    });

    await OptimalAnswer.destroy({
      where: { question_id: question_ids },
      transaction,
    });

    const deletedCount = await Question.destroy({
      where: { id: question_ids },
      transaction,
    });

    await transaction.commit();
    await resyncAutoIncrement(Question);
    // Best-effort engine cleanup after the DB delete commits, one per game,
    // each swallowing its own error so one missing/failed game never rolls
    // back (and thus un-deletes) the whole batch.
    const authHeader = `Bearer ${req.get("Authorization")}`;
    await Promise.all(
      question_ids.map((question_id) => deleteGameQuietly(question_id, authHeader)),
    );

    return res.status(200).json({
      message: `Successfully deleted ${deletedCount} question(s)`,
      deleted_count: deletedCount,
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: error.message });
  }
};

const createQuestion = async (req, res) => {
  const transaction = await sequelize.transaction();
  const createdGameIds = [];

  try {
    if (!req.body.match_id) {
      return res.status(406).json({ message: "match_id invalid" });
    }

    const existingQuestion = await Question.findOne({
      where: { name: req.body.name, match_id: req.body.match_id },
    });
    if (existingQuestion)
      return res.status(400).json({ message: "Duplicated name" });

    // Auto-increment order based on existing questions in the same match
    const maxOrderQuestion = await Question.findOne({
      where: { match_id: req.body.match_id },
      order: [["order", "DESC"]],
      attributes: ["order"],
    });
    req.body.order = (maxOrderQuestion?.order ?? -1) + 1;

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

    const raw = req.body.raw_questions;
    const match = await Match.findByPk(req.body.match_id, { transaction });
    const { isPractice, noReset } = prepareRawQuestion(raw, match);

    req.body.question_data = JSON.stringify(raw);
    const question = await Question.create(req.body, { transaction });

    const authHeader = `Bearer ${req.get("Authorization")}`;
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
    await transaction.rollback();
    // The rolled-back INSERT still consumed the question's AUTO_INCREMENT id
    // (InnoDB never returns it), so a board rejected by /game/init would make
    // the next question -- and the game_id it becomes -- skip a number.
    await resyncAutoIncrement(Question);
    // The row is gone but any engine game already created is not -- /game/init
    // runs outside the transaction. A plain-practice question inits one game
    // per team, so a failure on team 3 would otherwise strand teams 1-2's games
    // and make the admin's next attempt collide with them on game_id.
    await Promise.all(
      createdGameIds.map((gameId) =>
        deleteGameQuietly(gameId, `Bearer ${req.get("Authorization")}`),
      ),
    );
    // Surface the game service's own status (e.g. 400 = config validation
    // failed: bad day/steps/fuel/spot bounds) instead of masking it as 500,
    // so the admin sees WHY the board was rejected.
    const status = error.response?.statusCode || 500;
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(status).json({ message: errMsg });
  }
};

// A batch is capped because the whole thing runs inside ONE transaction that
// stays open across every /game/init round-trip. Note a plain-practice match
// inits one game PER TEAM, so the engine-call count is questions x teams, not
// questions.
const MAX_BULK_QUESTIONS = 50;

// The question's OWN columns. Everything else in an entry is board data --
// that is what lets a /game/init payload be pasted in flat (see splitEntry).
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
 */
const splitEntry = (entry) => {
  const inline = {};
  for (const [k, v] of Object.entries(entry || {})) {
    if (k !== "raw_questions" && !QUESTION_FIELDS.includes(k)) inline[k] = v;
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
    return { ...defaults, ...meta, raw_questions: raw ?? defaultRaw };
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
      return res.status(406).json({ message: `${at}: match_id invalid` });
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

  // -- Create -------------------------------------------------------------
  const authHeader = `Bearer ${req.get("Authorization")}`;
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

    const matchCache = new Map();

    for (let i = 0; i < merged.length; i++) {
      failedIndex = i;
      const q = merged[i];

      if (!matchCache.has(q.match_id)) {
        matchCache.set(
          q.match_id,
          await Match.findByPk(q.match_id, { transaction }),
        );
      }
      const raw = q.raw_questions;
      const { isPractice, noReset } = prepareRawQuestion(
        raw,
        matchCache.get(q.match_id),
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
    await transaction.rollback();
    // Rolled-back INSERTs still burned their AUTO_INCREMENT ids (see
    // createQuestion), and the engine games are outside the transaction, so
    // both need undoing by hand before the admin retries.
    await resyncAutoIncrement(Question);
    await Promise.all(
      createdGameIds.map((gameId) => deleteGameQuietly(gameId, authHeader)),
    );

    // Forward the game service's own status (400 = board config rejected) so
    // the admin sees WHY, not a blanket 500.
    const status = error.response?.statusCode || 500;
    const errMsg = error.response ? error.response.body : error.message;
    return res.status(status).json({
      message: errMsg,
      failed_index: failedIndex,
      failed_name: failedIndex === null ? null : merged[failedIndex]?.name,
      created_count: 0,
      rolled_back_games: createdGameIds.length,
    });
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
  const { id } = req.params;
  const question = await Question.findByPk(id);

  if (!question) {
    return res.status(404).json({ message: "Question not found" });
  }

  return res.status(400).json({
    message:
      "Regenerating a HEXUDON question's map is not supported. Delete and recreate the question instead.",
  });
};

const regenerateWithParams = async (req, res) => {
  const { id } = req.params;
  const question = await Question.findByPk(id);

  if (!question) {
    return res.status(404).json({ message: "Question not found" });
  }

  return res.status(400).json({
    message:
      "Regenerating a HEXUDON question's map is not supported. Delete and recreate the question instead.",
  });
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
  setQuestionAutoReset,
};
