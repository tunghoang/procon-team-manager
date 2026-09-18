/**
 * Tests for POST /question/bulk-create (no DB, no HTTP: both are stubbed).
 *
 * Run with:  node src/controllers/question.bulk.test.js
 *
 * The case that matters here: `defaults.raw_questions` is ONE object shared by
 * every entry that brings no board of its own, and the create path MUTATES the
 * board it is handed (prepareRawQuestion stamps the practice flags on it,
 * applyMatchRoster rewrites its `teams`). Since the whole batch is validated
 * before anything is created, every entry ended up stored with -- and
 * initialised from -- the LAST entry's roster. Each entry gets its own deep
 * copy now.
 */

const assert = require("assert");
const Module = require("module");
const path = require("path");

process.env.JWT_SECRET_KEY = "question.bulk.test.js";
process.env.SERVICE_APIS = '["http://engine.test/api"]';

// --- stubs -------------------------------------------------------------------
const inits = [];
const created = [];
/** matchId -> the rows `SELECT team_id FROM team_match` returns. */
let rosters = {};
let matchOf = (id) => ({ id: Number(id), name: `M${id}`, group_id: null });

const gotStub = {
  post: async (url, opts) => {
    inits.push({ url, json: opts?.json });
    return { ok: true };
  },
  delete: async () => ({}),
};

const origLoad = Module._load;
Module._load = function (request) {
  const r = String(request).replace(/\\/g, "/");
  if (request === "got") return gotStub;
  if (/(^|\/)models$/.test(r) || /models\/index$/.test(r)) {
    return {
      migrated: Promise.resolve(),
      sequelize: {
        query: async (_sql, opts) => rosters[opts?.replacements?.matchId] || [],
        transaction: async () => ({
          finished: undefined,
          commit: async () => {},
          rollback: async () => {},
        }),
      },
      Question: {
        name: "Question",
        findOne: async () => null,
        findAll: async () => [],
        findByPk: async () => null,
        create: async (body) => {
          const row = { id: `q${created.length + 1}`, ...body };
          created.push(row);
          return row;
        },
      },
      Match: { name: "Match", findByPk: async (id) => matchOf(id) },
      Round: { name: "Round", findAll: async () => [] },
      Answer: { name: "Answer", destroy: async () => 0 },
      OptimalAnswer: { name: "OptimalAnswer", destroy: async () => 0 },
    };
  }
  return origLoad.apply(this, arguments);
};
const { bulkCreateQuestions } = require(path.join(__dirname, "question.js"));
Module._load = origLoad;

// --- harness -----------------------------------------------------------------
const ADMIN = { id: 0, is_admin: true };

const mkRes = () => {
  const res = { code: null, body: null };
  res.status = (c) => ((res.code = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

const bulk = async (body, auth = ADMIN) => {
  const res = mkRes();
  await bulkCreateQuestions({ auth, body }, res);
  return res;
};

const board = (over = {}) => ({
  startsAt: 1_900_000_000,
  agent_selection_time_limit: 45,
  map: { width: 4, height: 4, cells: [[0]] },
  spots: [{ pos: 3, brand: 0, stocks: 1 }],
  teams: [{ team_id: "999", agents: [7, 8] }],
  ...over,
});

const fresh = () => {
  inits.length = 0;
  created.length = 0;
  rosters = { 1: [{ team_id: 11 }, { team_id: 12 }], 2: [{ team_id: 21 }] };
  matchOf = (id) => ({ id: Number(id), name: `M${id}`, group_id: null });
};

const boardOf = (row) => JSON.parse(row.question_data);
const teamIdsOf = (row) => boardOf(row).teams.map((t) => t.team_id);

const tests = {
  async "one shared default board gives each entry its OWN match roster"() {
    fresh();
    const shared = board();
    const res = await bulk({
      defaults: { raw_questions: shared },
      questions: [
        { name: "A", match_id: 1 },
        { name: "B", match_id: 2 },
      ],
    });
    assert.strictEqual(res.code, 201, JSON.stringify(res.body));
    assert.strictEqual(created.length, 2);
    assert.deepStrictEqual(teamIdsOf(created[0]), ["11", "12"], "A -> match 1");
    assert.deepStrictEqual(teamIdsOf(created[1]), ["21"], "B -> match 2");

    // The engine was initialised with the same per-entry rosters.
    assert.deepStrictEqual(
      inits.map((i) => i.json.teams.map((t) => t.team_id)),
      [["11", "12"], ["21"]],
    );

    // The pasted agents template is reused for every team of every entry
    // (the docs require an identical starting layout for every team).
    for (const row of created) {
      for (const team of boardOf(row).teams) {
        assert.deepStrictEqual(team.agents, [7, 8]);
      }
    }
  },

  async "the caller's shared default object is never mutated"() {
    fresh();
    const shared = board();
    await bulk({
      defaults: { raw_questions: shared },
      questions: [
        { name: "A", match_id: 1 },
        { name: "B", match_id: 2 },
      ],
    });
    assert.deepStrictEqual(shared.teams.map((t) => t.team_id), ["999"]);
    assert.strictEqual(shared.is_practice, undefined, "no flags stamped on it");
    assert.strictEqual(shared.group_id, undefined);
  },

  async "per-entry boards are independent too"() {
    fresh();
    const res = await bulk({
      questions: [
        { name: "A", match_id: 1, raw_questions: board() },
        { name: "B", match_id: 2, raw_questions: board() },
      ],
    });
    assert.strictEqual(res.code, 201, JSON.stringify(res.body));
    assert.deepStrictEqual(teamIdsOf(created[0]), ["11", "12"]);
    assert.deepStrictEqual(teamIdsOf(created[1]), ["21"]);
  },

  async "the practice flags come from each entry's OWN match"() {
    fresh();
    // Match 1 is timed, match 2 is plain practice -> one solo game per team.
    matchOf = (id) =>
      Number(id) === 2
        ? { id: 2, name: "M2", group_id: null, is_practice: true, no_reset: false }
        : { id: 1, name: "M1", group_id: null };
    const res = await bulk({
      defaults: { raw_questions: board() },
      questions: [
        { name: "A", match_id: 1 },
        { name: "B", match_id: 2 },
      ],
    });
    assert.strictEqual(res.code, 201, JSON.stringify(res.body));
    assert.strictEqual(boardOf(created[0]).is_practice, false);
    assert.strictEqual(boardOf(created[1]).is_practice, true);
    // One shared game for A, one game PER TEAM for B's single-team roster.
    assert.deepStrictEqual(
      inits.map((i) => i.json.game_id),
      ["q1", "q2:21"],
    );
  },

  async "a match with an empty roster refuses the batch, naming the entry"() {
    fresh();
    rosters = { 1: [{ team_id: 11 }], 2: [] };
    const res = await bulk({
      defaults: { raw_questions: board() },
      questions: [
        { name: "A", match_id: 1 },
        { name: "B", match_id: 2 },
      ],
    });
    assert.strictEqual(res.code, 400);
    assert.match(res.body.message, /questions\[1\]/);
    assert.match(res.body.message, /no teams on its roster/);
    assert.strictEqual(created.length, 0, "nothing created");
    assert.strictEqual(inits.length, 0, "no engine game created");
  },

  async "a board with no usable agents template refuses the batch"() {
    fresh();
    const res = await bulk({
      questions: [{ name: "A", match_id: 1, raw_questions: board({ teams: [] }) }],
    });
    assert.strictEqual(res.code, 400);
    assert.match(res.body.message, /agents/);
    assert.strictEqual(created.length, 0);
  },

  async "a pasted roster that already matches is kept verbatim"() {
    fresh();
    // Deliberate per-team start layouts must survive.
    const perTeam = board({
      teams: [
        { team_id: "11", agents: [1] },
        { team_id: "12", agents: [2] },
      ],
    });
    const res = await bulk({
      questions: [{ name: "A", match_id: 1, raw_questions: perTeam }],
    });
    assert.strictEqual(res.code, 201, JSON.stringify(res.body));
    assert.deepStrictEqual(boardOf(created[0]).teams, [
      { team_id: "11", agents: [1] },
      { team_id: "12", agents: [2] },
    ]);
  },

  async "auto_reset_* and id are refused from the body"() {
    fresh();
    const res = await bulk({
      defaults: { raw_questions: board() },
      questions: [
        {
          name: "A",
          match_id: 1,
          id: "chosen-by-the-client",
          auto_reset_minutes: 99999,
          auto_reset_at_sec: 1,
        },
      ],
    });
    assert.strictEqual(res.code, 201, JSON.stringify(res.body));
    assert.strictEqual(created[0].auto_reset_minutes, undefined);
    assert.strictEqual(created[0].auto_reset_at_sec, undefined);
    assert.notStrictEqual(created[0].id, "chosen-by-the-client");
  },

  async "a flat entry keeps the organiser's own labels off the board"() {
    fresh();
    const res = await bulk({
      match_id: 1,
      questions: [{ name: "A", difficulty: "hard", weight: 1.5, ...board() }],
    });
    assert.strictEqual(res.code, 201, JSON.stringify(res.body));
    assert.strictEqual(created[0].difficulty, "hard");
    assert.strictEqual(created[0].weight, 1.5);
    assert.strictEqual(boardOf(created[0]).difficulty, undefined);
    assert.strictEqual(inits[0].json.weight, undefined);
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
