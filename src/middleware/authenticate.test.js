/**
 * Tests for the auth middleware (no DB: the Team model is stubbed).
 *
 * Run with:  node src/middleware/authenticate.test.js
 *
 * These pin three things that were security bugs, and are easy to reintroduce:
 *   1. the skip list is EXACT paths, not a substring match -- any URL merely
 *      containing "/team/signin" used to run with `req.auth = {}`, which handed
 *      an anonymous caller other groups' match/round/tournament metadata;
 *   2. a token is taken from a HEADER only, never from the query string or the
 *      body (a query token lands in every access log, and the same token also
 *      administers the game service);
 *   3. the role is read from the ACCOUNT ROW on every request, so demoting or
 *      moving a group manager takes effect at once rather than whenever its
 *      2-day token happens to expire.
 *
 * The bootstrap admin (id 0, no row) must keep working throughout.
 */

const assert = require("assert");
const Module = require("module");
const path = require("path");

process.env.JWT_SECRET_KEY = "authenticate.test.js";
const jwt = require("jsonwebtoken");

// --- stub the model layer ----------------------------------------------------
// `let` so a case can decide what the account row looks like (or that it is
// gone). Nothing else in this middleware touches the DB.
let teamRow = null;
const origLoad = Module._load;
Module._load = function (request) {
  const r = String(request).replace(/\\/g, "/");
  if (/(^|\/)models$/.test(r) || /models\/index$/.test(r)) {
    return { Team: { findByPk: async () => teamRow } };
  }
  return origLoad.apply(this, arguments);
};
const { authenticate, pathOf } = require(path.join(__dirname, "authenticate.js"));
Module._load = origLoad;

const sign = (payload) => jwt.sign(payload, process.env.JWT_SECRET_KEY);

const mkReq = (over = {}) => ({
  ip: "203.0.113.9",
  method: "GET",
  headers: {},
  body: {},
  query: {},
  get(name) {
    return this.headers[String(name).toLowerCase()];
  },
  ...over,
});

/** Run the middleware; report whether it called next() and what it answered. */
const run = async (req) => {
  const res = { code: null, body: null };
  res.status = (c) => ((res.code = c), res);
  res.json = (b) => ((res.body = b), res);
  let nexted = false;
  await authenticate(req, res, () => (nexted = true));
  return { nexted, res };
};

// Keep the log quiet: the point here is the decision, not the line.
const realLog = console.log;

const tests = {
  async "the two public routes need no token"() {
    for (const url of ["/api/team/signin", "/api/team/signup", "/api/team/signin/"]) {
      const req = mkReq({ originalUrl: url, method: "POST" });
      const { nexted, res } = await run(req);
      assert.strictEqual(nexted, true, `${url} was blocked`);
      assert.deepStrictEqual(req.auth, {}, url);
      assert.strictEqual(res.code, null, url);
    }
  },

  async "a url merely CONTAINING a public path still needs a token"() {
    for (const url of [
      "/api/match/7?redirect=/api/team/signin",
      "/api/team/signinx",
      "/api/round/1/team/signin",
      "/api/question/abc?x=/api/team/signup",
      "/api/tournament?q=/api/team/signin",
    ]) {
      const { nexted, res } = await run(mkReq({ originalUrl: url }));
      assert.strictEqual(nexted, false, `${url} ran unauthenticated`);
      assert.strictEqual(res.code, 401, url);
    }
  },

  async "a token in the query string or the body is not a token"() {
    const token = sign({ id: 7, is_admin: true });
    teamRow = { id: 7, is_admin: true, group_id: null, group_role: "member" };
    for (const req of [
      mkReq({ originalUrl: `/api/match?token=${token}`, query: { token } }),
      mkReq({ originalUrl: "/api/match", body: { token } }),
    ]) {
      const { nexted, res } = await run(req);
      assert.strictEqual(nexted, false);
      assert.strictEqual(res.code, 401);
    }
  },

  async "both accepted headers work"() {
    const token = sign({ id: 7, is_admin: false });
    teamRow = { id: 7, name: "Alpha", is_admin: false, group_id: null, group_role: "member" };
    for (const headers of [{ authorization: token }, { "x-access-token": token }]) {
      const { nexted } = await run(mkReq({ originalUrl: "/api/match", headers }));
      assert.strictEqual(nexted, true, JSON.stringify(headers));
    }
  },

  async "a missing, malformed or wrongly signed token is 401"() {
    teamRow = { id: 7, is_admin: false, group_id: null, group_role: "member" };
    const wrongKey = jwt.sign({ id: 7, is_admin: true }, "not-the-key");
    for (const headers of [{}, { authorization: "garbage" }, { authorization: wrongKey }]) {
      const { nexted, res } = await run(mkReq({ originalUrl: "/api/match", headers }));
      assert.strictEqual(nexted, false, JSON.stringify(headers));
      assert.strictEqual(res.code, 401);
    }
  },

  async "the role comes from the row, not from the token"() {
    // A token minted while this account was a superadmin AND the manager of
    // group 1. The row now says: ordinary member of group 2.
    const stale = sign({
      id: 11,
      name: "as issued",
      is_admin: true,
      group_id: 1,
      group_role: "manager",
    });
    teamRow = {
      id: 11,
      name: "as stored",
      is_admin: false,
      group_id: 2,
      group_role: "member",
    };
    const req = mkReq({ originalUrl: "/api/match", headers: { authorization: stale } });
    const { nexted } = await run(req);
    assert.strictEqual(nexted, true);
    assert.deepStrictEqual(req.auth, {
      id: 11,
      name: "as stored",
      is_admin: false,
      group_id: 2,
      group_role: "member",
    });
  },

  async "a deleted account's token stops working immediately"() {
    const token = sign({ id: 99, is_admin: true });
    teamRow = null;
    const { nexted, res } = await run(
      mkReq({ originalUrl: "/api/match", headers: { authorization: token } }),
    );
    assert.strictEqual(nexted, false);
    assert.strictEqual(res.code, 401);
  },

  async "the bootstrap admin has no row and keeps full rights"() {
    const token = sign({ id: 0, name: "admin", is_admin: true });
    teamRow = null;
    const req = mkReq({ originalUrl: "/api/team", headers: { authorization: token } });
    const { nexted } = await run(req);
    assert.strictEqual(nexted, true);
    assert.strictEqual(req.auth.id, 0);
    assert.strictEqual(req.auth.is_admin, true);
    assert.strictEqual(req.auth.group_role, "member");
  },

  async "id 0 without is_admin is NOT the bootstrap admin"() {
    const token = sign({ id: 0, is_admin: false });
    teamRow = null;
    const { nexted, res } = await run(
      mkReq({ originalUrl: "/api/team", headers: { authorization: token } }),
    );
    assert.strictEqual(nexted, false, "it must fall through to the DB lookup");
    assert.strictEqual(res.code, 401);
  },

  async "a DB error answers 500 instead of hanging the request"() {
    const token = sign({ id: 7, is_admin: false });
    const boom = Object.defineProperty({}, "id", {
      get() {
        throw new Error("connection lost");
      },
    });
    teamRow = boom;
    const { nexted, res } = await run(
      mkReq({ originalUrl: "/api/match", headers: { authorization: token } }),
    );
    assert.strictEqual(nexted, false);
    assert.strictEqual(res.code, 500);
  },

  "pathOf drops the query string and a trailing slash"() {
    assert.strictEqual(pathOf({ originalUrl: "/api/x?y=1&z=2" }), "/api/x");
    assert.strictEqual(pathOf({ originalUrl: "/api/x/" }), "/api/x");
    assert.strictEqual(pathOf({ originalUrl: "/" }), "/");
    assert.strictEqual(pathOf({ url: "/api/x" }), "/api/x");
    assert.strictEqual(pathOf({}), "");
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    console.log = () => {};
    let error = null;
    try {
      await fn();
    } catch (e) {
      error = e;
    }
    console.log = realLog;
    if (error) {
      failed += 1;
      console.error(`  FAIL ${name}\n       ${error.message}`);
    } else {
      console.log(`  ok   ${name}`);
    }
  }
  const total = Object.keys(tests).length;
  console.log(`\n${total - failed}/${total} passed`);
  process.exit(failed ? 1 : 0);
})();
