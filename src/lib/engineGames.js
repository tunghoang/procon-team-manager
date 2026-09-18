/**
 * Every call this service makes to the HEXUDON engine about a GAME, in one
 * place, plus the mapping from the manager's own rows (tournament -> round ->
 * match -> question) to the engine game ids they own.
 *
 * Why it is centralised: a question is one engine game (timed match or
 * competitive practice) or N per-team games (plain practice, `${qid}:${teamId}`),
 * and only this service knows which. Every caller that deletes a subtree, edits
 * a roster or re-homes a match has to walk the same mapping, and each of them
 * used to either skip the engine entirely (deleting a match left its games
 * behind forever) or re-implement the walk.
 *
 * House rules for every call here:
 *   - the SERVICE admin token, never the caller's own (a group manager is not
 *     an engine admin; scope is enforced by the controller before we get here);
 *   - a 10 s request timeout and NO retries -- an unreachable engine must not
 *     hold an admin request open for a minute;
 *   - a 404 is tolerated (`missing: true`, still `ok`): a game that is already
 *     gone needs no cleanup, and a question's bare id does not exist at all for
 *     plain practice;
 *   - nothing throws. Every function returns one result row per game so the
 *     controller can report failures to the admin (`game_sync`) instead of
 *     turning a committed DB change into a 500.
 */
const got = require("got");
const { QueryTypes } = require("sequelize");
const { sequelize, Question, Match, Round } = require("../models");
const {
  engineErrorMessage,
  getServiceApi,
  serviceAdminToken,
} = require("./common");
const { isPerTeamQuestion, parseQuestionData } = require("./autoResetPlan");

/** No admin action may hang on the engine for longer than this. */
const ENGINE_TIMEOUT_MS = 10_000;

/** got's defaults retry GETs; a reset/delete must be attempted exactly once. */
const ENGINE_REQUEST = {
  timeout: { request: ENGINE_TIMEOUT_MS },
  retry: { limit: 0 },
};

const engineAuthHeader = () => `Bearer ${serviceAdminToken()}`;

/**
 * How many engine calls one admin action may have in flight.
 *
 * Serial was too slow to be usable (a 12-team roster edit is 12 x up to 10 s),
 * and an unbounded `Promise.all` bursts straight through the engine's per-token
 * READ budget (config.py: 5/s, burst 10) so half the calls come back rejected
 * and the action reports "10/12". Four is the same figure the standings pool
 * uses (controllers/hexudonSummary.js).
 */
const ENGINE_CONCURRENCY = 4;

/**
 * Run `task` over every item with at most ENGINE_CONCURRENCY in flight, and
 * return the results IN INPUT ORDER (callers report them to the admin, so the
 * order has to be stable rather than whatever finished first).
 *
 * Tasks must not throw -- everything in this module returns a result row
 * instead -- so there is no rejection handling here on purpose.
 */
const pooled = async (items, task, limit = ENGINE_CONCURRENCY) => {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
};

// ---------------------------------------------------------------------------
// Which engine games exist behind the manager's rows
// ---------------------------------------------------------------------------

/** Team ids on a match's roster. */
const rosterTeamIdsForMatch = async (matchId) => {
  const rows = await sequelize.query(
    "SELECT team_id FROM team_match WHERE match_id = :matchId",
    { replacements: { matchId }, type: QueryTypes.SELECT },
  );
  return rows.map((row) => row.team_id);
};

/**
 * Every engine game a question owns. A plain-practice question runs one solo
 * game PER ROSTERED TEAM (`${question.id}:${teamId}`); everything else is the
 * one shared game at the bare id. The bare id is always included: it costs a
 * tolerated 404 and covers a practice question whose roster has since changed.
 * Must be computed BEFORE the question row is deleted (it reads question_data).
 */
const engineGameIdsFor = async (question) => {
  const ids = [String(question.id)];
  if (isPerTeamQuestion(question)) {
    for (const teamId of await rosterTeamIdsForMatch(question.match_id)) {
      ids.push(`${question.id}:${teamId}`);
    }
  }
  return ids;
};

/** engineGameIdsFor over several questions, flattened and de-duplicated. */
const engineGameIdsForQuestions = async (questions) => {
  const ids = [];
  for (const question of questions) ids.push(...(await engineGameIdsFor(question)));
  return [...new Set(ids)];
};

const questionsForMatchIds = async (matchIds) => {
  if (!matchIds.length) return [];
  return Question.findAll({ where: { match_id: matchIds } });
};

const matchIdsForRoundIds = async (roundIds) => {
  if (!roundIds.length) return [];
  const matches = await Match.findAll({
    where: { round_id: roundIds },
    attributes: ["id"],
  });
  return matches.map((m) => m.id);
};

const matchIdsForTournamentIds = async (tournamentIds) => {
  if (!tournamentIds.length) return [];
  const rounds = await Round.findAll({
    where: { tournament_id: tournamentIds },
    attributes: ["id"],
  });
  return matchIdsForRoundIds(rounds.map((r) => r.id));
};

/**
 * Every engine game under one deleted subtree, resolved BEFORE the DB rows go.
 * Exactly one of the three ids is given.
 */
const engineGameIdsUnder = async ({ tournamentId, roundId, matchId }) => {
  let matchIds = [];
  if (matchId != null) matchIds = [matchId];
  else if (roundId != null) matchIds = await matchIdsForRoundIds([roundId]);
  else if (tournamentId != null) {
    matchIds = await matchIdsForTournamentIds([tournamentId]);
  }
  return engineGameIdsForQuestions(await questionsForMatchIds(matchIds));
};

// ---------------------------------------------------------------------------
// The calls themselves
// ---------------------------------------------------------------------------

/** One engine call, turned into a result row. Never throws. */
const engineCall = async (gameId, run) => {
  try {
    await run();
    return { game_id: gameId, ok: true };
  } catch (error) {
    const status = error.response?.statusCode;
    if (status === 404) {
      // Nothing to do: the game is already absent (or never existed, which is
      // the normal case for a practice question's bare id).
      return { game_id: gameId, ok: true, missing: true };
    }
    return {
      game_id: gameId,
      ok: false,
      status: status || null,
      message: engineErrorMessage(error),
    };
  }
};

/**
 * Best-effort delete of a game. A game that is already gone (404) or a briefly
 * unreachable engine must not block deleting the manager's own row -- an
 * orphaned engine game is harmless (its id no longer matches any question).
 */
const deleteGameQuietly = async (gameId, authHeader = engineAuthHeader()) => {
  const row = await engineCall(gameId, () =>
    got.delete(`${getServiceApi()}/game/${gameId}`, {
      headers: { Authorization: authHeader },
      ...ENGINE_REQUEST,
    }),
  );
  if (!row.ok) {
    console.warn(
      `engine game delete for ${gameId} failed (ignored):`,
      row.status || row.message,
    );
  }
  return row;
};

const deleteGamesQuietly = async (gameIds) => {
  const authHeader = engineAuthHeader();
  return pooled(gameIds, (id) => deleteGameQuietly(id, authHeader));
};

/**
 * Drop one team from a SHARED engine game (timed match / competitive practice).
 *
 * Contract with procon26-hexudon: POST /game/teams/remove {game_id, team_id}
 * -> 200 {ok, removed}, 404 when the game does not exist.
 */
const removeTeamFromGame = async (gameId, teamId, authHeader = engineAuthHeader()) =>
  engineCall(gameId, () =>
    got.post(`${getServiceApi()}/game/teams/remove`, {
      headers: { Authorization: authHeader },
      json: { game_id: String(gameId), team_id: String(teamId) },
      ...ENGINE_REQUEST,
    }),
  );

/**
 * Re-stamp the owning group on an engine game, so the NEW group's manager is
 * treated as its admin there (and the old one stops being).
 *
 * Contract with procon26-hexudon: POST /game/group {game_id, group_id} with an
 * integer or null -> 200 {ok}, 404 when the game does not exist.
 */
const setGameGroup = async (gameId, groupId, authHeader = engineAuthHeader()) =>
  engineCall(gameId, () =>
    got.post(`${getServiceApi()}/game/group`, {
      headers: { Authorization: authHeader },
      json: {
        game_id: String(gameId),
        group_id: groupId == null ? null : Number(groupId),
      },
      ...ENGINE_REQUEST,
    }),
  );

/**
 * Wipe a game back to agent selection. `startsAt` (epoch seconds) re-anchors a
 * TIMED match's whole schedule to a new Day 1; practice games are self-paced
 * and are reset without one.
 */
const resetGameOnEngine = async (gameId, startsAt, authHeader = engineAuthHeader()) =>
  engineCall(gameId, () =>
    got.post(`${getServiceApi()}/game/reset`, {
      headers: { Authorization: authHeader },
      json:
        startsAt == null
          ? { game_id: String(gameId) }
          : { game_id: String(gameId), startsAt: Number(startsAt) },
      ...ENGINE_REQUEST,
    }),
  );

/** Set the owning group on every engine game of the given matches. */
const setGroupOnMatchGames = async (matchIds, groupId) => {
  const questions = await questionsForMatchIds(matchIds);
  const gameIds = await engineGameIdsForQuestions(questions);
  if (!gameIds.length) return [];
  const authHeader = engineAuthHeader();
  return pooled(gameIds, (id) => setGameGroup(id, groupId, authHeader));
};

/**
 * Take one or more teams off every engine game of one match, and off the
 * stored board.
 *
 * Three things have to happen, or a removed team keeps playing a match it is no
 * longer on (or gets 403s on a game the board still lists it in):
 *   - plain practice: its solo game `${qid}:${teamId}` is deleted outright;
 *   - shared game: the engine drops it from the roster (contract above);
 *   - `question_data.teams` loses its entry, so a later roster re-sync
 *     (match.js#syncTeamsToGames) and every board reader agree with the engine.
 *
 * The engine calls go through the pool, but the board is rewritten ONCE PER
 * QUESTION with every removed team taken out in the same write. Doing it per
 * team would be a read-modify-write on one row from several workers at once,
 * and the later write would put the earlier worker's team back.
 */
const detachTeamsFromMatchGames = async (matchId, teamIds) => {
  const ids = [...new Set((teamIds || []).map(String))];
  if (!ids.length) return [];
  const questions = await questionsForMatchIds([matchId]);
  const authHeader = engineAuthHeader();

  // One engine task per (question, team).
  const tasks = [];
  for (const question of questions) {
    const perTeam = isPerTeamQuestion(question);
    for (const teamId of ids) {
      tasks.push({
        question,
        teamId,
        perTeam,
        gameId: perTeam ? `${question.id}:${teamId}` : String(question.id),
      });
    }
  }

  const results = await pooled(tasks, async ({ question, teamId, perTeam, gameId }) => {
    const row = perTeam
      ? await deleteGameQuietly(gameId, authHeader)
      : await removeTeamFromGame(gameId, teamId, authHeader);
    return { ...row, question_id: question.id, team_id: teamId };
  });

  // Now the boards, one write each.
  for (const question of questions) {
    const data = parseQuestionData(question);
    const teams = Array.isArray(data.teams) ? data.teams : null;
    if (!teams) continue;
    const kept = teams.filter((t) => !ids.includes(String(t.team_id)));
    if (kept.length === teams.length) continue;
    try {
      await question.update({
        question_data: JSON.stringify({ ...data, teams: kept }),
      });
    } catch (error) {
      results.push({
        game_id: String(question.id),
        question_id: question.id,
        ok: false,
        message: `question_data update failed: ${error.message}`,
      });
    }
  }
  return results;
};

/** One team off one match's games (the single-team roster route). */
const detachTeamFromMatchGames = (matchId, teamId) =>
  detachTeamsFromMatchGames(matchId, [teamId]);

module.exports = {
  ENGINE_CONCURRENCY,
  ENGINE_REQUEST,
  ENGINE_TIMEOUT_MS,
  deleteGameQuietly,
  deleteGamesQuietly,
  detachTeamFromMatchGames,
  detachTeamsFromMatchGames,
  pooled,
  engineAuthHeader,
  engineGameIdsFor,
  engineGameIdsForQuestions,
  engineGameIdsUnder,
  questionsForMatchIds,
  removeTeamFromGame,
  resetGameOnEngine,
  rosterTeamIdsForMatch,
  setGameGroup,
  setGroupOnMatchGames,
};
