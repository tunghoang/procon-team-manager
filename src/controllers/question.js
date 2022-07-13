// const fetch = require("node-fetch");
const got = require("got");
const Question = require("../models/question");
const useController = require("./useController");
const { getAll, get, update, create, remove } = useController(Question);

const getQuestions = async (req, res) => {
  return await getAll(req, res);
};

const getQuestion = async (req, res) => {
  return await get(req, res);
};

const updateQuestion = async (req, res) => {
  return await update(req, res);
};

const removeQuestion = async (req, res) => {
  return await remove(req, res);
};

const createQuestion = async (req, res) => {
  try {
    const response = await got.get(`${process.env.SERVICE_API}/problem-data`);
    req.body.question_data = JSON.stringify(response.body);
    return await create(req, res);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const getAudio = async (req, res) => {
  try {
    const { fileName } = req.params;
    const audioUrl = `${process.env.SERVICE_API}/audio/${fileName}`;
    return got.stream(audioUrl).pipe(res);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const getDividedData = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await Question.findByPk(id);
    if (!question) {
      return res.status(400).json({ error: "Question not found" });
    }
    const response = await got.post(`${process.env.SERVICE_API}/divided-data`, {
      json: {},
    });
    const dividedData = JSON.stringify(response.body);
    return res.status(200).json({ data: dividedData });
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
  getAudio,
  getDividedData,
};
