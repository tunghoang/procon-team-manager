const got = require("got");
const useController = require("../lib/useController");
const { Match, Question, Answer, OptimalAnswer } = require("../models");
const { update } = useController(Question);
const { getFilter, getServiceApi } = require("../lib/common");
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
            if (team.length) return item;
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

    return res.status(200).json(question);
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

    // Create the question. startsAt in raw_questions is now an ABSOLUTE Day-1
    // time the admin picked (defaulting from the match's start_time) -- used
    // as-is, no re-anchoring. A stray legacy `starts_in_minutes` (from an older
    // client) is still honored for back-compat, then stripped.
    const raw = req.body.raw_questions;
    if (raw && raw.starts_in_minutes != null) {
      raw.startsAt = Math.floor(Date.now() / 1000) + Number(raw.starts_in_minutes) * 60;
      delete raw.starts_in_minutes;
    }

    // Practice match? Each team then plays its OWN isolated, self-paced game.
    const match = await Match.findByPk(req.body.match_id, { transaction });
    const isPractice = !!match?.is_practice;
    if (raw) raw.is_practice = isPractice; // so the frontend detects practice from question_data

    req.body.question_data = JSON.stringify(raw);
    const question = await Question.create(req.body, { transaction });

    // raw_questions is the full /game/init body (startsAt, daySeconds, daySteps,
    // map, spots, fuelLimits, players, busyThreshold, jammedThreshold, teams,
    // agent_selection_time_limit) assembled client-side. game_id spread last so
    // a stray game_id inside a pasted body can't override the real id.
    const authHeader = `Bearer ${req.get("Authorization")}`;
    const base = { ...raw };
    delete base.game_id;

    if (isPractice) {
      // One solo game per team, id "{question.id}:{team_id}". All share the
      // same board and start cells; each runs independently, self-paced.
      const teams = Array.isArray(raw.teams) ? raw.teams : [];
      for (const t of teams) {
        await got.post(`${getServiceApi()}/game/init`, {
          headers: { Authorization: authHeader },
          json: {
            ...base,
            game_id: `${question.id}:${t.team_id}`,
            teams: [t],
            players: 1,
            is_practice: true,
          },
          timeout: { request: 10000 },
        });
      }
    } else {
      await got.post(`${getServiceApi()}/game/init`, {
        headers: { Authorization: authHeader },
        json: { ...base, game_id: question.id },
        timeout: { request: 10000 },
      });
    }

    await transaction.commit();

    return res.status(201).json(question);
  } catch (error) {
    await transaction.rollback();
    // Surface the game service's own status (e.g. 400 = config validation
    // failed: bad day/steps/fuel/spot bounds) instead of masking it as 500,
    // so the admin sees WHY the board was rejected.
    const status = error.response?.statusCode || 500;
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(status).json({ message: errMsg });
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
  updateQuestion,
  removeQuestion,
  bulkDeleteQuestions,
  regenerateQuestion,
  regenerateWithParams,
  getOptimalAnswers,
  getTime,
};
