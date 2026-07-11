const jwt = require("jsonwebtoken");
const { Team } = require("../models");

// Fail fast rather than fall back to a public, attacker-known secret: an empty
// JWT_SECRET_KEY previously defaulted to "secretKey", which would let anyone
// forge an admin token (and the game-service shares this secret).
const privateKey = process.env.JWT_SECRET_KEY;
if (!privateKey) {
  throw new Error(
    "JWT_SECRET_KEY is required — refusing to start with an insecure default secret"
  );
}

// Exact pathnames that skip authentication, matched against req.path (the
// pathname only) — NEVER req.originalUrl. Matching originalUrl with an
// unanchored regex let any URL merely *containing* one of these substrings
// (e.g. GET /tournament?x=/team/signin) bypass auth entirely.
const skipPaths = new Set(["/skip-route", "/team/signin", "/team/signup"]);

const authenticate = (req, res, next) => {
  if (skipPaths.has(req.path)) {
    req.auth = {};
    return next();
  }

  let token =
    (req.body && req.body.token) ||
    req.query.token ||
    req.headers["x-access-token"] ||
    req.get("Authorization");
  // Tolerate a "Bearer <token>" header even though the manager scheme is raw.
  if (typeof token === "string" && token.startsWith("Bearer ")) {
    token = token.slice(7);
  }

  jwt.verify(token, privateKey, async function (err, decoded) {
    if (err) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.auth = decoded;
    if (req.auth.id === 0 && req.auth.is_admin) {
      return next();
    }
    try {
      const team = await Team.findByPk(req.auth.id);
      if (!team) return res.status(401).json({ message: "Unauthorized" });
      return next();
    } catch (e) {
      return res.status(500).json({ message: "Authentication check failed" });
    }
  });
};

const requireAdmin = (req, res, next) => {
  // 403 Forbidden (authenticated but not permitted), not 405 Method Not Allowed.
  if (!req.auth || !req.auth.is_admin) {
    return res.status(403).json({ message: "Required admin" });
  }
  next();
};

module.exports = { authenticate, requireAdmin };
