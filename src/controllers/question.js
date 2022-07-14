const got = require("got");
const Question = require("../models/question");
const useController = require("./useController");
const { getAll, get, update, create, remove } = useController(Question);

const getQuestions = async (req, res) => {
  await getAll(req, res);
};

const getQuestion = async (req, res) => {
  await get(req, res);
};

const updateQuestion = async (req, res) => {
  await update(req, res);
};

const removeQuestion = async (req, res) => {
  await remove(req, res);
};

const createQuestion = async (req, res) => {
  try {
    const response = await got
      .get(`${process.env.SERVICE_API}/problem-data`)
      .json();
    req.body.question_data = JSON.stringify(response);
    await create(req, res);
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

const createDividedData = async (req, res) => {
  try {
    const { id } = req.params;
    const { n_divided } = req.body;
    const question = await Question.findByPk(id);
    if (!question) {
      return res.status(400).json({ error: "Question not found" });
    }

    if (n_divided < 1 || n_divided > 5) {
      throw new Error("Number of divided data required >= 1 and <= 5");
    }
    const questionData = JSON.parse(question.question_data);

    const response = await got
      .post(`${process.env.SERVICE_API}/divided-data`, {
        json: {
          n_divided,
          question_uuid: questionData.question_uuid,
        },
      })
      .json();
    return res.status(200).json({ data: response });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  removeQuestion,
  getAudio,
  createDividedData,
};
