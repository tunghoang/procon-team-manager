const got = require("got");
const useController = require("../lib/useController");
const { Match, Question, Answer } = require("../models");
const { getAll, get, update, create, remove } = useController(Question);
const { promisify } = require("node:util");
const stream = require("node:stream");
const pipeline = promisify(stream.pipeline);
const { getFilter, safeJSONParse } = require("../lib/common");

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
  //await getAll(req, res, null, include, filterField);
  try {
    const filter = getFilter(req.query, filterField);
    const data = await Question.findAndCountAll({
      where: filter,
      attributes: { exclude: null },
      include,
    });

    // remove confidential data
    //if (!req.auth.is_admin) {
    //  for (let row of data.rows) {
    //    if (row.question_data != null && row.question_data.length > 0) {
    //      const qsData = safeJSONParse(row.question_data);
    //      if (qsData) {
    //        delete qsData.answer_data;
    //        delete qsData.divided_data;
    //        row.question_data = JSON.stringify(qsData);
    //      }
    //    } 
    //  }
    //}

    return res.status(200).json({ count: data.count, data: data.rows });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getQuestion = async (req, res) => {
  // await get(req, res, null, include);
  const id = req.params.id;
  try {
    const data = await Question.findByPk(id, {
      attributes: { exclude: null },
      include,
    });

    if (!data) {
      return res.status(404).json({
        message: `${Question.name} not found`,
      });
    }

    //if (!req.auth.is_admin) {
    //  if (data.question_data != null && data.question_data.length > 0) {
    //    const qsData = safeJSONParse(data.question_data);
    //    if (qsData) {
    //      delete qsData.answer_data;
    //      delete qsData.divided_data;
    //      data.question_data = JSON.stringify(qsData);
    //    }
    //  } 
    //}

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await Question.findByPk(id);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }
//    const response = await got
//      .put(`${process.env.SERVICE_API}/problem-data`, {
//        json: {
//          n_cards: req.body.n_cards,
//          n_parts: req.body.n_parts,
//          bonus_factor: req.body.bonus_factor,
//          penalty_per_change: req.body.penalty_per_change,
//          point_per_correct: req.body.point_per_correct,
//          question_uuid: JSON.parse(question.question_data).question_uuid,
//        },
//      })
//      .json();
//    req.body.question_data = JSON.stringify(response);
    await update(req, res);
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    console.log("updateQuestion", errMsg);
    return;
    return res.status(500).json({ message: errMsg });
  }
};

const removeQuestion = async (req, res) => {
  await remove(req, res);
};

const createQuestion = async (req, res) => {
  try {
    const match_id = req.body.match_id;
    if (!match_id) {
      return res.status(406).json({message: "match_id invalid"});
    }
    const response = await got
      .get(`${process.env.SERVICE_API}/board`, {
        searchParams: { 
          w: req.body.width || 32, 
          h: req.body.height || 32, 
          p: req.body.p || 2,
        },
      })
      .json();
//    const bonus_factor = req.body.bonus_factor;
//    const penalty_per_change = req.body.penalty_per_change;
//    const response = await got
//      .get(`${process.env.SERVICE_API}/problem-data`, {
//        searchParams: { 
//          n_cards: req.body.n_cards || 0, 
//          n_parts: req.body.n_parts || 2,
//          bonus_factor: isNaN(bonus_factor) ? 1. : bonus_factor,
//          penalty_per_change: isNaN(penalty_per_change) ? 2. : penalty_per_change,
//          point_per_correct: req.body.point_per_correct || 10
//        },
//      })
//      .json();
    req.body.question_data = JSON.stringify(response);
    await create(req, res);
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    console.log("createQuestion", errMsg);
    return;
    //return res.status(500).json({ message: errMsg });
  }
};

const downloadResource = async (req, res) => {
  try {
    const audioUrl = `${process.env.SERVICE_API}/download/resource`;
    return await pipeline(got.stream(audioUrl), res);
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    console.log("downloadResource", errMsg);
    return;
    // return res.status(500).json({ message: errMsg });
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
    let errMsg = error.response ? error.response.body : error.message;
    console.log("getQuestionAudio", errMsg);
    return;
    /*return res.status(500).json({ message: errMsg });*/
  }
};

const getDividedAudio = async (req, res) => {
  try {
    const { id } = req.params;
    const { id: teamId } = req.auth;
    const { uuid } = req.query;
    const question = await Question.findByPk(id);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }
    const questionData = JSON.parse(question.question_data);

    // TUNG modified
    //const audioUrl = `${process.env.SERVICE_API}/audio?type=divided&index=${index}&team_id=${teamId}&question_uuid=${questionData.question_uuid}`;
    const audioUrl = `${process.env.SERVICE_API}/audio?type=divided&uuid=${uuid}&team_id=${teamId}&question_uuid=${questionData.question_uuid}`;
    // End
    
    return await pipeline(got.stream(audioUrl), res);
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    console.log("getDividedAudio", errMsg);
    return;
    //return res.status(500).json({ message: errMsg });
  }
};
const createDividedData = async (req, res) => {
  try {
    const { id } = req.params;
    const { "new": _new } = req.body;
    const { id: teamId } = req.auth;
    const question = await Question.findByPk(id);
    if (!question)
      return res.status(404).json({ message: "Question not found" });

    const questionData = JSON.parse(question.question_data);
    const response = await got
      .post(`${process.env.SERVICE_API}/divided-data`, {
        json: {
          team_id: teamId,
          question_uuid: questionData.question_uuid,
          new: _new
        },
      })
      .json();
    return res.status(201).json({ data: response });
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    console.log("createDividedData", errMsg);
    return;
    //return res.status(500).json({ message: errMsg });
  }
};

const createDividedData_old = async (req, res) => {
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
    return res.status(201).json({ data: response });
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    console.log("createDividedData", errMsg);
    return;
    //return res.status(500).json({ message: errMsg });
  }
};

const getAudioFile = async (req, res) => {
  try {
    const { filename } = req.params;
    const audioUrl = `${process.env.SERVICE_API}/download/resource/${filename}`;
    return await pipeline(got.stream(audioUrl), res);
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    console.log("getAudioFile", errMsg);
    return;
    //return res.status(500).json({ message: errMsg });
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
