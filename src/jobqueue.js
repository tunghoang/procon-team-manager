const Queue = require("bee-queue");
const got = require("got");
const { Answer, Question } = require("./models");
const { getServiceApi } = require("./lib/common");

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

answerQueue.process(JOB_CONCURRENT, async (job, done) => {
  console.log(`Job ${job.id} starts processing`);
  const { scoreData, answerData, questionData, answerId } = job.data;
  const answer = await Answer.findByPk(answerId);
  try {
    scoreData.status = "pending";
    await answer.update({
      score_data: JSON.stringify(scoreData),
    });
    const res = await got
      .post(`${getServiceApi()}/answer`, {
        json: {
          question: questionData,
          answer_data: answerData,
        },
      })
      .json();

    console.log("Response from /answer:", res);
    // Merge with response LAST to ensure factors from Python service take precedence
    const newScoreData = {
      ...res,
      resubmission_count: scoreData.resubmission_count,
      status: "done"
    };
    console.log("Final score data:", newScoreData);

    await answer.update({
      score_data: JSON.stringify(newScoreData),
    });
    return Promise.resolve(`Answer with ID ${answerId} done`);
  } catch (err) {
    scoreData.status = "failed";
    await answer.update({
      score_data: JSON.stringify(scoreData),
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

module.exports = { answerQueue, addAnswer };
