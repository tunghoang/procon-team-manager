/**
 * Pure planning half of the per-question auto-reset cron: the interval bounds,
 * the next-due arithmetic, and which engine game(s) one question's reset has to
 * hit. No DB and no HTTP, so it can be tested directly (autoReset.test.js) --
 * the side-effecting half lives in autoReset.js.
 */

/** Bounds for the admin-set interval: a minute apart at the fastest, a day at the slowest. */
const MIN_MINUTES = 1;
const MAX_MINUTES = 1440;

const parseQuestionData = (question) => {
  try {
    return JSON.parse(question?.question_data || "{}");
  } catch {
    return {};
  }
};

/**
 * Next due instant for an interval, in EPOCH SECONDS (the unit the column
 * stores -- see models/question.js for why it is not a DATETIME).
 */
const nextDueSec = (minutes, fromMs = Date.now()) =>
  Math.floor(fromMs / 1000) + minutes * 60;

/**
 * Which engine game(s) one question's reset has to hit, and with what schedule.
 * Mirrors the admin UI's manual reset (pages/questions.jsx#doReset) so both
 * paths behave identically:
 *   plain practice        -> one solo game per team, `${questionId}:${teamId}`
 *   competitive practice  -> the one shared game, self-paced (no startsAt)
 *   timed match           -> the one shared game, re-anchored to a new Day 1
 *
 * The timed case re-anchors to `now`: `startsAt` OPENS the agent-kind window
 * (and publishes the board), with Day 1 one window later, so `now` restarts the
 * match immediately with the full window intact -- which is the whole point of
 * replaying it.
 */
const autoResetTargets = (question, teamIds = [], nowMs = Date.now()) => {
  const data = parseQuestionData(question);
  const isPractice = !!data.is_practice;
  const noReset = !!data.no_reset;

  if (isPractice && !noReset) {
    return teamIds.map((teamId) => ({
      gameId: `${question.id}:${teamId}`,
      startsAt: undefined,
    }));
  }
  if (isPractice) {
    return [{ gameId: String(question.id), startsAt: undefined }];
  }
  return [{ gameId: String(question.id), startsAt: Math.floor(nowMs / 1000) }];
};

/** True when the question's games are one-per-team (plain practice). */
const isPerTeamQuestion = (question) => {
  const data = parseQuestionData(question);
  return !!data.is_practice && !data.no_reset;
};

module.exports = {
  MAX_MINUTES,
  MIN_MINUTES,
  autoResetTargets,
  isPerTeamQuestion,
  nextDueSec,
  parseQuestionData,
};
