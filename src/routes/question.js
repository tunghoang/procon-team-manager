const { Router } = require("express");
const {
  getQuestions,
  createQuestion,
  getQuestion,
  updateQuestion,
  removeQuestion,
  createDividedData,
  getQuestionAudio,
} = require("../controllers/question");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();
router.route("/").get(getQuestions);
router.route("/:id").get(getQuestion);
router.post("/:id/divided-data", createDividedData);
router.get("/:id/audio/problem-data", getQuestionAudio);

router.all("*", requireAdmin);
router.route("/").post(createQuestion);
router.route("/:id").put(updateQuestion).delete(removeQuestion);

module.exports = router;
