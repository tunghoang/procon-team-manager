/**
 * What a TEAM may read of a question before its match opens.
 *
 * `question_data` IS the /game/init body: map, spots, day steps, fuel cap,
 * thresholds -- the match's whole puzzle. The docs publish that in the
 * pre-match phase, so the game service serves it from
 * `startsAt - agent_selection_time_limit` (when the agent-kind window opens --
 * see `Game.board_is_public`) and withholds it before then. This endpoint is
 * the other route to the same bytes, so it has to hold the same line or the
 * gate is decorative: a team could pull the board from the manager and spend
 * the entire lead-in planning on it.
 *
 * What survives is schedule only -- when Day 1 opens, how long the agent-kind
 * window is, and which mode the question runs in (the play screen picks its
 * component from those flags before any board exists).
 *
 * Practice questions are never redacted: they are self-paced, `startsAt` means
 * nothing for them, and their board is what the practice screen plays on.
 *
 * Kept as a pure module (no Express, no Sequelize) so the rule can be tested
 * directly -- see questionVisibility.test.js.
 */

const PRE_START_QUESTION_DATA_FIELDS = [
  "startsAt",
  "agent_selection_time_limit",
  "is_practice",
  "no_reset",
];

/** Sequelize instance or plain row -> plain row. */
const toPlain = (question) =>
  typeof question?.toJSON === "function" ? question.toJSON() : { ...question };

/**
 * @param question   a Question row (Sequelize instance or plain object)
 * @param nowSec     current epoch SECONDS (question_data.startsAt's unit)
 * @returns the same row, or a copy whose question_data holds schedule only
 */
const redactQuestionForTeam = (question, nowSec = Date.now() / 1000) => {
  let data;
  try {
    data = JSON.parse(toPlain(question).question_data || "{}");
  } catch {
    // Unparseable data can't be redacted field-by-field -> withhold it whole.
    return { ...toPlain(question), question_data: null };
  }
  const startsAt = Number(data.startsAt);
  // startsAt is Day 1; the board goes public one agent-kind window earlier.
  const window = Number(data.agent_selection_time_limit);
  const publishedAt = startsAt - (Number.isFinite(window) ? window : 0);
  // No parsable start time means nothing to gate on; a board with no schedule
  // is a practice/manual row, and hiding it forever would break those screens.
  if (data.is_practice || !Number.isFinite(startsAt) || nowSec >= publishedAt) {
    return question;
  }
  const kept = {};
  for (const field of PRE_START_QUESTION_DATA_FIELDS) {
    if (data[field] !== undefined) kept[field] = data[field];
  }
  // Flagged, not silently thinned, so a client can say "opens at ..." instead
  // of rendering an empty board.
  kept.board_withheld = true;
  return { ...toPlain(question), question_data: JSON.stringify(kept) };
};

module.exports = { PRE_START_QUESTION_DATA_FIELDS, redactQuestionForTeam };
