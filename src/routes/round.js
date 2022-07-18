const { Router } = require("express");
const {
  getRounds,
  createRound,
  getRound,
  updateRound,
  removeRound,
} = require("../controllers/round");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getRounds);
router.route("/:id").get(getRound);

router.all("*", requireAdmin);
router.route("/").post(createRound);
router.route("/:id").put(updateRound).delete(removeRound);

module.exports = router;
