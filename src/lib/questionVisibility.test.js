/**
 * Tests for what a team may read of a question before its match opens.
 *
 * Run with:  node src/lib/questionVisibility.test.js
 *
 * question_data IS the /game/init body, so this endpoint is a second route to
 * the board the game service publishes when the pre-match agent-kind window
 * opens (startsAt - agent_selection_time_limit) and withholds before that.
 * These pin that it holds the same line, and that it does not break the screens
 * that legitimately need a board (practice) or an open match.
 */

const assert = require("assert");
const { redactQuestionForTeam } = require("./questionVisibility");

const BOARD = {
  startsAt: 1_700_000_000,
  agent_selection_time_limit: 45,
  daySeconds: [45, 45, 45, 45],
  daySteps: [16, 16, 16, 16],
  map: { width: 8, height: 8, cells: [[0]] },
  spots: [{ pos: 20, brand: 0, stocks: 1 }],
  fuelLimits: 16,
  players: 2,
  busyThreshold: 1,
  jammedThreshold: 2,
  teams: [{ team_id: "37", agents: [0, 1, 2] }],
};

const row = (data, extra = {}) => ({
  id: 42,
  name: "Q",
  question_data: JSON.stringify(data),
  ...extra,
});

const dataOf = (result) => JSON.parse(result.question_data);

const tests = {
  "before the pre-match window the board is gone but the schedule stays"() {
    // startsAt - 45 s is when it would be published; a second earlier is not.
    const out = dataOf(redactQuestionForTeam(row(BOARD), 1_699_999_954));
    assert.deepStrictEqual(Object.keys(out).sort(), [
      "agent_selection_time_limit",
      "board_withheld",
      "startsAt",
    ]);
    assert.strictEqual(out.board_withheld, true);
    assert.strictEqual(out.startsAt, BOARD.startsAt);
    assert.strictEqual(out.agent_selection_time_limit, 45);
  },

  "every board field is withheld, not just the map"() {
    const out = dataOf(redactQuestionForTeam(row(BOARD), 1_699_999_000));
    for (const field of [
      "map",
      "spots",
      "teams",
      "daySteps",
      "daySeconds",
      "fuelLimits",
      "players",
      "busyThreshold",
      "jammedThreshold",
    ]) {
      assert.strictEqual(out[field], undefined, `${field} leaked`);
    }
  },

  "the board is published when the pre-match window opens, and stays"() {
    const input = row(BOARD);
    const opensAt = BOARD.startsAt - BOARD.agent_selection_time_limit;
    assert.strictEqual(redactQuestionForTeam(input, opensAt), input);
    assert.strictEqual(redactQuestionForTeam(input, BOARD.startsAt), input);
    assert.strictEqual(redactQuestionForTeam(input, 1_700_000_001), input);
  },

  "a question with no window publishes at startsAt itself"() {
    const noWindow = { ...BOARD };
    delete noWindow.agent_selection_time_limit;
    const input = row(noWindow);
    assert.notStrictEqual(redactQuestionForTeam(input, BOARD.startsAt - 1), input);
    assert.strictEqual(redactQuestionForTeam(input, BOARD.startsAt), input);
  },

  "practice questions are never redacted (self-paced, startsAt is moot)"() {
    const input = row({ ...BOARD, is_practice: true });
    assert.strictEqual(redactQuestionForTeam(input, 1_699_999_000), input);
    const shared = row({ ...BOARD, is_practice: true, no_reset: true });
    assert.strictEqual(redactQuestionForTeam(shared, 1_699_999_000), shared);
  },

  "the mode flags survive redaction (the play screen picks its view from them)"() {
    // A timed row carries them as false; they must round-trip when present.
    const out = dataOf(
      redactQuestionForTeam(
        row({ ...BOARD, is_practice: false, no_reset: false }),
        1_699_999_000,
      ),
    );
    assert.strictEqual(out.is_practice, false);
    assert.strictEqual(out.no_reset, false);
  },

  "a row with no parsable startsAt is left alone"() {
    const input = row({ map: BOARD.map });
    assert.strictEqual(redactQuestionForTeam(input, 1_699_999_000), input);
  },

  "unparseable question_data is withheld whole rather than half-redacted"() {
    const out = redactQuestionForTeam(
      { id: 9, name: "Q", question_data: "{not json" },
      1_699_999_000,
    );
    assert.strictEqual(out.question_data, null);
    assert.strictEqual(out.id, 9);
  },

  "a Sequelize instance is flattened through toJSON"() {
    const instance = {
      id: 42,
      question_data: JSON.stringify(BOARD),
      toJSON() {
        return { id: this.id, question_data: this.question_data, extra: 1 };
      },
    };
    const out = redactQuestionForTeam(instance, 1_699_999_000);
    assert.strictEqual(out.extra, 1);
    assert.strictEqual(dataOf(out).board_withheld, true);
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
