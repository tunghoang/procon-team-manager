const { Router } = require("express");
const { requireAdmin } = require("../middleware/authenticate");
const {
  getTeams,
  createTeam,
  signin,
  getTeam,
  updateTeam,
  removeTeam,
} = require("../controllers/team");

const router = Router();

router.post("/signin", signin);
router.post("/signup", createTeam);

router.route("/").get(getTeams);
router.route("/:id").get(getTeam).put(updateTeam);

router.all("*", requireAdmin);
router.route("/").get(getTeams).post(createTeam);
router.route("/:id").get(getTeam).put(updateTeam).delete(removeTeam);

module.exports = router;
