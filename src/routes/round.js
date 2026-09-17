const { Router } = require("express");
const {
  getRounds,
  createRound,
  getRound,
  updateRound,
  removeRound,
} = require("../controllers/round");
const {
  getRoundHexudonSummary,
  exportRoundHexudonSummary,
} = require("../controllers/hexudonSummary");
const { requireAdmin, requireStaff } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getRounds);
router.route("/:id").get(getRound);

// STAFF ONLY: a cross-match leaderboard exposes every team's standing,
// including matches the caller is not part of. A group manager gets the round
// narrowed to its own group's matches (controller).
router.route("/:id/hexudon-summary").get(requireStaff, getRoundHexudonSummary);
router
  .route("/:id/hexudon-summary/export")
  .get(requireStaff, exportRoundHexudonSummary);

// Rounds themselves are the organiser's structure: superadmin only.
router.all("*", requireAdmin);
router.route("/").post(createRound);
router.route("/:id").put(updateRound).delete(removeRound);

module.exports = router;
