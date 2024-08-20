const { Router } = require("express");
const {
  getAnswers,
  getAnswer,
  createAnswer,
  removeAnswer,
} = require("../controllers/answer");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getAnswers).post(createAnswer);
router.route("/:id").get(getAnswer);

router.all("*", requireAdmin);
router.route("/:id").delete(removeAnswer);

module.exports = router;
