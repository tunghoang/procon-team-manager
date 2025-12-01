const got = require("got");
const crypto = require("crypto");
const XLSX = require("xlsx");
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
  eq_question_id: {
    field: "question_id",
    op: "eq",
  },
  match_id: {
    field: "id",
    op: "like",
  },
  match: {
    eq_id: {
      field: "$match.id$",
      op: "eq",
    },
    like_match_name: {
      field: "$match.name$",
      op: "like",
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
    like_question_name: {
      field: "$question.name$",
      op: "like",
    },
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
    like_team_name: {
      field: "$team.name$",
      op: "like",
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

  // Extract pagination params
  const page = parseInt(req.query.page) || 0; // 0-indexed page
  const limit = parseInt(req.query.limit) || 50; // default 50 items per page
  const offset = page * limit;

  // Extract score-related filters from query params
  const scoreFilters = {
    match_score: req.query.match_score,
    max_match_score: req.query.max_match_score,
    step: req.query.step,
    resub_count: req.query.resub_count,
  };

  // Remove pagination and score filters from query to avoid conflicts
  delete req.query.page;
  delete req.query.limit;
  delete req.query.match_score;
  delete req.query.max_match_score;
  delete req.query.step;
  delete req.query.resub_count;

  try {
    const filter = require("../lib/common").getFilter(req.query, filterField);

    // Fetch data with basic filters
    const data = await Answer.findAndCountAll({
      where: filter,
      attributes: { exclude: ignore },
      include,
    });

    // Parse answer_data and filter by score_data fields (client-side filtering)
    let filteredRows = data.rows;

    for (let row of filteredRows) {
      if (row.answer_data != null && row.answer_data.length > 0) {
        row.answer_data = JSON.parse(row.answer_data);
      }
    }

    // Apply score-based filters if provided
    if (Object.values(scoreFilters).some(v => v !== undefined)) {
      filteredRows = filteredRows.filter(row => {
        try {
          const scoreData = JSON.parse(row.score_data || "{}");

          // Check match_score filter
          if (scoreFilters.match_score) {
            const matchScore = scoreData.match_count?.toString() || "";
            if (!matchScore.includes(scoreFilters.match_score)) {
              return false;
            }
          }

          // Check max_match_score filter
          if (scoreFilters.max_match_score) {
            const maxMatchScore = scoreData.max_match_count?.toString() || "";
            if (!maxMatchScore.includes(scoreFilters.max_match_score)) {
              return false;
            }
          }

          // Check step filter
          if (scoreFilters.step) {
            const step = scoreData.step_count?.toString() || "";
            if (!step.includes(scoreFilters.step)) {
              return false;
            }
          }

          // Check resub_count filter
          if (scoreFilters.resub_count) {
            const resubCount = scoreData.resubmission_count?.toString() || "";
            if (!resubCount.includes(scoreFilters.resub_count)) {
              return false;
            }
          }

          return true;
        } catch (e) {
          return false;
        }
      });
    }

    // Get total count after filtering
    const totalCount = filteredRows.length;

    // Apply pagination
    const paginatedRows = filteredRows.slice(offset, offset + limit);

    return res.status(200).json({
      count: totalCount, // Total count of filtered results
      data: paginatedRows, // Paginated data
      page: page, // Current page
      limit: limit, // Items per page
      totalPages: Math.ceil(totalCount / limit), // Total pages
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
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

const exportAnswersToXlsx = async (req, res) => {
  try {
    const { round_id: roundId } = req.query;

    if (!roundId) {
      return res.status(400).json({ message: "round_id is required" });
    }

    // Get all answers for the given round with includes
    const answers = await Answer.findAll({
      include: [
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
      ],
      where: {
        "$match.round_id$": roundId,
      },
    });

    if (!answers.length) {
      return res.status(404).json({
        message: "No answers found for this round",
      });
    }

    // Group data by match then by team
    const groupedData = {};

    answers.forEach((answer) => {
      const matchName = answer.match?.name || "Unknown Match";
      const teamName = answer.team?.name || "Unknown Team";
      const questionName = answer.question?.name || "Unknown Question";
      const scoreData = JSON.parse(answer.score_data || "{}");

      if (!groupedData[matchName]) {
        groupedData[matchName] = {};
      }

      if (!groupedData[matchName][teamName]) {
        groupedData[matchName][teamName] = {
          team: teamName,
          questions: {},
        };
      }

      groupedData[matchName][teamName].questions[questionName] = {
        match_score: scoreData.match_count ?? "NA",
        step: scoreData.step_count ?? "NA",
        resub: scoreData.resubmission_count ?? "NA",
      };
    });

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Process each match
    Object.keys(groupedData).forEach((matchName) => {
      const teams = groupedData[matchName];
      const teamNames = Object.keys(teams);

      // Get all unique question names
      const questionNames = new Set();
      Object.values(teams).forEach((team) => {
        Object.keys(team.questions).forEach((q) => questionNames.add(q));
      });
      const sortedQuestions = Array.from(questionNames).sort();

      // Build sheet data
      const sheetData = [];

      // Header row 1: Main headers
      const header1 = ["STT", "Team"];
      sortedQuestions.forEach((q) => {
        header1.push(q, "", ""); // Each question takes 3 columns
      });
      header1.push("Sum", "", "");
      sheetData.push(header1);

      // Header row 2: Sub headers
      const header2 = ["", ""];
      sortedQuestions.forEach(() => {
        header2.push("Match score", "Step", "Resub");
      });
      header2.push("Match score", "Step", "Resub");
      sheetData.push(header2);

      // Data rows
      teamNames.forEach((teamName, idx) => {
        const team = teams[teamName];
        const row = [idx + 1, teamName];

        let totalMatchScore = 0;
        let totalStep = 0;
        let totalResub = 0;

        sortedQuestions.forEach((questionName) => {
          const questionData = team.questions[questionName] || {
            match_score: "",
            step: "",
            resub: "",
          };

          row.push(
            questionData.match_score,
            questionData.step,
            questionData.resub
          );

          if (typeof questionData.match_score === "number") {
            totalMatchScore += questionData.match_score;
          }
          if (typeof questionData.step === "number") {
            totalStep += questionData.step;
          }
          if (typeof questionData.resub === "number") {
            totalResub += questionData.resub;
          }
        });

        // Add sum columns
        row.push(totalMatchScore, totalStep, totalResub);
        sheetData.push(row);
      });

      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Merge cells for main headers
      const merges = [];
      let colIdx = 2; // Start after STT and Team
      sortedQuestions.forEach((q) => {
        merges.push({
          s: { r: 0, c: colIdx },
          e: { r: 0, c: colIdx + 2 },
        });
        colIdx += 3;
      });
      // Merge Sum header
      merges.push({
        s: { r: 0, c: colIdx },
        e: { r: 0, c: colIdx + 2 },
      });
      // Merge STT and Team headers
      merges.push({ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } });
      merges.push({ s: { r: 0, c: 1 }, e: { r: 1, c: 1 } });

      ws["!merges"] = merges;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, matchName.substring(0, 31)); // Excel sheet name limit
    });

    // Generate buffer
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    // Send file
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=answers_round_${roundId}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(excelBuffer);
  } catch (error) {
    console.error("Export error:", error);
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAnswers,
  getAnswer,
  createAnswer,
  removeAnswer,
  recalculateScores,
  exportAnswersToXlsx,
};
