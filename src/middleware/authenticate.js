const jwt = require("jsonwebtoken");
const { Team } = require("../models");
const privateKey = process.env.JWT_SECRET_KEY || "secretKey";
const skipList = ["/skip-route", "/team/signin", "/team/signup"];

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
        return res.status(401).send("Unauthorized");
      } else {
        req.auth = decoded;
        next();
      }
    });
  }
};

const requireAdmin = async (req, res, next) => {
  // const { id } = req.auth;
  // const team = await Team.findByPk(id);

  // if (!team.is_admin) {
  //   return res.status(401).send("Require admin");
  // }

  return next();
};

module.exports = { authenticate, requireAdmin };
