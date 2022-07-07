const jwt = require("jsonwebtoken");
let privateKey = process.env.JWT_SECRET_KEY || "secretKey";
let skipList = ["/skip-route"];

module.exports = function (req, res, next) {
  let token =
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
