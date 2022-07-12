const { Router } = require("express");
const {
  getAllTournament,
  getTournament,
  createTournament,
  updateTournament,
  removeTournament,
} = require("../controllers/tournament");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getAllTournament).post(requireAdmin, createTournament);

router
  .route("/:id")
  .get(getTournament)
  .put(requireAdmin, updateTournament)
  .delete(requireAdmin, removeTournament);

module.exports = router;
