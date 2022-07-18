const { Router } = require("express");
const {
  getMatches,
  createMatch,
  getMatch,
  updateMatch,
  removeMatch,
  removeTeamMatch,
  createTeamMatch,
} = require("../controllers/match");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getMatches);
router.route("/:id").get(getMatch);

router.all("*", requireAdmin);

router.route("/").post(createMatch);
router.route("/:id").put(updateMatch).delete(removeMatch);

router
  .route("/:matchId/team/:teamId")
  .post(createTeamMatch)
  .delete(removeTeamMatch);

module.exports = router;
