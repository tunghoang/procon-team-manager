const Queue = require("bee-queue");
const { Answer, Question } = require("./models");

const options = {
  removeOnSuccess: true,
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
};

const JOB_CONCURRENT = 1;

const answerQueue = new Queue("answer", options);

const addAnswer = (answer) => {
  return answerQueue.createJob(answer).save();
};

answerQueue.process(JOB_CONCURRENT, async (job, done) => {
  try {
    const { scoreData, answerData, questionId, answerId } = job.data;

    const question = await Question.findByPk(questionId);

    const res = await got
      .post(`${process.env.SERVICE_API}/answer`, {
        json: {
          question: JSON.parse(question.question_data),
          answer_data: answerData,
        },
      })
      .json();
    const newScoreData = { ...scoreData, ...res };
    newScoreData.final_score += newScoreData.resubmission_penalty;

    const answer = await Answer.findByPk(answerId);
    if (!answer) throw new Error("No answer found in database");

    await answer.update({
      score_data: JSON.stringify(newScoreData),
      answer_data: JSON.stringify(answerData),
    });
    done(null, `Answer with ID ${answerId} done`);
  } catch (err) {
    done(err);
  }
});

answerQueue.on("succeeded", (job, result) => {
  console.log(`Job ${job.id} succeeded:`, result);
});

answerQueue.on("error", (err) => {
  console.log("A queue error happened:", err.message);
});

module.exports = { answerQueue, addAnswer };
