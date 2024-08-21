const got = require("got");
const useController = require("../lib/useController");
const { Answer, Question, Team, Match } = require("../models");
const { getAll, create, remove } = useController(Answer);
const { checkValidAnswer } = require("../lib/common");

const include = [
  // {
  //   model: Question,
  //   as: "question",
  //   attributes: [
  //     "id",
  //     "name",
  //     "match_id",
  //     "start_time",
  //     "end_time",
  //     "question_data",
  //   ],
  // },
  {
    model: Team,
    as: "team",
    attributes: ["id", "name"],
  },
  {
    model: Match,
    as: "match",
  },
];

const ignore = ["answer_data"];

const filterField = {
  match_id: {
    field: "id",
    op: "like",
  },
  match: {
    eq_id: {
      field: "$match.id$",
      op: "eq",
    },
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
  },
  question: {
    match_name: {
      field: "$question.name$",
      op: "like",
    },
  },
  team: {
    eq_id: {
      field: "$team.id$",
      op: "eq",
    },
    match_name: {
      field: "$team.name$",
      op: "like",
    },
  },
};

const getAnswers = async (req, res) => {
  if (!req.auth.is_admin)
    req.query.team = {
      ...req.query.team,
      eq_id: req.auth.id,
    };
  await getAll(req, res, ignore, include, filterField);
};

const getAnswer = async (req, res) => {
  const id = req.params.id;
  try {
    const data = await Answer.findByPk(id, {
      attributes: {
        exclude: ignore,
      },
      include,
    });

    if (!data || (!req.auth.is_admin && req.auth.id !== data.team_id)) {
      return res.status(404).json({
        message: `${Answer.name} not found`,
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const removeAnswer = async (req, res) => {
  await remove(req, res);
};

const createAnswer = async (req, res) => {
  try {
    const teamId = req.auth.id;
    const { question_id, answer_data } = req.body;
    const question = await Question.findByPk(question_id, {
      include: [
        {
          model: Match,
          as: "match",
        },
      ],
    });
    if (!question)
      return res.status(404).json({ message: "Question not found" });

    let message = await checkValidAnswer(question, teamId);
    if (message) return res.status(405).json({ message });

    const answer = await Answer.findOne({
      where: {
        team_id: teamId,
        question_id,
      },
    });

    if (!answer) {
      const response = await got
        .post(`${process.env.SERVICE_API}/answer`, {
          json: {
            question: JSON.parse(question.question_data),
            answer_data,
          },
        })
        .json();
      response.penalties = 0;
      req.body.score_data = JSON.stringify(response);
      req.body.answer_data = JSON.stringify(answer_data);
      req.body.team_id = teamId;
      req.body.match_id = question.match_id;
      await create(req, res);
    } else {
      penalties = JSON.parse(answer.score_data).penalties;
      // if (penalties > 30)
      //   return res
      //     .status(429)
      //     .json({ message: "Maximum number of changes exceeded" });

      const response = await got
        .post(`${process.env.SERVICE_API}/answer`, {
          json: {
            question: JSON.parse(question.question_data),
            answer_data,
          },
        })
        .json();

      response.penalties = penalties + 1;
      response.final_score -= response.penalties;
      await answer.update({
        score_data: JSON.stringify(response),
        answer_data: JSON.stringify(answer_data),
      });
      return res.status(200).json({
        id: answer.id,
      });
    }
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(500).json({ message: errMsg });
  }
};

module.exports = {
  getAnswers,
  getAnswer,
  createAnswer,
  removeAnswer,
};
