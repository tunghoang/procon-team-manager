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
    jwt.verify(token, privateKey, function (err, decoded) {
      if (err) {
        return res.status(401).json({ error: "Unauthorized" });
      } else {
        req.auth = decoded;
        next();
      }
    });
  }
};

const requireAdmin = async (req, res, next) => {
  if (!req.auth.is_admin) {
    return res.status(401).json({ error: "Require admin" });
  }

  next();
};

const validateAccount = async (req, res, next) => {
  if (new RegExp(skipList.join("|")).test(req.originalUrl)) {
    req.auth = {};
  } else {
    const { id } = req.auth;
    const team = await Team.findByPk(id);
    if (!team) {
      return res.status(401).json({ error: "Team unauthorized" });
    }
    req.auth.is_admin = team.is_admin;
  }

  next();
};

module.exports = { authenticate, requireAdmin, validateAccount };
