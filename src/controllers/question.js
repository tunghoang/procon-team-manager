const got = require("got");
const useController = require("../lib/useController");
const { Match, Question } = require("../models");
const { update, create, remove } = useController(Question);
const { getFilter } = require("../lib/common");
const { sequelize } = require("../models");
const { QueryTypes } = require("sequelize");

const include = [
  {
    model: Match,
    as: "match",
  },
];

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
      include,
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
    await update(req, res);
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(500).json({ message: errMsg });
  }
};

const removeQuestion = async (req, res) => {
  await remove(req, res);
};

const createQuestion = async (req, res) => {
  try {
    if (!req.body.match_id) {
      return res.status(406).json({ message: "match_id invalid" });
    }

    const question = await Question.findOne({
      where: { name: req.body.name, match_id: req.body.match_id },
    });
    if (question) return res.status(400).json({ message: "Duplicated name" });

    const response = await got
      .get(`${process.env.SERVICE_API}/board`, {
        searchParams: {
          w: req.body.width || 32,
          h: req.body.height || 32,
          p: req.body.p || 2,
          mode: req.body.mode || 0,
          ndie: req.body.ndie || 1,
          niter: req.body.niter || 2,
        },
      })
      .json();
    req.body.question_data = JSON.stringify(response);
    await create(req, res);
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

module.exports = {
  getQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  removeQuestion,
  getTime,
};
