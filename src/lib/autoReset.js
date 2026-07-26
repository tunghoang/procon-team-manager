/**
 * Per-question auto-reset cron (side-effecting half; the planning rules live in
 * autoResetPlan.js).
 *
 * An admin can give a question an interval (minutes); every interval the
 * question's game(s) are wiped back to the agent-selection stage -- same effect
 * as the manual "reset question" button -- so the same board can be played
 * again from Day 1 without anyone clicking. Used for open training sessions
 * where a match should keep recycling on its own.
 *
 * Why here and not in the engine: "a question" is a team-manager concept, and a
 * question maps to one game (timed / competitive practice) or to N per-team
 * games (plain practice). The manager is the only side that knows which, and it
 * can already mint its own admin token for the engine (serviceAdminToken).
 *
 * Interval bookkeeping lives in two columns on `question`:
 *   auto_reset_minutes  0 = off
 *   auto_reset_at       when the next reset is due; also the claim token, so
 *                       two app instances can't both fire the same reset (the
 *                       tick only touches rows whose due time has passed and
 *                       moves it forward in the same UPDATE -- exactly one
 *                       instance gets affectedRows = 1).
 */
const got = require("got");
const { Op, QueryTypes } = require("sequelize");
const { migrated, sequelize, Question } = require("../models");
const { getServiceApi, serviceAdminToken } = require("./common");
const {
  MAX_MINUTES,
  MIN_MINUTES,
  autoResetTargets,
  isPerTeamQuestion,
  nextDueSec,
} = require("./autoResetPlan");

const TICK_MS = Number(process.env.AUTO_RESET_TICK_MS || 15_000);

const teamIdsForMatch = async (matchId) => {
  const rows = await sequelize.query(
    "SELECT team_id FROM team_match WHERE match_id = :matchId",
    { replacements: { matchId }, type: QueryTypes.SELECT },
  );
  return rows.map((row) => row.team_id);
};

const postReset = (gameId, startsAt) =>
  got.post(`${getServiceApi()}/game/reset`, {
    headers: { Authorization: `Bearer ${serviceAdminToken()}` },
    json: startsAt != null ? { game_id: gameId, startsAt } : { game_id: gameId },
    timeout: { request: 10_000 },
  });

/**
 * Reset every engine game behind one question. Returns {total, failed} rather
 * than throwing: one dead game must not stop the others, or stop the cron.
 */
const resetGamesForQuestion = async (question) => {
  const teamIds = isPerTeamQuestion(question)
    ? await teamIdsForMatch(question.match_id)
    : [];
  const targets = autoResetTargets(question, teamIds);

  let failed = 0;
  for (const { gameId, startsAt } of targets) {
    try {
      await postReset(gameId, startsAt);
    } catch (err) {
      failed += 1;
      console.warn(
        `auto-reset of game ${gameId} failed (ignored):`,
        err.response?.statusCode || err.message,
      );
    }
  }
  return { total: targets.length, failed };
};

let running = false;

/**
 * One pass: claim every question whose reset is due and reset it. Exported for
 * tests / a manual kick; the interval below is the normal driver.
 */
const runAutoResetTick = async () => {
  if (running) return; // a slow engine must not stack ticks on top of each other
  running = true;
  try {
    // The interval columns are added by a boot migration; querying them before
    // it lands would just log "Unknown column" on the first few ticks.
    await migrated;
    const nowSec = Math.floor(Date.now() / 1000);
    const due = await Question.findAll({
      where: {
        auto_reset_minutes: { [Op.gt]: 0 },
        auto_reset_at_sec: { [Op.lte]: nowSec },
      },
    });
    for (const question of due) {
      // Claim + reschedule in one UPDATE. Losing the race (0 rows) means
      // another instance already took this one.
      const [claimed] = await Question.update(
        { auto_reset_at_sec: nextDueSec(question.auto_reset_minutes) },
        {
          where: {
            id: question.id,
            auto_reset_minutes: { [Op.gt]: 0 },
            auto_reset_at_sec: { [Op.lte]: nowSec },
          },
        },
      );
      if (!claimed) continue;
      const { total, failed } = await resetGamesForQuestion(question);
      console.log(
        `auto-reset question ${question.id} (${question.name}): ` +
          `${total - failed}/${total} game(s) reset, next in ` +
          `${question.auto_reset_minutes} min`,
      );
    }
  } catch (err) {
    // Never let a DB hiccup kill the interval.
    console.warn("auto-reset tick failed (ignored):", err.message);
  } finally {
    running = false;
  }
};

const startAutoResetCron = () => {
  const timer = setInterval(runAutoResetTick, TICK_MS);
  // Don't hold the process open on shutdown just for the cron.
  if (timer.unref) timer.unref();
  console.log(`auto-reset cron started (tick ${TICK_MS} ms)`);
  return timer;
};

module.exports = {
  MAX_MINUTES,
  MIN_MINUTES,
  autoResetTargets,
  nextDueSec,
  resetGamesForQuestion,
  runAutoResetTick,
  startAutoResetCron,
};
