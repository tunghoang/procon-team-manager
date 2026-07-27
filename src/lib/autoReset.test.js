/**
 * Tests for the auto-reset cron's planning rules (no DB, no HTTP).
 *
 * Run with:  node src/lib/autoReset.test.js
 *
 * These pin what a scheduled reset actually does per match mode, and the one
 * piece of arithmetic that is easy to get wrong: a timed match must come back
 * with its agent-kind window intact, not already closed.
 */

const assert = require("assert");
const {
  MAX_MINUTES,
  MIN_MINUTES,
  autoResetTargets,
  isPerTeamQuestion,
  nextDueSec,
} = require("./autoResetPlan");

const NOW_MS = 1_700_000_000_000; // fixed clock: 1700000000 s
const question = (data, id = 42) => ({
  id,
  match_id: 7,
  question_data: JSON.stringify(data),
});

const tests = {
  "a timed match restarts Day 1 one pre-match window from now"() {
    // startsAt IS Day 1 and the window sits before it, so now + window gives the
    // replayed match its whole pre-match phase (board + choice) back.
    const targets = autoResetTargets(
      question({ startsAt: 1, agent_selection_time_limit: 45 }),
      [],
      NOW_MS,
    );
    assert.deepStrictEqual(targets, [
      { gameId: "42", startsAt: 1_700_000_000 + 45 },
    ]);
  },

  "a timed match with no window configured restarts at now"() {
    const targets = autoResetTargets(question({ startsAt: 1 }), [], NOW_MS);
    assert.deepStrictEqual(targets, [{ gameId: "42", startsAt: 1_700_000_000 }]);
  },

  "plain practice resets one solo game per team, self-paced"() {
    const targets = autoResetTargets(
      question({ is_practice: true }),
      [37, 38],
      NOW_MS,
    );
    assert.deepStrictEqual(targets, [
      { gameId: "42:37", startsAt: undefined },
      { gameId: "42:38", startsAt: undefined },
    ]);
  },

  "competitive practice resets the one shared game, self-paced"() {
    const targets = autoResetTargets(
      question({ is_practice: true, no_reset: true, agent_selection_time_limit: 30 }),
      [37, 38],
      NOW_MS,
    );
    assert.deepStrictEqual(targets, [{ gameId: "42", startsAt: undefined }]);
  },

  "only plain practice needs the roster looked up"() {
    assert.strictEqual(isPerTeamQuestion(question({ is_practice: true })), true);
    assert.strictEqual(
      isPerTeamQuestion(question({ is_practice: true, no_reset: true })),
      false,
    );
    assert.strictEqual(isPerTeamQuestion(question({ startsAt: 1 })), false);
  },

  "unparseable question_data is treated as a timed match, never crashes"() {
    const targets = autoResetTargets(
      { id: 9, question_data: "{not json" },
      [],
      NOW_MS,
    );
    assert.deepStrictEqual(targets, [{ gameId: "9", startsAt: 1_700_000_000 }]);
  },

  "the next due time is the interval away, in epoch SECONDS"() {
    // Seconds, not a Date: the column is an integer because this deployment's
    // MySQL session (UTC) and Node (+07:00) disagree about DATETIME.
    assert.strictEqual(nextDueSec(1, NOW_MS), 1_700_000_000 + 60);
    assert.strictEqual(nextDueSec(90, NOW_MS), 1_700_000_000 + 90 * 60);
  },

  "the interval bounds are a minute to a day"() {
    assert.strictEqual(MIN_MINUTES, 1);
    assert.strictEqual(MAX_MINUTES, 1440);
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
