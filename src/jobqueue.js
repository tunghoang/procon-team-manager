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

const API_STATUS = {};
const API_URLS = JSON.parse(process.env.SERVICE_APIS || '[]');
const JOB_CONCURRENT = process.env.JOB_CONCURRENT;

const answerQueue = new Queue("answer", options);

const addAnswer = (answer) => {
  return answerQueue.createJob(answer).save();
};

answerQueue.process(JOB_CONCURRENT, async (job, done) => {
  console.log(`Job ${job.id} starts processing`);
  const { scoreData, answerData, questionData, answerId } = job.data;
  const answer = await Answer.findByPk(answerId);

  let apiUrl = getServiceApi('random');
  for (let url of API_URLS) {
    if (!API_STATUS[url]) {
      API_STATUS[url] = 1;
      apiUrl = url;
      break;
    }
  }

  try {
    if (!answer) throw new Error("No answer found in database");
    scoreData.status = "pending";
    await answer.update({
      score_data: JSON.stringify(scoreData),
      answer_data: JSON.stringify(answerData),
    });

    const res = await got
      .post(`${apiUrl}/answer`, {
        json: {
          question: questionData,
          answer_data: answerData,
        },
      })
      .json();

    const newScoreData = { ...scoreData, ...res };
    newScoreData.final_score += newScoreData.resubmission_penalty;
    newScoreData.status = "done";

    await answer.update({
      score_data: JSON.stringify(newScoreData),
      answer_data: JSON.stringify(answerData),
    });
    return Promise.resolve(`Answer with ID ${answerId} done`);
  } catch (err) {
    scoreData.status = "failed";
    await answer.update({
      score_data: JSON.stringify(scoreData),
      answer_data: JSON.stringify(answerData),
    });
    return Promise.reject(err);
  } finally {
    API_STATUS[apiUrl] = 0;
  }
});

answerQueue.on("succeeded", (job, result) => {
  console.log(`Job ${job.id} succeeded with result:`, result);
});

answerQueue.on("failed", (job, err) => {
  console.log(`Job ${job.id} failed with error:`, err.message);
});

module.exports = { answerQueue, addAnswer };
