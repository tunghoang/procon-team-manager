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
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getMatches);
router.route("/:id").get(getMatch);
router.route("/name/:name").get(getMatchByName);

router.all("*", requireAdmin);

router.route("/").post(createMatch);
router.route("/bulk-add-teams").post(bulkAddTeams);
router.route("/bulk-remove-teams").post(bulkRemoveTeams);
router.route("/:id").put(updateMatch).delete(removeMatch);

router
  .route("/:matchId/team/:teamId")
  .post(createTeamMatch)
  .delete(removeTeamMatch);

module.exports = router;
