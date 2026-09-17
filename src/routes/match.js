const { Router } = require("express");
const {
  getMatches,
  getMatchByName,
  createMatch,
  getMatch,
  updateMatch,
  removeMatch,
  removeTeamMatch,
  createTeamMatch,
  bulkAddTeams,
  bulkRemoveTeams,
} = require("../controllers/match");
const { getMatchHexudonSummary } = require("../controllers/hexudonSummary");
const { requireStaff } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getMatches);
router.route("/:id").get(getMatch);
router.route("/name/:name").get(getMatchByName);

// Staff (superadmin or group manager) from here down. A manager is confined
// to its own group's matches inside each controller (lib/scope.js).
router.all("*", requireStaff);

// Per-match HEXUDON standings: every question this match owns, aggregated per
// team. Staff only, like the round-level view -- it exposes every team's
// standing, not just the caller's.
router.route("/:id/hexudon-summary").get(getMatchHexudonSummary);

router.route("/").post(createMatch);
router.route("/bulk-add-teams").post(bulkAddTeams);
router.route("/bulk-remove-teams").post(bulkRemoveTeams);
router.route("/:id").put(updateMatch).delete(removeMatch);

router
  .route("/:matchId/team/:teamId")
  .post(createTeamMatch)
  .delete(removeTeamMatch);

module.exports = router;
