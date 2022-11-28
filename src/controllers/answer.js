const got = require("got");
const { Answer, Question, Team, Match } = require("../models");
const useController = require("../lib/useController");
const { getAll, create, remove } = useController(Answer);
const { promisify } = require("node:util");
const stream = require("node:stream");
const { checkValidAnswer } = require("../lib/common");
const pipeline = promisify(stream.pipeline);

const include = [
  {
    model: Question,
    as: "question",
  },
  {
    model: Team,
    as: "team",
    attributes: ["id", "name"],
  },
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
  match: {
    eq_id: {
      field: "$match.id$",
      op: "eq",
    },
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
  },
  question: {
    match_name: {
      field: "$question.name$",
      op: "like",
    },
  },
  team: {
    eq_id: {
      field: "$team.id$",
      op: "eq",
    },
    match_name: {
      field: "$team.name$",
      op: "like",
    },
  },
};

const getAnswers = async (req, res) => {
  if (!req.auth.is_admin)
    req.query.team = {
      ...req.query.team,
      eq_id: req.auth.id,
    };
  await getAll(req, res, null, include, filterField);
};
const getAnswer = async (req, res) => {
//<<<<<<< HEAD
  // if (!req.auth.is_admin)
  //   req.query.team = {
  //     ...req.query.team,
  //     eq_id: req.auth.id,
  //   };
  // await get(req, res, null, include, filterField);
  
  const id = req.params.id;
  try {
    const data = await Answer.findByPk(id, {include});

    if (!data || (!req.auth.is_admin && req.auth.id !== data.team_id)) {
      return res.status(404).json({
        message: `${Answer.name} not found`,
      });
    }

    return res.status(200).json(data);
/*=======
  const id = req.params.id;
  try {
    const answer = await Answer.findByPk(id, {
      include,
    });
    if (!answer) {
      return res.status(404).json({
        message: `Answer not found`,
      });
    }

    if (answer.team_id !== req.auth.id) {
      return res.status(405).json({
        message: "Not Allowed",
      });
    }

    return res.status(200).json(answer);
>>>>>>> e7d8797e62078c77b73cfce0842a0ac36e13817b */
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const removeAnswer = async (req, res) => {
  await remove(req, res);
};

const createAnswer = async (req, res) => {
  try {
    const { is_admin } = req.auth;
    const teamId =
      req.body.team_id && is_admin ? req.body.team_id : req.auth.id;
    let { question_id, answer_data } = req.body;
    answer_data = answer_data.sort();
    const question = await Question.findByPk(question_id, {
      include: [
        {
          model: Match,
          as: "match",
        },
      ],
    });
    if (!question)
      return res.status(404).json({ message: "Question not found" });

    if (!is_admin) {
      let message = await checkValidAnswer(question, teamId);
      if (message) return res.status(405).json({ message });
    }

    const answer = await Answer.findOne({
      where: {
        team_id: teamId,
        question_id,
      },
    });
    if (answer) return res.status(400).json({ message: "Answer exsited" });

    const response = await got
      .post(`${process.env.SERVICE_API}/answer-data`, {
        json: {
          question_uuid: JSON.parse(question.question_data).question_uuid,
          answer_data,
          team_id: teamId,
        },
      })
      .json();

    //if (response.score_data?.total) delete response.score_data.total;
    //if (response.score_data?.correct) delete response.score_data.correct;

    if (response.divided_data && response.divided_data?.length)
      response.divided_data = response.divided_data.length;

    req.body.score_data = JSON.stringify(response);
    req.body.answer_data = JSON.stringify(answer_data);
    req.body.team_id = teamId;
    req.body.match_id = question.match_id;
    await create(req, res);
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(500).json({ message: errMsg });
  }
};

const updateAnswer = async (req, res) => {
  try {
    const { id: teamId, is_admin } = req.auth;
    const { id: answerId } = req.params;
    let { answer_data } = req.body;
    answer_data = answer_data.sort();
    const answer = await Answer.findByPk(answerId, {
      include: [
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
      ],
    });
    if (!answer) return res.status(404).json({ message: "Answer not found" });

    if (!is_admin) {
      let message = await checkValidAnswer(answer.question, teamId);
      if (answer.team_id !== teamId) message = "Team not allowed";
      if (message) return res.status(405).json({ message });
    }

    const response = await got
      .post(`${process.env.SERVICE_API}/answer-data`, {
        json: {
          question_uuid: JSON.parse(answer.question.question_data)
            .question_uuid,
          answer_data,
          team_id: teamId,
        },
      })
      .json();
    if (response.score_data?.total) delete response.score_data.total;
    if (response.score_data?.correct) delete response.score_data.correct;
    if (response.divided_data && response.divided_data?.length)
      response.divided_data = response.divided_data.length;
    await answer.update({
      score_data: JSON.stringify(response),
      answer_data: JSON.stringify(answer_data),
    });
    return res.status(200).json({
      id: answer.id,
    });
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(500).json({ message: errMsg });
  }
};

const getAnswerAudio = async (req, res) => {
  try {
    const { id: teamId, is_admin } = req.auth;
    const { id: answerId } = req.params;
    const answer = await Answer.findByPk(answerId);
    if (!answer) return res.status(404).json({ message: "Answer not found" });
    if (!is_admin && answer.team_id !== teamId)
      return res.status(405).json({ message: "Not permited" });
    const scoreData = JSON.parse(answer.score_data);
    const audioUrl = `${process.env.SERVICE_API}/audio?type=answer&answer_uuid=${scoreData.answer_uuid}`;
    return await pipeline(got.stream(audioUrl), res);
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(500).json({ message: errMsg });
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
