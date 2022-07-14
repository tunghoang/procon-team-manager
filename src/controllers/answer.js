const got = require("got");
const { Answer, Question } = require("../models");
const useController = require("./useController");
const { getAll, get, create, remove } = useController(Answer);
const getAnswers = async (req, res) => {
  req.query.match_team_id = req.auth.id;
  await getAll(req, res);
};
const getAnswer = async (req, res) => {
  await get(req, res);
};

const createAnswer = async (req, res) => {
  try {
    const teamId = req.auth?.id || 1;
    const { question_id, answer_data } = req.body;
    const question = await Question.findByPk(question_id);
    if (!question) {
      return res.status(400).json({ error: "Question not found" });
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
    return res.status(500).json({ error: error.message });
  }
};

const updateAnswer = async (req, res) => {
  try {
    const teamId = req.auth.id;
    const { id } = req.params;
    const { answer_data } = req.body;

    const answer = await Answer.findByPk(id);
    if (!answer) return res.status(400).json({ error: "Answer not found" });
    if (answer.team_id !== teamId)
      return res.status(400).json({ error: "Not permited" });

    const question = await Question.findByPk(answer.question_id);
    if (!question) return res.status(400).json({ error: "Question not found" });

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

const removeAnswer = async (req, res) => {
  await remove(req, res);
};

module.exports = {
  getAnswers,
  getAnswer,
  createAnswer,
  updateAnswer,
  removeAnswer,
};
