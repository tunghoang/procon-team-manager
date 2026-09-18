const Queue = require("bee-queue");
const got = require("got");
const { Answer } = require("./models");
const { getServiceApi, serviceAdminToken } = require("./lib/common");

const options = {
  removeOnSuccess: true,
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
};

const JOB_CONCURRENT = process.env.JOB_CONCURRENT || 1;

const answerQueue = new Queue("answer", options);

const addAnswer = (answer) => {
  return answerQueue.createJob(answer).save();
};

// The HEXUDON engine has no per-answer scoring endpoint -- /game/actions
// already validates and stores each day's plan synchronously (see
// answer.js#createAnswer). This job's only job is to pull the team's
// up-to-date standing from the engine's live match state afterwards, for
// display.
answerQueue.process(JOB_CONCURRENT, async (job, done) => {
  console.log(`Job ${job.id} starts processing`);
  const { gameId, teamId, answerId } = job.data;
  const answer = await Answer.findByPk(answerId);
  // The row can be gone by the time the job runs (question deleted, answers
  // cascaded). Fail the job rather than dereferencing null in both branches.
  if (!answer) throw new Error(`answer ${answerId} no longer exists`);
  try {
    const state = await got
      .get(`${getServiceApi()}/game/state`, {
        searchParams: { game_id: gameId },
        headers: { Authorization: `Bearer ${serviceAdminToken()}` },
      })
      .json();

    const teamState = state.teams?.[teamId] ?? {};
    const distinctTypes = Array.isArray(teamState.distinct_types)
      ? teamState.distinct_types.length
      : 0;
    const totalServings = teamState.total_servings ?? 0;
    const previousScoreData = JSON.parse(answer.score_data || "{}");
    const newScoreData = {
      ...previousScoreData,
      day: state.day,
      distinct_types: teamState.distinct_types,
      total_servings: totalServings,
      // HEXUDON has no "pairs matched / operations" score; map its real win
      // metrics onto the columns the answers/export/summary readers expect
      // (match_count / step_count) so those views show meaningful numbers:
      // primary = distinct udon types, secondary = total servings.
      match_count: distinctTypes,
      step_count: totalServings,
      status: "done",
    };
    console.log("Refreshed score data:", newScoreData);

    await answer.update({
      score_data: JSON.stringify(newScoreData),
    });
    return Promise.resolve(`Answer with ID ${answerId} refreshed`);
  } catch (err) {
    const previousScoreData = JSON.parse(answer.score_data || "{}");
    await answer.update({
      score_data: JSON.stringify({ ...previousScoreData, status: "failed" }),
    });
    return Promise.reject(err);
  }
});

answerQueue.on("succeeded", (job, result) => {
  console.log(`Job ${job.id} succeeded with result:`, result);
});

answerQueue.on("failed", (job, err) => {
  console.log(`Job ${job.id} failed with error:`, err.message);
});

// bee-queue emits "error" for QUEUE-level trouble (Redis unreachable, a lost
// connection, a Lua script failure) rather than per-job failures. An
// EventEmitter with no "error" listener throws, which took the WHOLE API
// process down -- a Redis blip is not a reason to stop serving matches, and
// this queue only refreshes a dashboard number.
answerQueue.on("error", (err) => {
  console.error("answer queue error (ignored):", err?.message || err);
});

module.exports = { answerQueue, addAnswer };
