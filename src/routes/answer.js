const { Router } = require("express");
const {
  getAnswers,
  getAnswer,
  createAnswer,
  removeAnswer,
  recalculateScores,
} = require("../controllers/answer");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getAnswers).post(createAnswer);
router.route("/:id").get(getAnswer);

router.all("*", requireAdmin);
router.route("/recalculate").post(recalculateScores);
router.route("/:id").delete(removeAnswer);

module.exports = router;
