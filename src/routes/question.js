const { Router } = require("express");
const {
  getQuestions,
  createQuestion,
  getQuestion,
  updateQuestion,
  removeQuestion,
  getAudioFile,
  createDividedData,
} = require("../controllers/question");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/:id").get(getQuestion);
router.post("/:id/divided-data", createDividedData);
router.get("/audio/:fileName", getAudioFile);

router.all("*", requireAdmin);
router.route("/").get(getQuestions).post(createQuestion);
router.route("/:id").put(updateQuestion).delete(removeQuestion);

module.exports = router;
