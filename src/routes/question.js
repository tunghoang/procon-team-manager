const { Router } = require("express");
const { getQuestions, createQuestion, getQuestion, updateQuestion, removeQuestion } = require("../controllers/question");

const router = Router();

router.route('/')
  .get(getQuestions)
  .post(createQuestion)

router.route('/:id')
  .get(getQuestion)
  .put(updateQuestion)
  .delete(removeQuestion)

module.exports = router;
