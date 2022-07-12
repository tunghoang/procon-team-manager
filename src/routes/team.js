const { signin, signup } = require("../controllers/team");

const { Router } = require("express");

const router = Router();

router.route("/signin").post(signin);
router.route("/signup").post(signup);

module.exports = router;
