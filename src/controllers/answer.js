const got = require("got");
const crypto = require("crypto");
const useController = require("../lib/useController");
const { Answer, Question, Team, Match, Round } = require("../models");
const { getAll, create, remove } = useController(Answer);
const { checkValidAnswer, getServiceApi } = require("../lib/common");
const { addAnswer } = require("../jobqueue");

const include = [
  {
    model: Question,
    as: "question",
    attributes: ["id", "name", "match_id"],
  },
  {
    model: Team,
    as: "team",
    attributes: ["id", "name"],
  },
  {
    model: Match,
    as: "match",
    include: [
      {
        model: Round,
        as: "round",
        attributes: ["id", "name"],
      },
    ],
  },
];

const ignore = ["answer_data"];

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
  await getAll(req, res, ignore, include, filterField);
};

const getAnswer = async (req, res) => {
  const id = req.params.id;
  try {
    const data = await Answer.findByPk(id, {
      include,
    });

    if (!data || (!req.auth.is_admin && req.auth.id !== data.team_id)) {
      return res.status(404).json({
        message: `${Answer.name} not found`,
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const removeAnswer = async (req, res) => {
  await remove(req, res);
};

const rateLimit = {};

const hash = (name) => {
  return crypto.createHash('md5').update(name).digest('hex');
}

const createAnswer = async (req, res) => {
  try {
    const teamId = req.auth.id;
    const { question_id: questionId, answer_data: answerData } = req.body;

    const question = await Question.findByPk(questionId, {
      include: [
        {
          model: Match,
          as: "match",
        },
      ],
    });
    if (!question)
      return res.status(404).json({ message: "Question not found" });

    const message = await checkValidAnswer(question.match, teamId);
    if (message) return res.status(405).json({ message });

    // rate limit
    const RATE_WINDOW = 3 * 1000; // 3 seconds
    const rateId = `${hash(teamId.toString())}:${hash(questionId.toString())}`;

    if (rateLimit[rateId]) {
      return res.status(429).json({
        message: `Rate limit exceeded: 1 request every ${RATE_WINDOW / 1000}s`
      });
    }

    rateLimit[rateId] = true;

    setTimeout(() => {
      delete rateLimit[rateId];
    }, RATE_WINDOW);
    // end rate limit

    const questionData = JSON.parse(question.question_data);

    const response = await got
      .post(`${getServiceApi()}/validate`, {
        json: {
          question: questionData,
          answer_data: answerData,
        },
      })
      .json();

    let answer = await Answer.findOne({
      where: {
        team_id: teamId,
        question_id: questionId,
      },
    });
    const scoreData = {
      ...JSON.parse(answer?.score_data || "{}"),
      ...response,
    };
    scoreData.resubmission_count = (scoreData.resubmission_count ?? -1) + 1;
    scoreData.status = "pending";

    const submittedTime = new Date();

    if (!answer) {
      req.body.score_data = JSON.stringify(scoreData);
      req.body.answer_data = JSON.stringify(answerData);
      req.body.submitted_time = submittedTime;
      req.body.team_id = teamId;
      req.body.match_id = question.match_id;
      answer = await Answer.create(req.body);
    } else {
      await answer.update({
        score_data: JSON.stringify(scoreData),
        answer_data: JSON.stringify(answerData),
        submitted_time: submittedTime
      });
    }

    // add to answer queue
    addAnswer({
      scoreData,
      answerData,
      questionData,
      answerId: answer.id,
    });

    return res.status(200).json({
      id: answer.id,
    });
  } catch (error) {
    let errMsg = error.response ? error.response.body : error.message;
    return res.status(500).json({ message: errMsg });
  }
};

const recalculateScores = async (req, res) => {
  console.log(req.body);
  try {
    const { round_id: roundId } = req.body;

    if (!roundId) {
      return res.status(400).json({ message: "round_id is required" });
    }

    // Get all answers for the given round
    const answers = await Answer.findAll({
      include: [
        {
          model: Question,
          as: "question",
        },
        {
          model: Match,
          as: "match",
          where: { round_id: roundId },
        },
      ],
    });

    if (!answers.length) {
      return res.status(200).json({
        message: "No answers found for this round",
        count: 0
      });
    }

    let successCount = 0;
    let failCount = 0;

    for (const answer of answers) {
      try {
        const questionData = JSON.parse(answer.question.question_data);
        const answerData = JSON.parse(answer.answer_data);
        const currentScoreData = JSON.parse(answer.score_data || "{}");

        // Add to job queue for recalculation
        addAnswer({
          scoreData: {
            ...currentScoreData,
            status: "pending",
          },
          answerData,
          questionData,
          answerId: answer.id,
        });

        successCount++;
      } catch (err) {
        console.error(`Failed to queue answer ${answer.id}:`, err.message);
        failCount++;
      }
    }

    return res.status(200).json({
      message: `Recalculation queued for ${successCount} answers`,
      success: successCount,
      failed: failCount,
      total: answers.length,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAnswers,
  getAnswer,
  createAnswer,
  removeAnswer,
  recalculateScores,
};
