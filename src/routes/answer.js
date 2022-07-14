const { Router } = require("express");
const {
  getAnswers,
  getAnswer,
  createAnswer,
  updateAnswer,
  removeAnswer,
} = require("../controllers/answer");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getAnswers).post(createAnswer);

router
  .route("/:id")
  .get(getAnswer)
  .put(updateAnswer)
  .delete(requireAdmin, removeAnswer);

module.exports = router;
