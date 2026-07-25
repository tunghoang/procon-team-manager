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
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getRounds);
router.route("/:id").get(getRound);

router.all("*", requireAdmin);
// ADMIN ONLY (below the guard): a cross-match leaderboard exposes every team's
// standing, including matches the caller is not part of. Declared before
// "/:id" PUT/DELETE only for readability -- Express matches on method + path.
router.route("/:id/hexudon-summary").get(getRoundHexudonSummary);
router.route("/:id/hexudon-summary/export").get(exportRoundHexudonSummary);
router.route("/").post(createRound);
router.route("/:id").put(updateRound).delete(removeRound);

module.exports = router;
