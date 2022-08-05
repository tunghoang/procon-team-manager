const { Router } = require("express");
const {
  getAnswers,
  getAnswer,
  createAnswer,
  updateAnswer,
  removeAnswer,
  getAnswerAudio,
} = require("../controllers/answer");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getAnswers).post(createAnswer);
router.route("/:id").get(getAnswer).put(updateAnswer);
router.route("/:id/audio").get(getAnswerAudio);

router.all("*", requireAdmin);
router.route("/:id").delete(removeAnswer);

module.exports = router;
