const got = require("got");
const useController = require("../lib/useController");
const { Match, Question, Answer } = require("../models");
const { getAll, get, update, create, remove } = useController(Question);
const { promisify } = require("node:util");
const stream = require("node:stream");
const pipeline = promisify(stream.pipeline);

const include = [
  {
    model: Match,
    as: "match",
  },
];

const filterField = {
  match_id: {
    field: "id",
    op: "like",
  },
  gt_id: {
    field: "id",
    op: "gt",
  },
  lt_id: {
    field: "id",
    op: "lt",
  },
  match_name: {
    field: "name",
    op: "like",
  },
  match: {
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
    eq_id: {
      field: "$match.id$",
      op: "eq",
    },
  },
};
const getQuestions = async (req, res) => {
  await getAll(req, res, null, include, filterField);
};

const getQuestion = async (req, res) => {
  await get(req, res, null, include, filterField);
};

const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await Question.findByPk(id);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }
    const response = await got
      .put(`${process.env.SERVICE_API}/problem-data`, {
        json: {
          n_cards: req.body.n_cards || 0,
          question_uuid: JSON.parse(question.question_data).question_uuid,
        },
      })
      .json();
    req.body.question_data = JSON.stringify(response);
    await update(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const removeQuestion = async (req, res) => {
  await remove(req, res);
};

const createQuestion = async (req, res) => {
  try {
    const response = await got
      .get(`${process.env.SERVICE_API}/problem-data`, {
        searchParams: { n_cards: req.body.n_cards || 0 },
      })
      .json();
    req.body.question_data = JSON.stringify(response);
    await create(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const downloadResource = async (req, res) => {
  try {
    const audioUrl = `${process.env.SERVICE_API}/download/resource`;
    return await pipeline(got.stream(audioUrl), res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getQuestionAudio = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await Question.findByPk(id);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }
    const questionData = JSON.parse(question.question_data);
    const audioUrl = `${process.env.SERVICE_API}/audio?type=question&question_uuid=${questionData.question_uuid}`;
    return await pipeline(got.stream(audioUrl), res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getDividedAudio = async (req, res) => {
  try {
    const { id } = req.params;
    const { id: teamId } = req.auth;
    const { index } = req.query;
    const question = await Question.findByPk(id);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }
    const questionData = JSON.parse(question.question_data);
    const audioUrl = `${process.env.SERVICE_API}/audio?type=divided&index=${index}&team_id=${teamId}&question_uuid=${questionData.question_uuid}`;
    return await pipeline(got.stream(audioUrl), res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createDividedData = async (req, res) => {
  try {
    const { id } = req.params;
    const { id: teamId } = req.auth;
    const question = await Question.findByPk(id);
    if (!question)
      return res.status(404).json({ message: "Question not found" });

    const questionData = JSON.parse(question.question_data);
    const response = await got
      .post(`${process.env.SERVICE_API}/divided-data`, {
        json: {
          team_id: teamId,
          n_divided: req.body.n_divided,
          question_uuid: questionData.question_uuid,
        },
      })
      .json();
    return res.status(200).json({ data: response });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAudioFile = async (req, res) => {
  try {
    const { filename } = req.params;
    const audioUrl = `${process.env.SERVICE_API}/download/resource/${filename}`;
    return await pipeline(got.stream(audioUrl), res);
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
  getQuestionAudio,
  getDividedAudio,
  createDividedData,
  downloadResource,
  getAudioFile,
};
