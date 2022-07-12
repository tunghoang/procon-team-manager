const { Router } = require("express");
const {
  getMatchs,
  createMatch,
  getMatch,
  updateMatch,
  removeMatch,
} = require("../controllers/match");
const { requireAdmin } = require("../middleware/authenticate");

const router = Router();

router.route("/").get(getMatchs).post(requireAdmin, createMatch);

router
  .route("/:id")
  .get(getMatch)
  .put(requireAdmin, updateMatch)
  .delete(requireAdmin, removeMatch);

module.exports = router;
