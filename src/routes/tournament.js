const { Router } = require("express");
const {
  getTournaments,
  getTournament,
  createTournament,
  updateTournament,
  removeTournament,
} = require("../controllers/tournament");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getTournaments);
router.route("/:id").get(getTournament);

router.all("*", requireAdmin);
router.route("/").post(requireAdmin, createTournament);
router.route("/:id").put(updateTournament).delete(removeTournament);

module.exports = router;
