/**
 * Tests for re-anchoring a question's schedule after a reset (no DB, no HTTP).
 *
 * Run with:  node src/lib/questionSchedule.test.js
 *
 * These pin the rule that made the manager's board gate real again: a reset
 * moves Day 1 on the engine, and `question_data.startsAt` -- which
 * lib/questionVisibility.js gates the board on -- has to move with it. They
 * also pin the two pieces of arithmetic a manual reset gets wrong by hand: the
 * default start time, and the refusal of one that lands inside (or after) the
 * agent-kind window.
 */

const assert = require("assert");
const {
  DEFAULT_SELECTION_SECONDS,
  REPLAY_LEAD_SECONDS,
  defaultResetStartsAt,
  rejectResetStartsAt,
  selectionSecondsOf,
  shiftQuestionSchedule,
} = require("./questionSchedule");
const { redactQuestionForTeam } = require("./questionVisibility");

const NOW_MS = 1_700_000_000_000; // fixed clock: 1700000000 s
const NOW_SEC = 1_700_000_000;

const BOARD = {
  startsAt: 1_699_000_000,
  agent_selection_time_limit: 45,
  daySeconds: [45, 45, 45, 45],
  map: { width: 8, height: 8, cells: [[0]] },
  teams: [{ team_id: "37", agents: [0, 1] }],
};

const tests = {
  "startsAt is replaced and the board is left untouched"() {
    const out = shiftQuestionSchedule(BOARD, NOW_SEC);
    assert.strictEqual(out.changed, true);
    assert.strictEqual(out.data.startsAt, NOW_SEC);
    assert.strictEqual(out.delta, NOW_SEC - BOARD.startsAt);
    assert.deepStrictEqual(out.data.map, BOARD.map);
    assert.deepStrictEqual(out.data.teams, BOARD.teams);
    // The original row is not mutated -- the caller writes `json`.
    assert.strictEqual(BOARD.startsAt, 1_699_000_000);
    assert.strictEqual(JSON.parse(out.json).startsAt, NOW_SEC);
  },

  "question_data as stored (a JSON string) is accepted too"() {
    const out = shiftQuestionSchedule(JSON.stringify(BOARD), NOW_SEC);
    assert.strictEqual(out.changed, true);
    assert.strictEqual(out.data.startsAt, NOW_SEC);
  },

  "endsAt moves by exactly the same delta"() {
    const endsAt = BOARD.startsAt + 600;
    const out = shiftQuestionSchedule({ ...BOARD, endsAt }, NOW_SEC);
    assert.strictEqual(out.data.endsAt, endsAt + out.delta);
    assert.strictEqual(out.data.endsAt - out.data.startsAt, 600, "duration kept");
  },

  "a per-day endsAt array moves entry by entry"() {
    const endsAt = [BOARD.startsAt + 100, BOARD.startsAt + 200];
    const out = shiftQuestionSchedule({ ...BOARD, endsAt }, NOW_SEC);
    assert.deepStrictEqual(out.data.endsAt, [
      NOW_SEC + 100,
      NOW_SEC + 200,
    ]);
  },

  "a row with no startsAt yet simply gets one"() {
    const noStart = { ...BOARD };
    delete noStart.startsAt;
    const out = shiftQuestionSchedule(noStart, NOW_SEC);
    assert.strictEqual(out.changed, true);
    assert.strictEqual(out.data.startsAt, NOW_SEC);
    assert.strictEqual(out.delta, 0, "nothing derived to shift against");
  },

  "practice questions are never re-anchored (self-paced)"() {
    for (const extra of [{ is_practice: true }, { is_practice: true, no_reset: true }]) {
      const out = shiftQuestionSchedule({ ...BOARD, ...extra }, NOW_SEC);
      assert.strictEqual(out.changed, false);
      assert.match(out.reason, /self-paced/);
    }
  },

  "nothing to write when it already starts there"() {
    const out = shiftQuestionSchedule(BOARD, BOARD.startsAt);
    assert.strictEqual(out.changed, false);
    assert.strictEqual(out.json, null);
  },

  "a missing startsAt to apply, or unusable data, changes nothing"() {
    assert.strictEqual(shiftQuestionSchedule(BOARD, null).changed, false);
    assert.strictEqual(shiftQuestionSchedule(BOARD, "soon").changed, false);
    assert.strictEqual(shiftQuestionSchedule("{not json", NOW_SEC).changed, false);
    assert.strictEqual(shiftQuestionSchedule(null, NOW_SEC).changed, false);
  },

  "after a reset the board gate closes again"() {
    // THE point of this module. Reset at NOW to a Day 1 one minute out: the
    // board must go back to being withheld until the new window opens.
    const startsAt = NOW_SEC + 60;
    const shifted = shiftQuestionSchedule(BOARD, startsAt);
    const row = { id: 1, question_data: shifted.json };
    const redacted = redactQuestionForTeam(row, NOW_SEC);
    const data = JSON.parse(redacted.question_data);
    assert.strictEqual(data.board_withheld, true, "the map must be withheld again");
    assert.strictEqual(data.map, undefined);
    assert.strictEqual(data.startsAt, startsAt);
    // ...and published again once the window opens.
    const atWindow = startsAt - BOARD.agent_selection_time_limit;
    assert.strictEqual(redactQuestionForTeam(row, atWindow), row);
  },

  "the pre-match window is read off the board, 0 included"() {
    assert.strictEqual(selectionSecondsOf(BOARD), 45);
    assert.strictEqual(selectionSecondsOf({ agent_selection_time_limit: 0 }), 0);
    assert.strictEqual(selectionSecondsOf({}), DEFAULT_SELECTION_SECONDS);
    assert.strictEqual(selectionSecondsOf("{not json"), DEFAULT_SELECTION_SECONDS);
    assert.strictEqual(
      selectionSecondsOf({ agent_selection_time_limit: -5 }),
      DEFAULT_SELECTION_SECONDS,
      "a negative window is not a window",
    );
  },

  "the default replay start clears the whole window, plus breathing room"() {
    assert.strictEqual(
      defaultResetStartsAt(BOARD, NOW_MS),
      NOW_SEC + 45 + REPLAY_LEAD_SECONDS,
    );
    assert.strictEqual(
      defaultResetStartsAt({}, NOW_MS),
      NOW_SEC + DEFAULT_SELECTION_SECONDS + REPLAY_LEAD_SECONDS,
    );
    // The default must always be acceptable to the guard below.
    assert.strictEqual(
      rejectResetStartsAt(BOARD, defaultResetStartsAt(BOARD, NOW_MS), NOW_MS),
      null,
    );
  },

  "a start time inside the agent-kind window is refused"() {
    // This is the bug the admin dialog walked into: it pre-filled the current
    // minute, so every team's window was already over and the engine defaulted
    // all of them to all-patrol.
    assert.match(
      rejectResetStartsAt(BOARD, NOW_SEC, NOW_MS),
      /agent-kind window would already be closed/,
    );
    assert.match(
      rejectResetStartsAt(BOARD, NOW_SEC + 44, NOW_MS),
      /agent-kind window would already be closed/,
    );
    assert.strictEqual(
      rejectResetStartsAt(BOARD, NOW_SEC + 45, NOW_MS),
      null,
      "exactly one full window is enough",
    );
    assert.match(rejectResetStartsAt(BOARD, "later", NOW_MS), /epoch seconds/);
  },

  "with no window configured, anything from now on is fine"() {
    const noWindow = { ...BOARD, agent_selection_time_limit: 0 };
    assert.strictEqual(rejectResetStartsAt(noWindow, NOW_SEC, NOW_MS), null);
    assert.match(
      rejectResetStartsAt(noWindow, NOW_SEC - 1, NOW_MS),
      /already be closed/,
      "the past is still the past",
    );
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${e.message}`);
  }
}
const total = Object.keys(tests).length;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
