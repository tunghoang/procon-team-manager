const { Router } = require("express");
const { getMatchs, createMatch, getMatch, updateMatch, removeMatch } = require("../controllers/match");

const router = Router();

router.route('/')
  .get(getMatchs)
  .post(createMatch)

router.route('/:id')
  .get(getMatch)
  .put(updateMatch)
  .delete(removeMatch)

module.exports = router;
