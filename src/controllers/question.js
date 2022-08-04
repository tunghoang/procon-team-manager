const got = require("got");
const useController = require("../lib/useController");
const { Match, Question } = require("../models");
const { getAll, get, update, create, remove } = useController(Question);

const getQuestions = async (req, res) => {
  const ignore = [];
  const include = [
    {
      model: Match,
      as: "match",
    },
  ];
  await getAll(req, res, ignore, include);
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
    return res.status(500).json({ message: error.message });
  }
};

const getAudioFile = async (req, res) => {
  try {
    const { fileName } = req.params;
    const audioUrl = `${process.env.SERVICE_API}/audio/${fileName}`;
    return got.stream(audioUrl).pipe(res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createDividedData = async (req, res) => {
  try {
    const { id } = req.params;
    const n_divided = Number(req.body.n_divided);
    const { id: teamId } = req.auth;
    const question = await Question.findByPk(id);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    if (!n_divided || n_divided < 2 || n_divided > 5) {
      throw new Error("Number of divided data required >= 2 and <= 5");
    }
    const questionData = JSON.parse(question.question_data);

    const response = await got
      .post(`${process.env.SERVICE_API}/divided-data`, {
        json: {
          team_id: teamId,
          n_divided,
          question_uuid: questionData.question_uuid,
        },
      })
      .json();
    return res.status(200).json({ data: response });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  removeQuestion,
  getAudioFile,
  createDividedData,
};
