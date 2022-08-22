const { Router } = require("express");
const {
  getQuestions,
  createQuestion,
  getQuestion,
  updateQuestion,
  removeQuestion,
  createDividedData,
  getQuestionAudio,
  getDividedAudio,
  downloadResource,
  getAudioFile,
} = require("../controllers/question");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();
router.route("/download/resource").get(downloadResource);
router.route("/download/resource/:filename").get(getAudioFile);
router.route("/").get(getQuestions);
router.route("/:id").get(getQuestion);
router.post("/:id/divided-data", createDividedData);

router.get("/:id/audio/problem-data", getQuestionAudio);
router.get("/:id/audio/divided-data", getDividedAudio);

router.all("*", requireAdmin);
router.route("/").post(createQuestion);
router.route("/:id").put(updateQuestion).delete(removeQuestion);

module.exports = router;
