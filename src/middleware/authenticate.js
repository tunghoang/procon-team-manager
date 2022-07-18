const jwt = require("jsonwebtoken");
const { Team } = require("../models");
const privateKey = process.env.JWT_SECRET_KEY || "secretKey";
const skipList = [
  "/skip-route",
  "/team/signin",
  "/team/signup",
  "/question/audio/*",
];

const authenticate = (req, res, next) => {
  const token =
    req.body.token ||
    req.query.token ||
    req.header["x-access-token"] ||
    req.get("Authorization") ||
    req.query.token;
  if (new RegExp(skipList.join("|")).test(req.originalUrl)) {
    req.auth = {};
    next();
  } else {
    jwt.verify(token, privateKey, async function (err, decoded) {
      if (err) {
        return res.status(401).json({ message: "Unauthorized" });
      } else {
        req.auth = decoded;
        const team = await Team.findByPk(req.auth.id);
        if (!team) return res.status(404).json({ message: "Team not found" });
        req.auth.is_admin = team.is_admin;
        next();
      }
    });
  }
};

const requireAdmin = async (req, res, next) => {
  if (!req.auth.is_admin) {
    return res.status(405).json({ message: "Required admin" });
  }
  next();
};

module.exports = { authenticate, requireAdmin };
