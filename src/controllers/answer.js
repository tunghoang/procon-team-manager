const got = require("got");
const useController = require("../lib/useController");
const { Answer, Question, Team, Match } = require("../models");
const { getAll, create, remove } = useController(Answer);
const { checkValidAnswer, getServiceApi } = require("../lib/common");
const { addAnswer } = require("../jobqueue");

const include = [
  {
    model: Question,
    as: "question",
    attributes: ["id", "name", "match_id"],
  },
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
    const { question_id: questionId, answer_data: answerData } = req.body;

    const question = await Question.findByPk(questionId, {
      include: [
        {
          model: Match,
          as: "match",
        },
      ],
    });
    if (!question)
      return res.status(404).json({ message: "Question not found" });

    const message = await checkValidAnswer(question.match, teamId);
    if (message) return res.status(405).json({ message });

    const answer = await Answer.findOne({
      where: {
        team_id: teamId,
        question_id: questionId,
      },
    });

    const response = await got
      .post(`${getServiceApi()}/validate`, {
        json: {
          question: JSON.parse(question.question_data),
          answer_data: answerData,
        },
      })
      .json();

    const scoreData = {
      ...JSON.parse(answer?.score_data || "{}"),
      ...response,
    };

    scoreData.resubmission_count = (scoreData.resubmission_count ?? -1) + 1;
    scoreData.resubmission_penalty =
      scoreData.resubmission_factor * scoreData.resubmission_count;

    // add to answer queue
    addAnswer({
      scoreData,
      answerData,
      questionId,
      answerId: answer?.id,
    });

    if (!answer) {
      req.body.score_data = JSON.stringify(scoreData);
      req.body.answer_data = JSON.stringify(answerData);
      req.body.team_id = teamId;
      req.body.match_id = question.match_id;
      await create(req, res);
    } else {
      await answer.update({
        score_data: JSON.stringify(scoreData),
        answer_data: JSON.stringify(answerData),
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
