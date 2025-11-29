const { Router } = require("express");
const {
  getAnswers,
  getAnswer,
  createAnswer,
  removeAnswer,
  recalculateScores,
  exportAnswersToXlsx,
} = require("../controllers/answer");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getAnswers).post(createAnswer);

router.route("/export").get(requireAdmin, exportAnswersToXlsx);
router.route("/recalculate").post(requireAdmin, recalculateScores);

router.route("/:id").get(getAnswer).delete(requireAdmin, removeAnswer);

module.exports = router;
