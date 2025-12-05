const got = require("got");
const useController = require("../lib/useController");
const { Match, Question, Answer, OptimalAnswer } = require("../models");
const { update, create, remove } = useController(Question);
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
        ['order', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });

    if (!isAdmin) {
      questions = (
        await Promise.all(
          questions.map(async (item) => {
            const team = await sequelize.query(
              `SELECT * FROM team_match where team_id = ${teamId} and match_id = ${item.match_id}`,
              { type: QueryTypes.SELECT }
            );
            if (team.length) return item;
            return null;
          })
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
      { type: QueryTypes.SELECT }
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
    if (req.body.type === "manual" && req.body.raw_questions) {
      const size = req.body.raw_questions.length;
      if (size < 4 || size > 24 || size % 2 !== 0) {
        return res.status(406).json({ message: "Invalid size of board" });
      }
      const field = {
        size: req.body.raw_questions.length,
        entities: req.body.raw_questions,
      };
      req.body.question_data = JSON.stringify({ field });
      // Manual questions don't have mode, max_ops, rotations
      req.body.mode = null;
      req.body.max_ops = null;
      req.body.rotations = null;
    }

    await update(req, res);
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(500).json({ message: errMsg });
  }
};

const removeQuestion = async (req, res) => {
  await remove(req, res);
};

// Bulk delete questions
// Body: { question_ids: number[] }
const bulkDeleteQuestions = async (req, res) => {
  const { question_ids } = req.body;
  try {
    if (!question_ids?.length) {
      return res.status(400).json({
        message: "question_ids is required",
      });
    }

    // Delete all answers for these questions first
    await Answer.destroy({
      where: { question_id: question_ids },
    });

    // Delete all optimal_answers for these questions
    await OptimalAnswer.destroy({
      where: { question_id: question_ids },
    });

    // Delete the questions
    const deletedCount = await Question.destroy({
      where: { id: question_ids },
    });

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
      return res.status(406).json({ message: "match_id invalid" });
    }

    const existingQuestion = await Question.findOne({
      where: { name: req.body.name, match_id: req.body.match_id },
    });
    if (existingQuestion) return res.status(400).json({ message: "Duplicated name" });

    // Auto-increment order based on existing questions in the same match
    const maxOrderQuestion = await Question.findOne({
      where: { match_id: req.body.match_id },
      order: [["order", "DESC"]],
      attributes: ["order"],
    });
    req.body.order = (maxOrderQuestion?.order ?? -1) + 1;

    let optimalAnswers = [];

    if (req.body.type === "manual") {
      const size = req.body.raw_questions.length;
      if (size < 4 || size > 24 || size % 2 !== 0) {
        return res
          .status(406)
          .json({ message: "Invalid size of board" });
      }
      const field = {
        size: req.body.raw_questions.length,
        entities: req.body.raw_questions,
      }
      req.body.question_data = JSON.stringify({ field });
      // Manual questions don't have mode, max_ops, rotations
      req.body.mode = null;
      req.body.max_ops = null;
      req.body.rotations = null;
    } else {
      // Auto-generated question
      const mode = req.body.mode || 0;
      const max_ops = req.body.max_ops || 2;
      const rotations = req.body.rotations || 3;
      const size = req.body.size || 12;

      const response = await got
        .get(`${getServiceApi()}/board`, {
          searchParams: {
            size,
            mode,
            max_ops,
            rotations,
          },
        })
        .json();
      req.body.question_data = JSON.stringify(response.question_data);

      // Save parameters to DB fields
      req.body.mode = mode;
      req.body.max_ops = max_ops;
      req.body.rotations = rotations;

      // Get optimal answers from response
      optimalAnswers = response.parameters?.answers || [];
    }

    // Create the question
    const question = await Question.create(req.body);

    // Save optimal answers if available
    if (optimalAnswers.length > 0) {
      await OptimalAnswer.create({
        question_id: question.id,
        moves: JSON.stringify(optimalAnswers),
      });
    }

    return res.status(201).json(question);
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(500).json({ message: errMsg });
  }
};

const getTime = (req, res) => {
  return res.status(200).json({
    time: new Date(),
  });
};

const regenerateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await Question.findByPk(id);

    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    if (
      question.mode === null ||
      question.max_ops === null ||
      question.rotations === null
    ) {
      return res.status(400).json({
        message: "This question was created manually and cannot be regenerated. Please create a new question instead."
      });
    }

    // Get parameters from DB fields (data gốc)
    const mode = question.mode;
    const max_ops = question.max_ops;
    const rotations = question.rotations;

    // Get size from question_data
    const currentData = JSON.parse(question.question_data || "{}");
    const size = currentData.parameters?.size || currentData.field?.size || 12;

    // Call service API to generate new question_data
    const response = await got
      .get(`${getServiceApi()}/board`, {
        searchParams: {
          size,
          mode,
          max_ops,
          rotations,
        },
      })
      .json();
    const optimalAnswers = response.parameters?.answers || [];

    // Delete all existing answers for this question
    // Because the new board is completely different, old answers are invalid
    const deletedAnswersCount = await Answer.destroy({
      where: {
        question_id: id,
      },
    });

    // Delete all existing optimal_answers for this question
    const deletedOptimalCount = await OptimalAnswer.destroy({
      where: {
        question_id: id,
      },
    });

    // Update question with new question_data
    await question.update({
      question_data: JSON.stringify(response.question_data),
    });

    // Save new optimal answers
    if (optimalAnswers.length > 0) {
      await OptimalAnswer.create({
        question_id: id,
        moves: JSON.stringify(optimalAnswers),
      });
    }

    return res.status(200).json({
      message: "Question regenerated successfully",
      question,
      deletedAnswers: deletedAnswersCount,
      deletedOptimalAnswers: deletedOptimalCount,
    });
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(500).json({ message: errMsg });
  }
};

const regenerateWithParams = async (req, res) => {
  try {
    const { id } = req.params;
    const { size, mode, max_ops, rotations, name, description } = req.body;
    const question = await Question.findByPk(id);

    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    // Validate parameters
    if (size < 4 || size > 24 || size % 2 !== 0) {
      return res.status(400).json({ message: "Invalid size. Must be even number between 4 and 24." });
    }

    if (mode !== 0 && mode !== 1) {
      return res.status(400).json({ message: "Invalid mode. Must be 0 (random) or 1 (special)." });
    }

    // Call service API to generate new question_data
    const response = await got
      .get(`${getServiceApi()}/board`, {
        searchParams: {
          size,
          mode,
          max_ops,
          rotations,
        },
      })
      .json();
    const optimalAnswers = response.parameters?.answers || [];

    // Delete all existing answers for this question
    const deletedAnswersCount = await Answer.destroy({
      where: {
        question_id: id,
      },
    });

    // Delete all existing optimal_answers for this question
    const deletedOptimalCount = await OptimalAnswer.destroy({
      where: {
        question_id: id,
      },
    });

    // Update question with new parameters and question_data
    await question.update({
      name: name || question.name,
      description: description !== undefined ? description : question.description,
      size,
      mode,
      max_ops,
      rotations,
      question_data: JSON.stringify(response.question_data),
    });

    // Save new optimal answers
    if (optimalAnswers.length > 0) {
      await OptimalAnswer.create({
        question_id: id,
        moves: JSON.stringify(optimalAnswers),
      });
    }

    return res.status(200).json({
      message: "Question updated and regenerated successfully",
      question,
      deletedAnswers: deletedAnswersCount,
      deletedOptimalAnswers: deletedOptimalCount,
    });
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(500).json({ message: errMsg });
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
    const moves = optimalAnswers.length > 0
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
