const { Router } = require("express");
const {
  getAnswers,
  getAnswer,
  createAnswer,
  removeAnswer,
  recalculateScores,
  exportAnswersToXlsx,
  getScoreSummary,
} = require("../controllers/answer");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getAnswers).post(createAnswer);

router.route("/export").get(requireAdmin, exportAnswersToXlsx);
router.route("/summary").get(requireAdmin, getScoreSummary);
router.route("/recalculate").post(requireAdmin, recalculateScores);

router.route("/:id").get(getAnswer).delete(requireAdmin, removeAnswer);

module.exports = router;
