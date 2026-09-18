/**
 * Tests for engineErrorMessage (no DB: the model layer is stubbed).
 *
 * Run with:  node src/lib/common.test.js
 *
 * This is what a team or an admin actually reads when the game service refuses
 * something, so it has to surface the engine's own `detail` and nothing else:
 * forwarding got's raw body put `{"detail":"game not found"}` into a toast, and
 * a proxy's HTML error page would put a whole document there.
 */

const assert = require("assert");
const Module = require("module");
const path = require("path");

const origLoad = Module._load;
Module._load = function (request) {
  const r = String(request).replace(/\\/g, "/");
  if (/(^|\/)models$/.test(r) || /models\/index$/.test(r)) {
    return { sequelize: { query: async () => [] } };
  }
  return origLoad.apply(this, arguments);
};
const { engineErrorMessage } = require(path.join(__dirname, "common.js"));
Module._load = origLoad;

/** A got HTTPError, as this codebase sees it. */
const err = (statusCode, body) => {
  const e = new Error(`Response code ${statusCode}`);
  e.response = { statusCode, body };
  return e;
};

const tests = {
  "a FastAPI string detail is the message"() {
    assert.strictEqual(
      engineErrorMessage(err(404, '{"detail":"game not found"}')),
      "game not found",
    );
  },

  "a pydantic detail array is joined into something readable"() {
    assert.strictEqual(
      engineErrorMessage(
        err(
          422,
          '{"detail":[{"loc":["body","daySteps"],"msg":"field required"},' +
            '{"loc":["body","map"],"msg":"not a valid dict"}]}',
        ),
      ),
      "body.daySteps: field required; body.map: not a valid dict",
    );
  },

  "an already-parsed body object works the same"() {
    assert.strictEqual(
      engineErrorMessage(err(400, { detail: "bad config" })),
      "bad config",
    );
  },

  "a `message` key is accepted as a fallback"() {
    assert.strictEqual(
      engineErrorMessage(err(400, '{"message":"nope"}')),
      "nope",
    );
  },

  "JSON with no usable field falls back to the status"() {
    assert.strictEqual(engineErrorMessage(err(500, "{}")), "HTTP 500");
    assert.strictEqual(
      engineErrorMessage(err(500, '{"detail":[]}')),
      "HTTP 500",
      "an empty detail array is not a message",
    );
    assert.strictEqual(engineErrorMessage(err(500, '{"detail":""}')), "HTTP 500");
  },

  "an HTML error page is NOT forwarded"() {
    // A gateway in front of the engine answers with a document; a toast full of
    // markup tells the admin nothing.
    assert.strictEqual(
      engineErrorMessage(err(502, "<!doctype html><html><body>502 Bad Gateway</body></html>")),
      "HTTP 502",
    );
    assert.strictEqual(
      engineErrorMessage(err(503, "<html>service unavailable</html>")),
      "HTTP 503",
    );
  },

  "an over-long non-JSON body collapses to the status"() {
    assert.strictEqual(engineErrorMessage(err(500, "x".repeat(5000))), "HTTP 500");
  },

  "a short plain-text body is kept"() {
    assert.strictEqual(engineErrorMessage(err(503, "unavailable")), "unavailable");
    assert.strictEqual(
      engineErrorMessage(err(503, "  unavailable  ")),
      "unavailable",
      "trimmed",
    );
  },

  "an empty body, or no response at all, falls back sensibly"() {
    assert.strictEqual(engineErrorMessage(err(500, "")), "HTTP 500");
    assert.strictEqual(engineErrorMessage(err(500, null)), "HTTP 500");
    const noResponse = new Error("ETIMEDOUT");
    assert.strictEqual(engineErrorMessage(noResponse), "ETIMEDOUT");
    assert.strictEqual(engineErrorMessage(undefined), undefined);
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
