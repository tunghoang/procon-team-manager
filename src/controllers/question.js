const Question = require("../models/question");

const getQuestions = async (req, res) => {
  try {
    const questions = await Question.findAll();
    return res.status(200).json({ data: questions });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const getQuestion = async (req, res) => {
  const { id } = req.params;
  try {
    const question = await Question.findByPk(id);
    return res.status(200).json(question);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const createQuestion = async (req, res) => {
  const { start_time, end_time, match_id } = req.body;
  try {
    const question = await Question.create({
      start_time,
      end_time,
      match_id,
    });
    const res = await fetch(process.env.SERVICE_API, {
      method: "GET",
    }).json();
    return res.status(200).json(question);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const updateQuestion = async (req, res) => {
  const { id } = req.params;
  const { start_time, end_time } = req.body;
  try {
    const question = await Question.findByPk(id);
    if (!question) {
      return res.status(400).json({
        error: "Question not found",
      });
    }
    await question.update({
      start_time,
      end_time,
    });
    return res.status(200).json(question);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const removeQuestion = async (req, res) => {
  const { id } = req.params;
  try {
    const question = await Question.findByPk(id);
    await question.destroy();
    return res.status(200).json(question);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

module.exports = {
  getQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  removeQuestion,
};
