/**
 * Tests for the roster endpoints (no DB, no HTTP: both are stubbed).
 *
 * Run with:  node src/controllers/match.roster.test.js
 *
 * What these pin:
 *   - the BULK add FILTERS staff accounts out and names them in
 *     `skipped_staff`, rather than failing the whole batch: a manager selecting
 *     "everyone in my group" picks up its own manager account every time. The
 *     SINGLE add stays strict (400), because one id deserves one clear answer;
 *   - each question's stored board is rewritten ONCE for all the teams added to
 *     it. Writing per team from several pooled workers would be a
 *     read-modify-write on one row and the last writer would drop the others'
 *     teams;
 *   - a team the ENGINE refused must not appear on the board as though it were
 *     registered -- that is what silently locks a team out of a game.
 */

const assert = require("assert");
const Module = require("module");
const path = require("path");

process.env.JWT_SECRET_KEY = "match.roster.test.js";
process.env.SERVICE_APIS = '["http://engine.test/api"]';

// --- stubs -------------------------------------------------------------------
const engineCalls = [];
let engineBehaviour = () => ({ ok: true });
const httpError = (statusCode, body) => {
  const e = new Error(`HTTP ${statusCode}`);
  e.response = { statusCode, body };
  return e;
};
const gotStub = {
  post: async (url, opts) => {
    engineCalls.push({ method: "POST", url, json: opts?.json });
    return engineBehaviour({ url, json: opts?.json });
  },
  delete: async (url) => {
    engineCalls.push({ method: "DELETE", url });
    return engineBehaviour({ url });
  },
};

const db = { matches: [], teams: [], questions: [], writes: [] };

const origLoad = Module._load;
Module._load = function (request) {
  const r = String(request).replace(/\\/g, "/");
  if (request === "got") return gotStub;
  const byId = (rows) => async (id) =>
    rows().find((row) => String(row.id) === String(id)) || null;
  const model = (name, extra = {}) => ({
    name,
    findAll: async () => [],
    findByPk: async () => null,
    ...extra,
  });
  const MatchModel = () =>
    model("Match", {
      findAll: async () => db.matches,
      findByPk: byId(() => db.matches),
    });
  if (/models\/match$/.test(r)) return MatchModel();
  if (/models\/round$/.test(r)) return model("Round");
  if (/(^|\/)models$/.test(r) || /models\/index$/.test(r)) {
    return {
      migrated: Promise.resolve(),
      sequelize: { query: async () => [], literal: (s) => ({ literal: s }) },
      Match: MatchModel(),
      Team: model("Team", {
        findAll: async () => db.teams,
        findByPk: byId(() => db.teams),
      }),
      Question: model("Question", { findAll: async () => db.questions }),
      Group: model("Group"),
      Tournament: model("Tournament"),
      Round: model("Round"),
    };
  }
  return origLoad.apply(this, arguments);
};
const { bulkAddTeams, createTeamMatch } = require(path.join(__dirname, "match.js"));
Module._load = origLoad;

// --- harness -----------------------------------------------------------------
const ADMIN = { id: 0, is_admin: true };

const mkRes = () => {
  const res = { code: null, body: null };
  res.status = (c) => ((res.code = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

const team = (id, over = {}) => ({
  id,
  name: `T${id}`,
  group_id: null,
  is_admin: false,
  group_role: "member",
  ...over,
});

/** A match row with a recording `addTeams`. */
const match = (id, rostered = []) => {
  const row = {
    id,
    name: `M${id}`,
    group_id: null,
    teams: rostered.map((t) => ({ id: t })),
    added: [],
    addTeams: async (teams) => {
      row.added.push(...(Array.isArray(teams) ? teams : [teams]).map((t) => t.id));
    },
  };
  return row;
};

/** A question row whose board holds `teams`, recording every write. */
const question = (id, teamIds, boardExtra = {}) => {
  const row = {
    id,
    match_id: 1,
    question_data: JSON.stringify({
      map: { cells: [[0]] },
      teams: teamIds.map((t) => ({ team_id: String(t), agents: [1, 2] })),
      ...boardExtra,
    }),
    writes: 0,
    update: async (fields) => {
      row.writes += 1;
      row.question_data = fields.question_data;
      db.writes.push({ question_id: id, fields });
    },
  };
  return row;
};

const boardTeams = (row) =>
  JSON.parse(row.question_data).teams.map((t) => t.team_id);

const fresh = () => {
  engineCalls.length = 0;
  engineBehaviour = () => ({ ok: true });
  db.matches = [];
  db.teams = [];
  db.questions = [];
  db.writes = [];
};

const tests = {
  // --- staff filtering -------------------------------------------------------
  async "the bulk add skips staff accounts and names them"() {
    fresh();
    const m = match(1, [10]);
    db.matches = [m];
    db.teams = [
      team(11),
      team(12, { group_role: "manager", group_id: 1 }),
      team(13, { is_admin: true }),
    ];
    db.questions = [question("q1", [10])];

    const res = mkRes();
    await bulkAddTeams(
      { auth: ADMIN, body: { match_ids: [1], team_ids: [11, 12, 13] } },
      res,
    );
    assert.strictEqual(res.code, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.added_count, 1, "only the real team is rostered");
    assert.deepStrictEqual(m.added, [11]);
    assert.deepStrictEqual(
      res.body.skipped_staff.map((s) => s.id).sort(),
      [12, 13],
      "the manager and the superadmin are reported, not fatal",
    );
    assert.match(res.body.message, /staff account/i);
  },

  async "a bulk add of nothing but staff is a 400 that says why"() {
    fresh();
    db.matches = [match(1)];
    db.teams = [team(12, { group_role: "manager", group_id: 1 })];
    db.questions = [];
    const res = mkRes();
    await bulkAddTeams({ auth: ADMIN, body: { match_ids: [1], team_ids: [12] } }, res);
    assert.strictEqual(res.code, 400);
    assert.match(res.body.message, /nobody to roster/);
    assert.deepStrictEqual(res.body.skipped_staff.map((s) => s.id), [12]);
  },

  async "the SINGLE add refuses a staff account with a 400 that explains"() {
    fresh();
    const m = match(1);
    db.matches = [m];
    db.teams = [team(12, { group_role: "manager", group_id: 1 })];
    db.questions = [question("q1", [])];

    const res = mkRes();
    await createTeamMatch({ auth: ADMIN, params: { matchId: 1, teamId: 12 } }, res);
    assert.strictEqual(res.code, 400);
    assert.match(res.body.message, /cannot be rostered as players/);
    assert.match(res.body.message, /T12/, "it names the account");
    assert.deepStrictEqual(m.added, [], "nothing was rostered");
    assert.strictEqual(engineCalls.length, 0, "and the engine was never called");
  },

  async "the SINGLE add still works for an ordinary team"() {
    fresh();
    const m = match(1, [10]);
    const q = question("q1", [10]);
    db.matches = [m];
    db.teams = [team(11)];
    db.questions = [q];

    const res = mkRes();
    await createTeamMatch({ auth: ADMIN, params: { matchId: 1, teamId: 11 } }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(m.added, [11]);
    assert.deepStrictEqual(boardTeams(q), ["10", "11"]);
    assert.strictEqual(engineCalls.length, 1);
  },

  // --- one board write per question -----------------------------------------
  async "three teams added to one question cost ONE board write"() {
    fresh();
    const m = match(1, [10]);
    const q = question("q1", [10]);
    db.matches = [m];
    db.teams = [team(11), team(12), team(13)];
    db.questions = [q];

    const res = mkRes();
    await bulkAddTeams(
      { auth: ADMIN, body: { match_ids: [1], team_ids: [11, 12, 13] } },
      res,
    );
    assert.strictEqual(res.code, 200, JSON.stringify(res.body));
    assert.strictEqual(q.writes, 1, "one read-modify-write, not three");
    assert.deepStrictEqual(
      boardTeams(q),
      ["10", "11", "12", "13"],
      "every added team survives -- no writer clobbered another",
    );
    // One engine call per (question x team).
    assert.strictEqual(engineCalls.length, 3);
    for (const call of engineCalls) {
      assert.match(call.url, /\/game\/teams$/, "shared game -> join it");
    }
  },

  async "a team the engine REFUSED is left off the board"() {
    fresh();
    const m = match(1, [10]);
    const q = question("q1", [10]);
    db.matches = [m];
    db.teams = [team(11), team(12)];
    db.questions = [q];

    engineBehaviour = ({ json }) => {
      if (String(json.team_id) === "12") throw httpError(409, '{"detail":"game is over"}');
      return { ok: true };
    };
    const res = mkRes();
    await bulkAddTeams({ auth: ADMIN, body: { match_ids: [1], team_ids: [11, 12] } }, res);
    assert.strictEqual(res.code, 502, "a partial sync must not read as success");
    assert.deepStrictEqual(
      boardTeams(q),
      ["10", "11"],
      "12 was refused by the engine, so it must not appear registered",
    );
    assert.strictEqual(res.body.added_count, 2, "the DB roster rows did commit");
    assert.deepStrictEqual(res.body.failed_game_ids, ["q1"]);
    const failed = res.body.game_sync.find((row) => !row.ok);
    assert.strictEqual(failed.team_id, "12");
    assert.strictEqual(failed.message, "game is over", "the engine's own detail");
  },

  async "an already-registered team counts as success (the sync is idempotent)"() {
    fresh();
    const m = match(1, [10]);
    const q = question("q1", [10]);
    db.matches = [m];
    db.teams = [team(11)];
    db.questions = [q];
    engineBehaviour = () => {
      throw httpError(400, "team already exists in this game");
    };
    const res = mkRes();
    await bulkAddTeams({ auth: ADMIN, body: { match_ids: [1], team_ids: [11] } }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.game_sync[0].alreadyRegistered, true);
    assert.deepStrictEqual(boardTeams(q), ["10", "11"]);
  },

  async "plain practice gives each added team its OWN solo game"() {
    fresh();
    const m = match(1, [10]);
    const q = question("q1", [10], { is_practice: true });
    db.matches = [m];
    db.teams = [team(11), team(12)];
    db.questions = [q];

    const res = mkRes();
    await bulkAddTeams({ auth: ADMIN, body: { match_ids: [1], team_ids: [11, 12] } }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(
      engineCalls.map((c) => c.json.game_id).sort(),
      ["q1:11", "q1:12"],
    );
    for (const call of engineCalls) {
      assert.match(call.url, /\/game\/init$/);
      assert.strictEqual(call.json.players, 1);
      assert.strictEqual(call.json.is_practice, true);
    }
    assert.strictEqual(q.writes, 1);
  },

  // --- unknown ids -----------------------------------------------------------
  async "an unknown team id is a 404 that names it"() {
    fresh();
    db.matches = [match(1)];
    db.teams = [team(11)];
    const res = mkRes();
    await bulkAddTeams({ auth: ADMIN, body: { match_ids: [1], team_ids: [11, 99] } }, res);
    assert.strictEqual(res.code, 404);
    assert.match(res.body.message, /99/);
  },

  async "an unknown match id is a 404 that names it"() {
    fresh();
    db.matches = [match(1)];
    db.teams = [team(11)];
    const res = mkRes();
    await bulkAddTeams({ auth: ADMIN, body: { match_ids: [1, 7], team_ids: [11] } }, res);
    assert.strictEqual(res.code, 404);
    assert.match(res.body.message, /7/);
  },

  async "a team already on the roster is not added twice"() {
    fresh();
    const m = match(1, [11]);
    const q = question("q1", [11]);
    db.matches = [m];
    db.teams = [team(11)];
    db.questions = [q];
    const res = mkRes();
    await bulkAddTeams({ auth: ADMIN, body: { match_ids: [1], team_ids: [11] } }, res);
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.added_count, 0);
    assert.strictEqual(q.writes, 0, "nothing to write");
    assert.strictEqual(engineCalls.length, 0);
  },

  async "a group match refuses a team from outside the group"() {
    fresh();
    const m = match(1);
    m.group_id = 5;
    db.matches = [m];
    db.teams = [team(11, { group_id: 6 })];
    const res = mkRes();
    await bulkAddTeams({ auth: ADMIN, body: { match_ids: [1], team_ids: [11] } }, res);
    assert.strictEqual(res.code, 400);
    assert.match(res.body.message, /Not in the group/);
    assert.strictEqual(engineCalls.length, 0);
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      console.log(`  ok   ${name}`);
    } catch (e) {
      failed += 1;
      console.error(`  FAIL ${name}\n       ${e.message}`);
    }
  }
  const total = Object.keys(tests).length;
  console.log(`\n${total - failed}/${total} passed`);
  process.exit(failed ? 1 : 0);
})();
