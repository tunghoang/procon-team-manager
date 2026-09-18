/**
 * Pure rules for re-anchoring a question's SCHEDULE inside `question_data`.
 *
 * `question_data` is the /game/init body, and `startsAt` inside it is Day 1's
 * opening. Every reader on this side gates on that value:
 *   - lib/questionVisibility.js publishes the board at
 *     `startsAt - agent_selection_time_limit` and withholds it before then;
 *   - the play screen counts down to it.
 *
 * A reset moves Day 1 on the ENGINE, so unless the same move is written back
 * here the manager keeps serving the old schedule -- which made the board gate
 * decorative after any reset (a team could read the full map during the new
 * lead-in) and left the UI counting down to a time that had already passed.
 *
 * Both reset paths (the cron in lib/autoReset.js and the manual
 * POST /question/:id/reset) go through this one helper so they can never drift
 * apart. No DB and no HTTP -- see questionSchedule.test.js.
 */

/** Practice questions are self-paced: `startsAt` means nothing for them. */
const PRACTICE_REASON =
  "practice question: self-paced, no timed window to re-anchor";

/** question_data as stored (JSON text) or already parsed -> object, or null. */
const parseStoredBoard = (questionData) => {
  if (questionData == null) return null;
  if (typeof questionData === "object") return questionData;
  try {
    const parsed = JSON.parse(questionData || "{}");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const shiftValue = (value, delta) => {
  const num = Number(value);
  return Number.isFinite(num) ? num + delta : value;
};

/**
 * Re-anchor `question_data` to a new Day-1 time.
 *
 * `endsAt` (when a row carries one -- a number, or one entry per day) is a
 * DERIVED deadline, so it moves by exactly the same delta rather than being
 * recomputed here: this module knows nothing about day lengths.
 *
 * @param {object|string} questionData  question_data, parsed or as stored
 * @param {number} newStartsAt          the engine's new Day 1, EPOCH SECONDS
 * @returns {{changed: boolean, data: object|null, json: string|null,
 *            delta: number, reason: string|null}}
 *          `changed` is true only when the row actually needs writing;
 *          `reason` says why it does not.
 */
const shiftQuestionSchedule = (questionData, newStartsAt) => {
  const data = parseStoredBoard(questionData);
  const none = (reason) => ({
    changed: false,
    data,
    json: null,
    delta: 0,
    reason,
  });

  if (!data) return none("question_data is not usable JSON");
  // null/undefined/"" all come out of Number() as 0 or NaN, and a startsAt of
  // 0 is not a time -- guard the absent cases before coercing.
  if (newStartsAt == null || newStartsAt === "") return none("no startsAt to apply");
  const target = Number(newStartsAt);
  if (!Number.isFinite(target) || target <= 0) return none("no startsAt to apply");
  // Covers BOTH practice modes: plain practice (one solo game per team) and
  // competitive practice (one shared, self-paced game). Neither reset path
  // sends the engine a startsAt for them either.
  if (data.is_practice) return none(PRACTICE_REASON);

  const previous = Number(data.startsAt);
  const delta = Number.isFinite(previous) ? target - previous : 0;
  const next = { ...data, startsAt: target };
  let shiftedEnds = false;
  if (delta !== 0 && data.endsAt !== undefined) {
    if (Array.isArray(data.endsAt)) {
      next.endsAt = data.endsAt.map((value) => shiftValue(value, delta));
      shiftedEnds = true;
    } else if (Number.isFinite(Number(data.endsAt))) {
      next.endsAt = Number(data.endsAt) + delta;
      shiftedEnds = true;
    }
  }

  // Already anchored there (and nothing derived to move): no write needed.
  if (previous === target && !shiftedEnds) {
    return none("question_data already starts at that time");
  }

  return {
    changed: true,
    data: next,
    json: JSON.stringify(next),
    delta,
    reason: null,
  };
};

/**
 * The default Day-1 time a MANUAL reset offers, in epoch seconds.
 *
 * `now + agent_selection_time_limit + REPLAY_LEAD_SECONDS`: the engine puts the
 * pre-match window in `[startsAt - limit, startsAt)`, so anchoring at
 * `now + limit` would open the window in the same instant the admin clicked and
 * give nobody time to see it. The extra minute is that breathing room -- the
 * admin's own pick overrides it.
 */
const REPLAY_LEAD_SECONDS = 60;

/** Fallback pre-match window when a board does not declare one. */
const DEFAULT_SELECTION_SECONDS = 60;

/** The board's pre-match window in seconds; 0 is a real answer, absent is not. */
const selectionSecondsOf = (questionData) => {
  const data = parseStoredBoard(questionData) || {};
  const limit = Number(data.agent_selection_time_limit);
  return Number.isFinite(limit) && limit >= 0 ? limit : DEFAULT_SELECTION_SECONDS;
};

const defaultResetStartsAt = (questionData, nowMs = Date.now()) =>
  Math.floor(nowMs / 1000) + selectionSecondsOf(questionData) + REPLAY_LEAD_SECONDS;

/**
 * Is this an acceptable Day-1 time for a replay?
 *
 * Anything earlier than `now + limit` hands every team a pre-match window that
 * is already (partly) over, which defaults them all to all-patrol -- the exact
 * bug the admin dialog used to walk into by pre-filling the current minute.
 *
 * @returns {string|null} the refusal message, or null when it is fine
 */
const rejectResetStartsAt = (questionData, startsAt, nowMs = Date.now()) => {
  if (startsAt == null || startsAt === "") return "startsAt must be epoch seconds";
  const target = Number(startsAt);
  if (!Number.isFinite(target) || target <= 0) {
    return "startsAt must be epoch seconds";
  }
  const earliest = Math.floor(nowMs / 1000) + selectionSecondsOf(questionData);
  if (target < earliest) {
    return (
      "the agent-kind window would already be closed: startsAt must be at " +
      `least ${earliest} (now + ${selectionSecondsOf(questionData)}s of ` +
      "agent selection)"
    );
  }
  return null;
};

module.exports = {
  DEFAULT_SELECTION_SECONDS,
  PRACTICE_REASON,
  REPLAY_LEAD_SECONDS,
  defaultResetStartsAt,
  parseStoredBoard,
  rejectResetStartsAt,
  selectionSecondsOf,
  shiftQuestionSchedule,
};
