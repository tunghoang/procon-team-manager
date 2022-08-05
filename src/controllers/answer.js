const got = require("got");
const { Answer, Question, Team, Match } = require("../models");
const useController = require("../lib/useController");
const { getAll, get, create, remove } = useController(Answer);

const includes = [
  {
    model: Question,
    as: "question",
    include: [
      {
        model: Match,
        as: "match",
      },
    ],
  },
  {
    model: Team,
    as: "team",
  },
];
const getAnswers = async (req, res) => {
  if (!req.auth.is_admin) req.query.match_team_id = req.auth.id;
  await getAll(req, res, null, includes);
};
const getAnswer = async (req, res) => {
  if (!req.auth.is_admin) req.query.match_team_id = req.auth.id;
  await get(req, res, null, includes);
};

const removeAnswer = async (req, res) => {
  await remove(req, res);
};

const createAnswer = async (req, res) => {
  try {
    const teamId = req.auth.is_admin ? req.body.team_id : req.auth.id;
    const { question_id, answer_data } = req.body;
    const question = await Question.findByPk(question_id);
    if (!question) {
      return res.status(400).json({ message: "Question not found" });
    }
    const answer = await Answer.findOne({
      where: {
        team_id: teamId,
        question_id,
      },
    });
    if (answer) return res.status(400).json({ message: "Answer exsited" });
    const questionData = JSON.parse(question.question_data);
    const response = await got
      .post(`${process.env.SERVICE_API}/answer-data`, {
        json: {
          question_uuid: questionData.question_uuid,
          answer_data,
          team_id: teamId,
        },
      })
      .json();
    console.log("score", response);
    req.body.score_data = JSON.stringify(response);
    req.body.answer_data = JSON.stringify(answer_data);
    req.body.team_id = teamId;
    await create(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateAnswer = async (req, res) => {
  try {
    const { id: teamId, is_admin } = req.auth;
    const { id: answerId } = req.params;
    const { answer_data } = req.body;

    const answer = await Answer.findByPk(answerId);
    if (!answer) return res.status(400).json({ message: "Answer not found" });
    if (!is_admin && answer.team_id !== teamId)
      return res.status(405).json({ message: "Not permited" });

    const questionData = JSON.parse(question.question_data);
    const response = await got
      .post(`${process.env.SERVICE_API}/answer-data`, {
        json: {
          question_uuid: questionData.question_uuid,
          answer_data,
          team_id: teamId,
        },
      })
      .json();
    console.log("score update", response, answer_data);

    await answer.update({
      score_data: JSON.stringify(response),
      answer_data: JSON.stringify(answer_data),
    });
    return res.status(200).json({
      id: answer.id,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getAnswerAudio = async (req, res) => {
  try {
    const { id: teamId, is_admin } = req.auth;
    const { id: answerId } = req.params;
    const audioUrl = `${process.env.SERVICE_API}/audio`;
    const answer = await Answer.findByPk(answerId);
    if (!answer) return res.status(400).json({ message: "Answer not found" });
    if (!is_admin && answer.team_id !== teamId)
      return res.status(405).json({ message: "Not permited" });

    const scoreData = JSON.parse(answer.score_data);
    const response = await got
      .get(audioUrl, {
        searchParams: {
          type: "answer",
          answer_uuid: scoreData.answer_uuid,
        },
      })
      .json();
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAnswers,
  getAnswer,
  createAnswer,
  updateAnswer,
  removeAnswer,
  getAnswerAudio,
};
