const { signin, signup } = require("../controllers/team");
const { Router } = require("express");
const { requireAdmin } = require("../middleware/authenticate");
const {
  getTeams,
  createTeam,
  getTeam,
  updateTeam,
  removeTeam,
} = require("../controllers/team");

const router = Router();

router.post("/signin", signin);
router.post("/signup", signup);

router.use(requireAdmin);
router.route("/").get(getTeams).post(createTeam);
router.route("/:id").get(getTeam).put(updateTeam).delete(removeTeam);

module.exports = router;
