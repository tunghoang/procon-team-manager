const { Router } = require("express");
const {
  getQuestions,
  createQuestion,
  getQuestion,
  updateQuestion,
  removeQuestion,
} = require("../controllers/question");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router
  .route("/")
  .get(requireAdmin, getQuestions)
  .post(requireAdmin, createQuestion);

router
  .route("/:id")
  .get(getQuestion)
  .put(requireAdmin, updateQuestion)
  .delete(requireAdmin, removeQuestion);

module.exports = router;
