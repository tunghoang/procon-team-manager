const { Router } = require("express");
const { requireAdmin } = require("../middleware/authenticate");
const {
  getTeams,
  createTeam,
  signin,
  getTeam,
  updateTeam,
  removeTeam,
  changePassword,
} = require("../controllers/team");

const router = Router();

router.post("/signin", signin);
// router.post("/signup", createTeam);

router.route("/").get(getTeams);
router.route("/:id").get(getTeam);
router.route("/password").put(changePassword);

router.all("*", requireAdmin);
router.route("/").post(createTeam);
router.route("/:id").put(updateTeam).delete(removeTeam);

module.exports = router;
