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

router.route("/").get(getRounds).post(requireAdmin, createRound);

router
  .route("/:id")
  .get(getRound)
  .put(requireAdmin, updateRound)
  .delete(requireAdmin, removeRound);

module.exports = router;
