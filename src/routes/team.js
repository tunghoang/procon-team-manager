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
const { Team } = require("../models");

const validateTeam = async (req, res, next) => {
  const { id } = req.auth;
  const team = await Team.findByPk(id);
  if (!team.is_admin && team.id !== Number(req.params.id)) {
    return res.status(401).json({ error: "Team unauthorized" });
  }

  next();
};

const router = Router();

router.post("/signin", signin);
router.post("/signup", signup);

router.route("/").get(getTeams).post(requireAdmin, createTeam);
router
  .route("/:id")
  .get(validateTeam, getTeam)
  .put(requireAdmin, updateTeam)
  .delete(requireAdmin, removeTeam);

module.exports = router;
