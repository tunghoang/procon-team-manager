const { Router } = require("express");
const {
  getQuestions,
  createQuestion,
  bulkCreateQuestions,
  getQuestion,
  updateQuestion,
  removeQuestion,
  bulkDeleteQuestions,
  regenerateQuestion,
  regenerateWithParams,
  getOptimalAnswers,
  getTime,
  setQuestionAutoReset,
} = require("../controllers/question");
const { requireStaff } = require("../middleware/authenticate");

const router = Router();
router.route("/time").get(getTime);

router.route("/").get(getQuestions);
router.route("/:id").get(getQuestion);

// Staff (superadmin or group manager). A manager may only touch questions in
// its own group's matches -- enforced per handler in the controller.
router.all("*", requireStaff);

router.route("/").post(createQuestion);
router.route("/bulk-create").post(bulkCreateQuestions);
router.route("/bulk-delete").post(bulkDeleteQuestions);
router.route("/:id/regenerate").put(regenerateQuestion);
router.route("/:id/regenerate-with-params").put(regenerateWithParams);
router.route("/:id/optimal-answers").get(getOptimalAnswers);
// Auto-reset cron: {minutes} (0 = off). See lib/autoReset.js.
router.route("/:id/auto-reset").put(setQuestionAutoReset);
router.route("/:id").put(updateQuestion).delete(removeQuestion);

module.exports = router;
