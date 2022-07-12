const Question = require("../models/question");
const useController = require("./useController");
const { getAll, get, update, create, remove } = useController(Question);
const getQuestions = async (req, res) => {
  await getAll(req, res);
};

const getQuestion = async (req, res) => {
  await get(req, res);
};

const createQuestion = async (req, res) => {
  try {
    const question_data = await fetch(process.env.SERVICE_API, {
      method: "GET",
    }).json();
    req.body.question_data = question_data;
    await create(req, res);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const updateQuestion = async (req, res) => {
  await update(req, res);
};

const removeQuestion = async (req, res) => {
  await remove(req, res);
};

module.exports = {
  getQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  removeQuestion,
};
