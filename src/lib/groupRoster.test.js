/**
 * Tests for the group/roster invariant (no DB: the query layer is stubbed).
 *
 * Run with:  node src/lib/groupRoster.test.js
 *
 * The rule: a team may not be moved out of (or between) groups while it is
 * still rostered on that group's LIVE matches, because the match would be left
 * with a player its group no longer contains.
 *
 * But a FINISHED match must not block the move. Its roster is the record its
 * results are scored against (lib/hexudonSummary.js gives every rostered team
 * a position), so requiring an operator to strip a team off last week's
 * brackets before moving it to another group would destroy history to do
 * paperwork.
 */

const assert = require("assert");
const Module = require("module");
const path = require("path");

// Rows the stubbed `sequelize.query` hands back.
let rows = [];
const origLoad = Module._load;
Module._load = function (request) {
  const r = String(request).replace(/\\/g, "/");
  if (/(^|\/)models$/.test(r) || /models\/index$/.test(r)) {
    return { sequelize: { query: async () => rows } };
  }
  return origLoad.apply(this, arguments);
};
const { groupMoveConflict, isLiveMatch, matchesBlockingGroupMove } = require(
  path.join(__dirname, "groupRoster.js"),
);
Module._load = origLoad;

const NOW = new Date("2026-09-18T12:00:00Z");
const PAST = new Date("2026-09-01T12:00:00Z");
const FUTURE = new Date("2026-10-01T12:00:00Z");

const team = (over = {}) => ({ id: 11, name: "Alpha", group_id: 1, ...over });

const tests = {
  "a live match blocks the move and is named"() {
    rows = [{ id: 5, name: "Group A / R1", is_active: 1, end_time: FUTURE }];
    return groupMoveConflict(team(), 2).then((conflict) => {
      assert.ok(conflict, "the move must be refused");
      assert.strictEqual(conflict.status, 409);
      assert.match(conflict.message, /Group A \/ R1/);
      assert.match(conflict.message, /Alpha/);
    });
  },

  async "a match with no end time counts as live"() {
    rows = [{ id: 5, name: "Open", is_active: 1, end_time: null }];
    assert.ok(await groupMoveConflict(team(), 2));
  },

  async "an inactive match does not block"() {
    rows = [{ id: 5, name: "Done", is_active: 0, end_time: FUTURE }];
    assert.strictEqual(await groupMoveConflict(team(), 2), null);
  },

  async "a match whose end time has passed does not block"() {
    rows = [{ id: 5, name: "Group stage", is_active: 1, end_time: PAST }];
    assert.strictEqual(
      await groupMoveConflict(team(), 2),
      null,
      "the group stage is over; the roster stays as the record",
    );
  },

  async "one live match among finished ones still blocks, and only it is named"() {
    // The fixture name deliberately avoids the words the refusal text itself
    // uses ("LIVE", "Finished matches"), so this asserts on the match LIST.
    rows = [
      { id: 5, name: "Group stage R1", is_active: 0, end_time: PAST },
      { id: 6, name: "Running", is_active: 1, end_time: FUTURE },
    ];
    const conflict = await groupMoveConflict(team(), 2);
    assert.ok(conflict);
    assert.match(conflict.message, /Running/);
    assert.ok(
      !/Group stage R1/.test(conflict.message),
      "a finished match must not be listed as a blocker",
    );
  },

  async "the 409 says finished matches are exempt, so the operator knows"() {
    rows = [{ id: 6, name: "Running", is_active: 1, end_time: FUTURE }];
    const conflict = await groupMoveConflict(team(), 2);
    assert.match(conflict.message, /LIVE/);
    assert.match(conflict.message, /Finished matches/i);
  },

  async "ungrouping is checked the same way as moving"() {
    rows = [{ id: 6, name: "Running", is_active: 1, end_time: FUTURE }];
    assert.ok(await groupMoveConflict(team(), null), "to no group at all");
  },

  async "a team with no group, or not actually moving, is never blocked"() {
    rows = [{ id: 6, name: "Running", is_active: 1, end_time: FUTURE }];
    assert.strictEqual(
      await groupMoveConflict(team({ group_id: null }), 2),
      null,
      "nothing to leave",
    );
    assert.strictEqual(
      await groupMoveConflict(team(), 1),
      null,
      "same group -- not a move",
    );
    assert.strictEqual(
      await groupMoveConflict(team({ group_id: "1" }), 1),
      null,
      "string ids from a query compare equal",
    );
  },

  async "no rostered match at all is no conflict"() {
    rows = [];
    assert.strictEqual(await groupMoveConflict(team(), 2), null);
    assert.deepStrictEqual(await matchesBlockingGroupMove(11, 1), []);
    assert.deepStrictEqual(
      await matchesBlockingGroupMove(11, null),
      [],
      "no group to leave -> no query",
    );
  },

  "isLiveMatch reads MySQL's 0/1 and an unreadable date"() {
    assert.strictEqual(isLiveMatch({ is_active: 1, end_time: FUTURE }, NOW), true);
    assert.strictEqual(isLiveMatch({ is_active: true, end_time: null }, NOW), true);
    assert.strictEqual(isLiveMatch({ is_active: 0, end_time: null }, NOW), false);
    assert.strictEqual(isLiveMatch({ is_active: false, end_time: FUTURE }, NOW), false);
    assert.strictEqual(isLiveMatch({ is_active: 1, end_time: PAST }, NOW), false);
    assert.strictEqual(
      isLiveMatch({ is_active: 1, end_time: "not a date" }, NOW),
      true,
      "an unreadable end time must not silently exempt a match",
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
