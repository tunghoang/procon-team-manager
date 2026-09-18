const jwt = require("jsonwebtoken");
const { Team } = require("../models");
const { isStaff } = require("../lib/scope");
const privateKey = process.env.JWT_SECRET_KEY || "secretKey";

/**
 * The only two routes reachable WITHOUT a token, as full paths.
 *
 * This middleware is mounted at `/api` (src/index.js), so `req.originalUrl`
 * carries that prefix. The list used to be joined into one unanchored regex and
 * tested against the whole URL, which let ANY url merely CONTAINING
 * "/team/signin" through with `req.auth = {}` -- e.g.
 * `GET /api/match/7?x=/team/signin` returned another group's match metadata to
 * an anonymous caller. Exact paths, query string stripped, no regex.
 */
const SKIP_PATHS = new Set(["/api/team/signin", "/api/team/signup"]);

/** The request path with the query string (and a trailing slash) removed. */
const pathOf = (req) => {
  const raw = String(req.originalUrl || req.url || "").split("?")[0];
  return raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

/**
 * The token, from a HEADER only.
 *
 * `req.query.token` and `req.body.token` used to be accepted as well. A token
 * in the query string is copied into every access log, proxy log and browser
 * history entry, and it is the one credential that also administers the game
 * service (both services verify the same JWT). Nothing in procon-react sends
 * one that way -- every call, the xlsx export fetches included, sets the
 * `Authorization` header.
 */
const tokenOf = (req) => req.headers["x-access-token"] || req.get("Authorization");

/**
 * Is this account barred from using the API?
 *
 * There is NO `status` column on `team` today (models/team.js), so this is
 * inert: `team.status` is undefined and nothing is ever rejected. It is wired
 * up here so that adding the column is all it takes to make a suspension
 * effective immediately, rather than after the offender's 2-day token expires.
 */
const SUSPENDED_STATUSES = new Set([
  "suspended",
  "disabled",
  "banned",
  "inactive",
  "blocked",
]);

/**
 * What the per-request re-read selects: the role fields, and `status` only if
 * the model actually declares it. Deliberately NOT the whole row -- there is no
 * reason to pull every account's bcrypt hash into memory on every API call.
 */
const ROLE_ATTRIBUTES = ["id", "name", "is_admin", "group_id", "group_role"];
const AUTH_ATTRIBUTES = Team?.rawAttributes?.status
  ? [...ROLE_ATTRIBUTES, "status"]
  : ROLE_ATTRIBUTES;
const isSuspended = (team) => {
  const status = team?.status;
  if (status == null) return false;
  if (typeof status === "boolean") return status === false;
  if (typeof status === "number") return status === 0;
  return SUSPENDED_STATUSES.has(String(status).trim().toLowerCase());
};

/**
 * Verify the token, then RE-READ the account and refresh its role off the DB.
 *
 * The JWT lives for two days and used to be the only source of `is_admin`,
 * `group_id` and `group_role`, so demoting a group manager, moving it to
 * another group or deleting nothing but its rights left its existing token
 * fully powerful until it expired -- with no way to revoke it. The row is the
 * authority now; the token only proves which row.
 *
 * The bootstrap admin (id 0, is_admin) has no row on purpose and keeps working.
 */
const authenticate = async (req, res, next) => {
  if (SKIP_PATHS.has(pathOf(req))) {
    req.auth = {};
    return next();
  }

  let decoded;
  try {
    decoded = jwt.verify(tokenOf(req), privateKey);
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Method + path + the account id. The decoded payload used to be logged
  // whole (name and role of every caller, on every request) and the URL with
  // its query string, which is where a `?token=` would have ended up.
  console.log(
    req.ip,
    `-- [${new Date().toLocaleString()}]`,
    req.method,
    pathOf(req),
    `id=${decoded?.id}`,
  );

  try {
    // The bootstrap admin exists only in the environment (team.js#signin).
    if (Number(decoded.id) === 0 && decoded.is_admin) {
      req.auth = {
        id: 0,
        name: decoded.name,
        is_admin: true,
        group_id: null,
        group_role: "member",
      };
      return next();
    }

    const team = await Team.findByPk(decoded.id, { attributes: AUTH_ATTRIBUTES });
    if (!team) return res.status(401).json({ message: "Unauthorized" });
    if (isSuspended(team)) {
      return res.status(403).json({ message: "Account suspended" });
    }

    req.auth = {
      id: team.id,
      name: team.name,
      is_admin: !!team.is_admin,
      group_id: team.group_id ?? null,
      group_role: team.group_role || "member",
    };
    return next();
  } catch (error) {
    // A DB hiccup must answer, not leave the request hanging.
    return res.status(500).json({ message: error.message });
  }
};

// Superadmin only (lib/scope.js: isSuperAdmin).
const requireAdmin = async (req, res, next) => {
  if (!req.auth.is_admin) {
    // 403, not 405: the route exists and the method is right, the caller just
    // may not use it.
    return res.status(403).json({ message: "Required admin" });
  }
  next();
};

// Superadmin OR a group manager. Routes behind this guard must still scope
// what a manager may touch (lib/scope.js) -- the guard only opens the door.
const requireStaff = async (req, res, next) => {
  if (!isStaff(req.auth)) {
    return res.status(403).json({ message: "Required admin or group manager" });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireStaff, isSuspended, pathOf };
