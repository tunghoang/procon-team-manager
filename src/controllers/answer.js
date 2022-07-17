const got = require("got");
const { Answer, Question } = require("../models");
const useController = require("../lib/useController");
const { getAll, get, create, remove } = useController(Answer);
const getAnswers = async (req, res) => {
  await getAll(req, res);
};
const getAnswer = async (req, res) => {
  await get(req, res);
};

const removeAnswer = async (req, res) => {
  await remove(req, res);
};

const createAnswer = async (req, res) => {
  try {
    const teamId = req.auth?.id || 1;
    const { question_id, answer_data } = req.body;
    const question = await Question.findByPk(question_id);
    if (!question) {
      return res.status(400).json({ message: "Question not found" });
    }
    const questionData = JSON.parse(question.question_data);
    const response = await got
      .post(`${process.env.SERVICE_API}/answer-data`, {
        json: {
          question_uuid: questionData.question_uuid,
          answer_data,
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
    const { id } = req.params;
    const { answer_data } = req.body;

    const answer = await Answer.findByPk(id);
    if (!answer) return res.status(400).json({ message: "Answer not found" });
    if (!is_admin && answer.team_id !== teamId)
      return res.status(405).json({ message: "Not permited" });

    const question = await Question.findByPk(answer.question_id);
    if (!question)
      return res.status(400).json({ message: "Question not found" });

    const questionData = JSON.parse(question.question_data);
    const response = await got
      .post(`${process.env.SERVICE_API}/answer-data`, {
        json: {
          question_uuid: questionData.question_uuid,
          answer_data,
        },
      })
      .json();
    console.log("score update", response);

    await answer.update({
      score_data: JSON.stringify(response),
      answer_data: JSON.stringify(answer_data),
    });
    return res.status(200).json();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAnswers,
  getAnswer,
  createAnswer,
  updateAnswer,
  removeAnswer,
};
