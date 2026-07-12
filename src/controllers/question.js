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
              `SELECT * FROM team_match where team_id = ${teamId} and match_id = ${item.match_id}`,
              { type: QueryTypes.SELECT },
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
      `SELECT * FROM team_match where team_id = ${teamId} and match_id = ${question.match_id}`,
      { type: QueryTypes.SELECT },
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

    await got.delete(`${getServiceApi()}/game/${req.params.id}`, {
      headers: {
        Authorization: `Bearer ${req.get("Authorization")}`,
      },
    });
    await transaction.commit();
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

    await Promise.all(
      question_ids.map((question_id) =>
        got.delete(`${getServiceApi()}/game/${question_id}`, {
          headers: {
            Authorization: `Bearer ${req.get("Authorization")}`,
          },
        }),
      ),
    );

    await transaction.commit();

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

    // Create the question

    req.body.question_data = JSON.stringify(req.body.raw_questions);
    const question = await Question.create(req.body, { transaction });

    // raw_questions is already the full /game/init body (startsAt, daySeconds,
    // daySteps, map, spots, fuelLimits, players, busyThreshold,
    // jammedThreshold, teams, agent_selection_time_limit) assembled
    // client-side -- see components/procon26/board-generator.js on the
    // frontend. Only game_id is injected here.
    await got.post(`${getServiceApi()}/game/init`, {
      headers: {
        Authorization: `Bearer ${req.get("Authorization")}`,
      },
      json: {
        game_id: question.id,
        ...req.body.raw_questions,
      },
      timeout: {
        request: 10000,
      },
    });

    await transaction.commit();

    return res.status(201).json(question);
  } catch (error) {
    await transaction.rollback();
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(500).json({ message: errMsg });
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
