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

router.route("/").get(getTournaments).post(requireAdmin, createTournament);

router
  .route("/:id")
  .get(getTournament)
  .put(requireAdmin, updateTournament)
  .delete(requireAdmin, removeTournament);

module.exports = router;
