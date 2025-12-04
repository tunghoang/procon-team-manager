const { Router } = require("express");
const {
  getQuestions,
  createQuestion,
  getQuestion,
  updateQuestion,
  removeQuestion,
  regenerateQuestion,
  getOptimalAnswers,
  getTime,
} = require("../controllers/question");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();
router.route("/time").get(getTime);

router.route("/").get(getQuestions);
router.route("/:id").get(getQuestion);

router.all("*", requireAdmin);

router.route("/").post(createQuestion);
router.route("/:id/regenerate").put(regenerateQuestion);
router.route("/:id/optimal-answers").get(getOptimalAnswers);
router.route("/:id").put(updateQuestion).delete(removeQuestion);

module.exports = router;
