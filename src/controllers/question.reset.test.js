/**
 * Tests for POST /question/:id/reset and the roster-detach cleanup
 * (no DB, no HTTP: the model layer and `got` are stubbed).
 *
 * Run with:  node src/controllers/question.reset.test.js
 *
 * What these pin:
 *   - a manual reset re-anchors Day 1 to a time that leaves the WHOLE
 *     agent-kind window ahead of it, and refuses one that does not. Pre-filling
 *     "now" (what the admin dialog used to send) defaulted every team to
 *     all-patrol on the next tick;
 *   - the new schedule is written back into `question_data`, which is what
 *     lib/questionVisibility.js gates the board on -- without it the gate was
 *     decorative after any reset;
 *   - which engine games one question owns, and that a 404 from the bare id of
 *     a per-team practice question is normal rather than a failure;
 *   - roster removal reaches the engine: the solo practice game is deleted, a
 *     shared game loses the seat, and the stored board loses the entry.
 */

const assert = require("assert");
const Module = require("module");
const path = require("path");

// --- stubs -------------------------------------------------------------------
const engineCalls = [];
let engineBehaviour = () => ({ ok: true });
const httpError = (statusCode, body) => {
  const err = new Error(`HTTP ${statusCode}`);
  err.response = { statusCode, body };
  return err;
};
const gotStub = {
  post: async (url, opts) => {
    engineCalls.push({ method: "POST", url, json: opts?.json, opts });
    return engineBehaviour({ method: "POST", url, json: opts?.json });
  },
  delete: async (url, opts) => {
    engineCalls.push({ method: "DELETE", url, opts });
    return engineBehaviour({ method: "DELETE", url });
  },
};

// What the stubbed model layer hands back; each case sets what it needs.
const db = { question: null, questions: [], roster: [], updates: [] };

const origLoad = Module._load;
Module._load = function (request) {
  const r = String(request).replace(/\\/g, "/");
  if (request === "got") return gotStub;
  if (/(^|\/)models$/.test(r) || /models\/index$/.test(r)) {
    return {
      migrated: Promise.resolve(),
      sequelize: { query: async () => db.roster },
      Question: {
        name: "Question",
        findByPk: async () => db.question,
        findAll: async () => db.questions,
      },
      Match: { name: "Match", findAll: async () => [] },
      Round: { name: "Round", findAll: async () => [] },
    };
  }
  return origLoad.apply(this, arguments);
};
process.env.SERVICE_APIS = '["http://engine.test/api"]';
process.env.JWT_SECRET_KEY = "question.reset.test.js";
const { resetQuestion } = require(path.join(__dirname, "question.js"));
const { detachTeamFromMatchGames } = require(path.join(
  __dirname,
  "../lib/engineGames.js",
));
Module._load = origLoad;

// --- harness -----------------------------------------------------------------
const mkRes = () => {
  const res = { code: null, body: null };
  res.status = (c) => ((res.code = c), res);
  res.json = (b) => ((res.body = b), res);
  res.sendStatus = (c) => ((res.code = c), res);
  return res;
};

const ADMIN = { id: 0, is_admin: true };
const nowSec = () => Math.floor(Date.now() / 1000);

/** A question row with a stored board, and an `update` that records the write. */
const questionRow = (boardExtra = {}, match = { id: 7, group_id: null }, columns = {}) => {
  const data = {
    startsAt: 1_600_000_000,
    agent_selection_time_limit: 45,
    map: { width: 4, height: 4, cells: [[0]] },
    spots: [{ pos: 3, brand: 0, stocks: 1 }],
    teams: [{ team_id: "1", agents: [0] }],
    ...boardExtra,
  };
  const row = {
    id: "q1",
    match_id: match.id,
    match,
    auto_reset_minutes: 0,
    auto_reset_at_sec: null,
    question_data: JSON.stringify(data),
    ...columns,
    update: async (fields) => {
      db.updates.push(fields);
      Object.assign(row, fields);
    },
  };
  return row;
};

const reset = async (body, auth = ADMIN) => {
  const res = mkRes();
  await resetQuestion({ params: { id: "q1" }, body, auth }, res);
  return res;
};

const fresh = (row) => {
  db.question = row;
  db.roster = [];
  db.updates = [];
  engineCalls.length = 0;
  engineBehaviour = () => ({ ok: true });
};

const tests = {
  async "a timed reset defaults to now + window + lead, and persists it"() {
    fresh(questionRow());
    const before = nowSec();
    const res = await reset({});
    assert.strictEqual(res.code, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.ok, true);
    assert.deepStrictEqual(res.body.reset, ["q1"]);
    assert.deepStrictEqual(res.body.failed, []);
    assert.ok(
      res.body.startsAt >= before + 45 + 60,
      "the default must clear the whole agent-kind window",
    );

    // One engine reset, carrying that exact startsAt, with no retries.
    assert.strictEqual(engineCalls.length, 1);
    assert.match(engineCalls[0].url, /\/game\/reset$/);
    assert.strictEqual(engineCalls[0].json.game_id, "q1");
    assert.strictEqual(engineCalls[0].json.startsAt, res.body.startsAt);
    assert.strictEqual(engineCalls[0].opts.retry.limit, 0);
    assert.strictEqual(engineCalls[0].opts.timeout.request, 10000);

    // ...and question_data now agrees, board untouched.
    assert.strictEqual(db.updates.length, 1);
    const stored = JSON.parse(db.updates[0].question_data);
    assert.strictEqual(stored.startsAt, res.body.startsAt);
    assert.deepStrictEqual(stored.map, { width: 4, height: 4, cells: [[0]] });
    assert.strictEqual(stored.spots.length, 1);
  },

  async "an admin-picked startsAt is used verbatim"() {
    fresh(questionRow());
    const target = nowSec() + 3600;
    const res = await reset({ startsAt: target });
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.startsAt, target);
    assert.strictEqual(engineCalls[0].json.startsAt, target);
    assert.strictEqual(JSON.parse(db.updates[0].question_data).startsAt, target);
  },

  async "a startsAt inside the window is refused, and nothing happens"() {
    fresh(questionRow());
    const res = await reset({ startsAt: nowSec() + 10 });
    assert.strictEqual(res.code, 400);
    assert.match(res.body.message, /agent-kind window would already be closed/);
    assert.strictEqual(engineCalls.length, 0, "no engine call on a refusal");
    assert.strictEqual(db.updates.length, 0, "question_data untouched");
  },

  async "a non-numeric startsAt is refused"() {
    fresh(questionRow());
    const res = await reset({ startsAt: "tomorrow" });
    assert.strictEqual(res.code, 400);
    assert.match(res.body.message, /epoch seconds/);
    assert.strictEqual(engineCalls.length, 0);
  },

  async "endsAt moves with startsAt"() {
    const startsAt = 1_600_000_000;
    fresh(questionRow({ endsAt: startsAt + 900 }));
    const target = nowSec() + 7200;
    await reset({ startsAt: target });
    const stored = JSON.parse(db.updates[0].question_data);
    assert.strictEqual(stored.endsAt - stored.startsAt, 900, "duration preserved");
    assert.strictEqual(stored.endsAt, target + 900);
  },

  async "a failed engine reset is 502 and leaves the schedule alone"() {
    fresh(questionRow());
    engineBehaviour = () => {
      throw httpError(500, '{"detail":"engine exploded"}');
    };
    const res = await reset({});
    assert.strictEqual(res.code, 502);
    assert.strictEqual(res.body.ok, false);
    assert.deepStrictEqual(res.body.reset, []);
    assert.strictEqual(res.body.failed.length, 1);
    assert.strictEqual(res.body.failed[0].id, "q1");
    assert.strictEqual(
      res.body.failed[0].reason,
      "engine exploded",
      "the engine's own detail, not its raw JSON body",
    );
    assert.strictEqual(db.updates.length, 0, "nothing took it -> do not persist");
  },

  async "a partial failure still persists the schedule"() {
    // Plain practice with two teams: one solo game takes the reset, one fails.
    fresh(questionRow({ is_practice: true, startsAt: undefined }));
    db.roster = [{ team_id: 1 }, { team_id: 2 }];
    engineBehaviour = ({ json }) => {
      if (json.game_id === "q1:2") throw httpError(503, "unavailable");
      if (json.game_id === "q1") throw httpError(404, '{"detail":"game not found"}');
      return { ok: true };
    };
    const res = await reset({});
    assert.strictEqual(res.code, 502);
    assert.deepStrictEqual(res.body.reset, ["q1:1"]);
    assert.deepStrictEqual(res.body.missing, ["q1"]);
    assert.strictEqual(res.body.failed.length, 1);
    assert.strictEqual(res.body.failed[0].id, "q1:2");
  },

  async "plain practice resets one game per team, self-paced"() {
    fresh(questionRow({ is_practice: true }));
    db.roster = [{ team_id: 1 }, { team_id: 2 }];
    engineBehaviour = ({ json }) => {
      // The bare id genuinely does not exist for a per-team question.
      if (json.game_id === "q1") throw httpError(404, '{"detail":"game not found"}');
      return { ok: true };
    };
    const res = await reset({});
    assert.strictEqual(res.code, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.startsAt, null, "practice has no timed window");
    assert.deepStrictEqual(res.body.reset, ["q1:1", "q1:2"]);
    assert.deepStrictEqual(res.body.missing, ["q1"], "tolerated, not a failure");
    assert.deepStrictEqual(res.body.failed, []);
    for (const call of engineCalls) {
      assert.strictEqual("startsAt" in call.json, false, "self-paced");
    }
    assert.strictEqual(db.updates.length, 0, "no schedule to rewrite");
  },

  async "competitive practice resets the one shared game, self-paced"() {
    fresh(questionRow({ is_practice: true, no_reset: true }));
    db.roster = [{ team_id: 1 }, { team_id: 2 }];
    const res = await reset({});
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(res.body.reset, ["q1"]);
    assert.strictEqual(engineCalls.length, 1, "one shared game, not one per team");
    assert.strictEqual("startsAt" in engineCalls[0].json, false);
    assert.strictEqual(db.updates.length, 0);
  },

  async "an unparseable board is still resettable, and is left as it is"() {
    // Corrupt question_data is often WHY an admin is resetting, so the reset
    // must go through -- but the unreadable text is kept for inspection rather
    // than replaced by a schedule-only body.
    fresh(questionRow());
    db.question.question_data = "{not json";
    const res = await reset({});
    assert.strictEqual(res.code, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body.reset, ["q1"]);
    assert.strictEqual(db.updates.length, 0, "the corrupt text is not rewritten");
    assert.strictEqual(db.question.question_data, "{not json");
  },

  async "another group's question is a 403, with no engine call"() {
    fresh(questionRow({}, { id: 7, group_id: 2 }));
    const res = await reset({}, { id: 10, group_id: 1, group_role: "manager" });
    assert.strictEqual(res.code, 403);
    assert.strictEqual(engineCalls.length, 0);
  },

  async "the owning group's manager may reset it"() {
    fresh(questionRow({}, { id: 7, group_id: 1 }));
    const res = await reset({}, { id: 10, group_id: 1, group_role: "manager" });
    assert.strictEqual(res.code, 200);
    // Always the SERVICE token: a manager is not an engine admin by itself.
    assert.match(engineCalls[0].opts.headers.Authorization, /^Bearer /);
  },

  async "an unknown question is a 404"() {
    fresh(null);
    const res = await reset({});
    assert.strictEqual(res.code, 404);
    assert.strictEqual(engineCalls.length, 0);
  },

  // --- the auto-reset clock --------------------------------------------------
  async "a manual reset pushes the cron a full interval past the new Day 1"() {
    // The cron's due time is anchored on whenever the interval was switched
    // on, so without this a manual reset could be followed seconds later by an
    // automatic one that wiped the freshly replayed game.
    fresh(questionRow({}, { id: 7, group_id: null }, { auto_reset_minutes: 30 }));
    const target = nowSec() + 600;
    const res = await reset({ startsAt: target });
    assert.strictEqual(res.code, 200);
    const written = Object.assign({}, ...db.updates);
    assert.strictEqual(
      written.auto_reset_at_sec,
      target + 30 * 60,
      "one interval after the NEW startsAt, not after now",
    );
    assert.strictEqual(JSON.parse(written.question_data).startsAt, target);
    // Both fields must land in ONE write.
    assert.strictEqual(db.updates.length, 1);
  },

  async "a question with the cron off keeps auto_reset_at_sec untouched"() {
    fresh(questionRow());
    await reset({ startsAt: nowSec() + 600 });
    const written = Object.assign({}, ...db.updates);
    assert.strictEqual("auto_reset_at_sec" in written, false);
  },

  async "a practice reset anchors the cron on now (it has no Day 1)"() {
    fresh(
      questionRow({ is_practice: true }, { id: 7, group_id: null }, { auto_reset_minutes: 5 }),
    );
    db.roster = [{ team_id: 1 }];
    engineBehaviour = ({ json }) => {
      if (json.game_id === "q1") throw httpError(404, '{"detail":"game not found"}');
      return { ok: true };
    };
    const before = nowSec();
    const res = await reset({});
    assert.strictEqual(res.code, 200, JSON.stringify(res.body));
    const written = Object.assign({}, ...db.updates);
    assert.ok(
      written.auto_reset_at_sec >= before + 5 * 60,
      "still re-armed, measured from now",
    );
    assert.strictEqual(
      "question_data" in written,
      false,
      "no schedule to rewrite for practice",
    );
  },

  async "a reset that nothing took does not re-arm the cron either"() {
    fresh(questionRow({}, { id: 7, group_id: null }, { auto_reset_minutes: 30 }));
    engineBehaviour = () => {
      throw httpError(503, "unavailable");
    };
    const res = await reset({});
    assert.strictEqual(res.code, 502);
    assert.strictEqual(db.updates.length, 0);
  },

  // --- roster detach ---------------------------------------------------------
  async "removing a team drops its seat in a shared game and its board entry"() {
    const updates = [];
    db.questions = [
      {
        id: "q1",
        match_id: 7,
        question_data: JSON.stringify({
          teams: [
            { team_id: "1", agents: [0] },
            { team_id: "2", agents: [0] },
          ],
        }),
        update: async (f) => updates.push(f),
      },
    ];
    engineCalls.length = 0;
    engineBehaviour = () => ({ ok: true, removed: true });

    const rows = await detachTeamFromMatchGames(7, 2);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].ok, true);
    assert.strictEqual(engineCalls.length, 1);
    assert.match(engineCalls[0].url, /\/game\/teams\/remove$/);
    assert.deepStrictEqual(engineCalls[0].json, { game_id: "q1", team_id: "2" });
    assert.strictEqual(engineCalls[0].opts.retry.limit, 0);
    assert.deepStrictEqual(
      JSON.parse(updates[0].question_data).teams.map((t) => t.team_id),
      ["1"],
      "the stored board must agree with the engine",
    );
  },

  async "removing a team from plain practice deletes its solo game"() {
    const updates = [];
    db.questions = [
      {
        id: "q1",
        match_id: 7,
        question_data: JSON.stringify({
          is_practice: true,
          teams: [
            { team_id: "1", agents: [0] },
            { team_id: "2", agents: [0] },
          ],
        }),
        update: async (f) => updates.push(f),
      },
    ];
    engineCalls.length = 0;
    engineBehaviour = () => ({ ok: true });

    const rows = await detachTeamFromMatchGames(7, 2);
    assert.strictEqual(rows[0].ok, true);
    assert.strictEqual(engineCalls[0].method, "DELETE");
    assert.match(engineCalls[0].url, /\/game\/q1:2$/);
    assert.deepStrictEqual(
      JSON.parse(updates[0].question_data).teams.map((t) => t.team_id),
      ["1"],
    );
  },

  async "an already-absent game is tolerated; a real failure is reported"() {
    db.questions = [
      {
        id: "q1",
        match_id: 7,
        question_data: JSON.stringify({ teams: [] }),
        update: async () => {},
      },
    ];
    engineBehaviour = () => {
      throw httpError(404, '{"detail":"game not found"}');
    };
    let rows = await detachTeamFromMatchGames(7, 2);
    assert.strictEqual(rows[0].ok, true);
    assert.strictEqual(rows[0].missing, true);

    engineBehaviour = () => {
      throw httpError(400, '{"detail":[{"loc":["body","team_id"],"msg":"field required"}]}');
    };
    rows = await detachTeamFromMatchGames(7, 2);
    assert.strictEqual(rows[0].ok, false);
    assert.strictEqual(
      rows[0].message,
      "body.team_id: field required",
      "a pydantic detail array is joined, not dumped",
    );
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
