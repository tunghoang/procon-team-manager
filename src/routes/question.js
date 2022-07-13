const { Router } = require("express");
const {
  getQuestions,
  createQuestion,
  getQuestion,
  updateQuestion,
  removeQuestion,
  getAudio,
  getDividedData,
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

router.get("/:id/divided-data", getDividedData);

router.get("/audio/:fileName", getAudio);

module.exports = router;
