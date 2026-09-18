/**
 * Tests for WHICH questions the standings score (no DB, no HTTP).
 *
 * Run with:  node src/controllers/hexudonSummary.test.js
 *
 * This rule has already been flipped twice, so it is pinned here:
 *   - a TIMED question is scored;
 *   - PLAIN per-team practice is skipped -- there is no single /game/result for
 *     the question id, it runs one game per team;
 *   - COMPETITIVE practice (`no_reset`) IS scored. Its shared game used to come
 *     back all zeros (`begin_game()` ran before the agent kinds were stored),
 *     which would have shown every rostered team as DNP; the engine now scores
 *     that timeline for real (`Game.competitive_final_result`), so the rows
 *     belong in the standings.
 */

const assert = require("assert");
const Module = require("module");
const path = require("path");

// The controller pulls in the model layer (and xlsx); only the model layer
// needs stubbing to load it.
const origLoad = Module._load;
Module._load = function (request) {
  const r = String(request).replace(/\\/g, "/");
  if (/(^|\/)models$/.test(r) || /models\/index$/.test(r)) {
    const model = (name) => ({ name });
    return {
      Match: model("Match"),
      Question: model("Question"),
      Round: model("Round"),
      Team: model("Team"),
    };
  }
  return origLoad.apply(this, arguments);
};
const { isPracticeQuestion } = require(path.join(__dirname, "hexudonSummary.js"));
Module._load = origLoad;

const question = (data) => ({
  id: "q1",
  name: "Q",
  order: 0,
  question_data: data === undefined ? undefined : JSON.stringify(data),
});

const tests = {
  "a timed question is scored"() {
    assert.strictEqual(isPracticeQuestion(question({ startsAt: 1 })), null);
    assert.strictEqual(
      isPracticeQuestion(question({ startsAt: 1, is_practice: false })),
      null,
    );
  },

  "plain per-team practice is skipped, with a reason"() {
    const reason = isPracticeQuestion(question({ is_practice: true }));
    assert.strictEqual(typeof reason, "string");
    assert.match(reason, /one game per team/);
    assert.strictEqual(
      isPracticeQuestion(question({ is_practice: true, no_reset: false })),
      reason,
    );
  },

  "competitive practice (no_reset) IS scored"() {
    // The engine scores the shared timeline now; skipping it would drop a real
    // ranked board out of the standings.
    assert.strictEqual(
      isPracticeQuestion(question({ is_practice: true, no_reset: true })),
      null,
    );
  },

  "a question with no or unreadable board data is scored, not skipped"() {
    assert.strictEqual(isPracticeQuestion(question(undefined)), null);
    assert.strictEqual(isPracticeQuestion({ id: "q", question_data: "" }), null);
    assert.strictEqual(
      isPracticeQuestion({ id: "q", question_data: "{not json" }),
      null,
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
