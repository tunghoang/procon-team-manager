const { Router } = require("express");
const {
  getQuestions,
  createQuestion,
  getQuestion,
  updateQuestion,
  removeQuestion,
  createDividedData,
} = require("../controllers/question");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();
router.route("/").get(getQuestions);
router.route("/:id").get(getQuestion);
router.post("/:id/divided-data", createDividedData);

router.all("*", requireAdmin);
router.route("/").post(createQuestion);
router.route("/:id").put(updateQuestion).delete(removeQuestion);

module.exports = router;
