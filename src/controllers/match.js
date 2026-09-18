const got = require("got");
const { Op } = require("sequelize");
const Match = require("../models/match");
const useController = require("../lib/useController");
const { Team, Tournament, Question, Group, sequelize } = require("../models");
const Round = require("../models/round");
const {
  engineErrorMessage,
  getFilter,
  getServiceApi,
  resyncAutoIncrement,
  serviceAdminToken,
} = require("../lib/common");
const {
  isSuperAdmin,
  isManager,
  isPlayerAccount,
  managerGroupId,
  canManageMatch,
  teamFitsMatch,
} = require("../lib/scope");
const {
  ENGINE_REQUEST,
  deleteGamesQuietly,
  detachTeamFromMatchGames,
  detachTeamsFromMatchGames,
  engineGameIdsUnder,
  // The (question x team) fan-out inside syncTeamsToGames runs through the
  // shared pool, so nothing here nests a second one around it.
  pooled,
  setGroupOnMatchGames,
} = require("../lib/engineGames");
// `update`/`remove` are handled inline here: both have to reach the engine
// (group re-stamp, game cleanup) and report what happened, which the shared
// helpers cannot do -- they answer the request themselves.
const { getAll, create } = useController(Match);

// Registers `team` on every already-created HEXUDON game for this match,
// mid-match included -- the official ruleset freezes a game's roster at
// /game/init time, but this training tool allows joining later on purpose
// (see game_service.py's Game.add_team). Every team in a match shares the
// same agent start cells (the docs require an identical starting layout for
// every team), so we just reuse whichever existing team's `agents` list is
// on file.
//
// Idempotent: the engine returns "already exists" when a team is re-synced,
// which we treat as success so re-adding (or retrying after a partial
// failure) is safe. Callers MUST inspect the returned results and surface a
// non-2xx to the admin when any `ok:false` remains -- otherwise the DB says
// the team is in the match while the engine never registered it, and that
// team is silently locked out (every /game/day and /game/actions 403s).
// The engine calls run through the shared pool; the stored board is rewritten
// ONCE PER QUESTION with every added team in the same write. Per-team writes
// from several workers at once would be a read-modify-write on one row, and the
// last writer would drop the teams the others had just appended.
const syncTeamsToGames = async (matchId, teamsToAdd) => {
  const questions = await Question.findAll({ where: { match_id: matchId } });
  const usable = [];
  for (const question of questions) {
    let data;
    try {
      data = JSON.parse(question.question_data || "{}");
    } catch {
      continue;
    }
    const teams = Array.isArray(data.teams) ? data.teams : [];
    const agents = teams[0]?.agents;
    if (!Array.isArray(agents) || !agents.length) continue;
    usable.push({ question, data, teams, agents });
  }

  // One engine task per (question, team).
  const tasks = [];
  for (const entry of usable) {
    const perTeam = !!entry.data.is_practice && !entry.data.no_reset;
    for (const team of teamsToAdd) {
      tasks.push({
        entry,
        team,
        perTeam,
        gameId: perTeam ? `${entry.question.id}:${team.id}` : String(entry.question.id),
      });
    }
  }

  const results = await pooled(tasks, async ({ entry, team, perTeam, gameId }) => {
    const { question, data, agents } = entry;
    try {
      if (perTeam) {
        // Plain practice: the new team gets its OWN solo game
        // "{question.id}:{team.id}" (same board/start cells), not a shared seat.
        const base = { ...data };
        delete base.game_id;
        await got.post(`${getServiceApi()}/game/init`, {
          headers: { Authorization: `Bearer ${serviceAdminToken()}` },
          json: {
            ...base,
            game_id: gameId,
            teams: [{ team_id: String(team.id), agents }],
            players: 1,
            is_practice: true,
            no_reset: false,
          },
          // An unreachable engine must not hold a roster edit open forever.
          ...ENGINE_REQUEST,
        });
      } else {
        // Shared game (timed competitive OR competitive practice): join the one
        // game at question.id.
        await got.post(`${getServiceApi()}/game/teams`, {
          json: { game_id: question.id, team_id: team.id, agents },
          headers: { Authorization: `Bearer ${serviceAdminToken()}` },
          ...ENGINE_REQUEST,
        });
      }
      return { question_id: question.id, game_id: gameId, team_id: String(team.id), ok: true };
    } catch (err) {
      const body = err.response?.body || "";
      const bodyText = typeof body === "string" ? body : JSON.stringify(body);
      // Already-registered => idempotent success (safe to re-run).
      if (/already exists/i.test(bodyText)) {
        return {
          question_id: question.id,
          game_id: gameId,
          team_id: String(team.id),
          ok: true,
          alreadyRegistered: true,
        };
      }
      return {
        question_id: question.id,
        game_id: gameId,
        team_id: String(team.id),
        ok: false,
        message: engineErrorMessage(err),
      };
    }
  });

  // Now the boards: one write per question, only for the teams the engine
  // actually accepted (a team the engine refused must not appear on the board
  // as though it were registered).
  // A Map of Sets rather than one composite string key: there is no
  // separator to pick (a question id is a UUID, a team id an integer) and so
  // nothing that can collide.
  const registered = new Map();
  for (const row of results) {
    if (!row.ok) continue;
    if (!registered.has(row.question_id)) registered.set(row.question_id, new Set());
    registered.get(row.question_id).add(row.team_id);
  }
  for (const { question, data, teams } of usable) {
    const accepted = registered.get(question.id) || new Set();
    const known = new Set(teams.map((t) => String(t.team_id)));
    const added = teamsToAdd.filter(
      (team) => !known.has(String(team.id)) && accepted.has(String(team.id)),
    );
    if (!added.length) continue;
    const agents = teams[0]?.agents;
    try {
      await question.update({
        question_data: JSON.stringify({
          ...data,
          teams: [
            ...teams,
            ...added.map((team) => ({ team_id: String(team.id), agents })),
          ],
        }),
      });
    } catch (error) {
      results.push({
        question_id: question.id,
        game_id: String(question.id),
        ok: false,
        message: `question_data update failed: ${error.message}`,
      });
    }
  }
  return results;
};

/** One team onto one match's games (the single-team roster route). */
const syncTeamToGames = (matchId, team) => syncTeamsToGames(matchId, [team]);

/** The engine game ids a partially failed sync left unregistered. */
const failedGameIds = (gameSync) =>
  gameSync.filter((row) => !row.ok).map((row) => row.game_id);

/** Requested ids with no row behind them, so a bulk call can name them. */
const missingIds = (requested, rows) => {
  const found = new Set((rows || []).map((row) => String(row.id)));
  return [...new Set((requested || []).map(String))].filter(
    (id) => !found.has(id),
  );
};

/**
 * Split a list of accounts into the ones that may be rostered and the ones
 * that may not (lib/scope.js#isPlayerAccount).
 *
 * The SINGLE add refuses outright -- one id, one clear answer. The BULK add
 * filters instead: a manager selecting "everyone in my group" picks up its own
 * manager account every time, and failing the whole batch for that would make
 * the button useless. The response names what it left out (`skipped_staff`).
 */
const splitStaffPlayers = (teams) => {
  const players = [];
  const staff = [];
  for (const team of teams || []) {
    (isPlayerAccount(team) ? players : staff).push(team);
  }
  return { players, staff };
};

const STAFF_PLAYER_REASON =
  "A superadmin's or group manager's token administers the game rather than " +
  "playing it, and the engine's team-only endpoints refuse it.";

/** The 400 body for the single add. */
const rejectStaffPlayers = (teams) => {
  const { staff } = splitStaffPlayers(teams);
  if (!staff.length) return null;
  return (
    "Staff accounts cannot be rostered as players: " +
    `${staff.map((t) => t.name).join(", ")}. ${STAFF_PLAYER_REASON}`
  );
};

const include = [
  {
    model: Team,
    as: "teams",
    attributes: ["id", "name", "group_id"],
  },
  {
    model: Group,
    as: "group",
    attributes: ["id", "name"],
  },
  {
    model: Round,
    as: "round",
    include: [
      {
        model: Tournament,
        as: "tournament",
      },
    ],
  },
];

const filterField = {
  match_id: {
    field: "id",
    op: "like",
  },
  match_is_active: {
    field: "is_active",
    op: "eq",
  },
  eq_round_tournament_id: {
    field: "$round.tournament_id$",
    op: "eq",
  },
  eq_round_id: {
    field: "round_id",
    op: "eq",
  },
  eq_group_id: {
    field: "group_id",
    op: "eq",
  },
};

/**
 * "this team is on the roster", as a SUBQUERY on the join table.
 *
 * It used to be `where: {"$teams.id$": id}` on the `teams` include, which does
 * filter the matches correctly -- but it also filters the INCLUDE, so every
 * returned match carried a `teams` array holding the caller alone. The UI reads
 * that array as the roster, so a team saw a match it shares with five others as
 * a one-team match. Filtering by subquery leaves the include untouched, so the
 * full roster comes back.
 *
 * The id is coerced to a number before interpolation (Sequelize does not bind
 * parameters inside a literal).
 */
const rosteredMatchIds = (teamId) => ({
  [Op.in]: sequelize.literal(
    `(SELECT match_id FROM team_match WHERE team_id = ${Number(teamId)})`,
  ),
});

const getMatches = async (req, res) => {
  const rosterFilter = req.query?.teams?.eq_id;
  if (isManager(req.auth)) {
    // A group manager sees its own group's matches, active or not.
    req.query = { ...req.query, eq_group_id: managerGroupId(req.auth) };
  } else if (!isSuperAdmin(req.auth)) {
    // A team sees only the active matches it is rostered on.
    req.query = { ...req.query, match_is_active: true };
  }
  const restrictTo = isSuperAdmin(req.auth) || isManager(req.auth)
    ? rosterFilter        // staff may still ask for one team's matches
    : req.auth.id;        // a team is always restricted to its own

  if (restrictTo == null) {
    return getAll(req, res, null, include, filterField);
  }
  const teamId = Number(restrictTo);
  if (!Number.isInteger(teamId) || teamId < 0) {
    // The value is interpolated into a literal below, so a non-numeric one is
    // refused here rather than handed to MySQL.
    return res.status(400).json({ message: "teams[eq_id] must be a team id" });
  }
  try {
    // [Op.and], not a spread: `filterField.match_id` ALSO maps onto `id`
    // (a LIKE on the id), so merging the two into one object would silently
    // drop whichever key was written second -- `?match_id=3` would have
    // widened the query back to every match.
    const where = {
      [Op.and]: [
        getFilter(req.query, filterField),
        { id: rosteredMatchIds(teamId) },
      ],
    };
    const data = await Match.findAndCountAll({
      where,
      include,
      distinct: true, // the `teams` include is a hasMany: don't multiply the count
    });
    return res.status(200).json({ count: data.count, data: data.rows });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getMatchByName = async (req, res) => {
  try {
    const where = {
      name: req.params.name,
    };
    if (isManager(req.auth)) {
      where.group_id = managerGroupId(req.auth);
    } else if (!isSuperAdmin(req.auth)) {
      where.is_active = true;
    }
    const match = await Match.findOne({ where });
    if (!match) {
      return res.status(404).json({
        message: `Match not found`,
      });
    }
    return res.status(200).json(match);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getMatch = async (req, res) => {
  try {
    const where = {
      id: req.params.id,
    };
    if (isManager(req.auth)) {
      // Another group's match reads as "not found", never as "forbidden".
      where.group_id = managerGroupId(req.auth);
    } else if (!isSuperAdmin(req.auth)) {
      where.is_active = true;
    }
    const match = await Match.findOne({
      where,
      include,
    });
    if (!match) {
      return res.status(404).json({
        message: `Match not found`,
      });
    }

    const team = match.teams.find((team) => team.id === req.auth.id);
    // 403, not 405: the route and method are right, the caller is not.
    if (!team && !canManageMatch(req.auth, match))
      return res.status(403).json({
        message: "Not allowed",
      });

    return res.status(200).json(match);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// A group match's roster must stay inside the group (scope.teamFitsMatch).
const outsiders = (teams, match) =>
  (teams || []).filter((team) => !teamFitsMatch(team, match));

const createMatch = async (req, res) => {
  try {
    // `round_id` is NOT NULL and part of the (name, round_id) unique key, so
    // without it `findOne` below used to die inside Sequelize ("WHERE parameter
    // round_id has invalid undefined value") and answer 500. The sidebar
    // Matches page has no round in its URL, so that was the normal outcome of
    // its "new match" button.
    const roundId = Number(req.body.round_id);
    if (!req.body.round_id || !Number.isInteger(roundId) || roundId < 1) {
      return res.status(400).json({ message: "round_id is required" });
    }
    const round = await Round.findByPk(roundId);
    if (!round) {
      return res.status(400).json({ message: `round_id ${roundId} not found` });
    }
    req.body.round_id = roundId;

    if (isManager(req.auth)) {
      // A manager's match always belongs to its own group -- whatever the
      // body says. It may pick any round (rounds are read-only for it).
      req.body.group_id = managerGroupId(req.auth);
    } else if (req.body.group_id === "" || req.body.group_id == null) {
      req.body.group_id = null;
    } else {
      req.body.group_id = Number(req.body.group_id);
    }
    const match = await Match.findOne({
      where: { name: req.body.name, round_id: roundId },
    });
    if (match) return res.status(400).json({ message: "Duplicated name" });
    await create(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * The columns an edit may touch. `id` is the row named by the URL, and
 * anything not listed here (timestamps, nested `teams`/`round` the UI sends
 * back with a row) is dropped rather than handed to the ORM.
 *
 * `is_practice`/`no_reset` stay editable for the superadmin as before, but they
 * only describe games that were already built shared-vs-per-team at
 * /game/init time -- changing them after a question exists desyncs this side
 * from the engine. The admin UI deliberately sends them on CREATE only.
 */
const MATCH_UPDATE_FIELDS = [
  "name",
  "description",
  "start_time",
  "end_time",
  "is_active",
  "is_practice",
  "no_reset",
  "round_id",
  "group_id",
];

/** Ownership and placement in the bracket are not a manager's to change. */
const MANAGER_FORBIDDEN_MATCH_FIELDS = ["group_id", "round_id"];

const updateMatch = async (req, res) => {
  try {
    const match = await Match.findByPk(req.params.id, {
      include: [{ model: Team, as: "teams", attributes: ["id", "name", "group_id"] }],
    });
    if (!match) return res.status(404).json({ message: "Match not found" });
    if (!canManageMatch(req.auth, match)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const manager = isManager(req.auth);
    const body = {};
    for (const field of MATCH_UPDATE_FIELDS) {
      if (req.body[field] === undefined) continue;
      if (manager && MANAGER_FORBIDDEN_MATCH_FIELDS.includes(field)) continue;
      body[field] = req.body[field];
    }

    let newGroupId;
    if ("group_id" in body) {
      body.group_id =
        body.group_id === "" || body.group_id == null ? null : Number(body.group_id);
      // Re-homing a match under a group must not strand rostered outsiders.
      const strangers = outsiders(match.teams, { group_id: body.group_id });
      if (strangers.length) {
        return res.status(400).json({
          message: `Rostered team(s) outside that group: ${strangers
            .map((t) => t.name)
            .join(", ")}`,
        });
      }
      const before = match.group_id == null ? null : Number(match.group_id);
      if (before !== body.group_id) newGroupId = body.group_id;
    }

    await match.update(body);

    // The engine stores the owning group ON THE GAME and treats that group's
    // manager as its admin, so a re-homed match whose games still carry the old
    // group leaves the new manager with 403s on state/board/reset/replay (and
    // the old one still in charge). Best effort, reported rather than thrown:
    // the DB change is already committed.
    let gameSync;
    if (newGroupId !== undefined) {
      gameSync = await setGroupOnMatchGames([match.id], newGroupId);
      const failed = gameSync.filter((row) => !row.ok);
      if (failed.length) {
        return res.status(502).json({
          message:
            `Match updated, but ${failed.length} game(s) still carry the old ` +
            "group on the engine. Retry to sync them.",
          id: match.id,
          game_sync: gameSync,
        });
      }
    }
    return res.status(200).json({ id: match.id, game_sync: gameSync });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const removeMatch = async (req, res) => {
  try {
    const match = await Match.findByPk(req.params.id);
    if (!match) return res.status(404).json({ message: "Match not found" });
    if (!canManageMatch(req.auth, match)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    // Resolved BEFORE the delete: the questions (and, for practice, the roster)
    // that name the engine games are about to be cascaded away. Deleting a
    // match used to leave every one of its games alive on the engine forever --
    // the DB cascade knows nothing about the other service.
    const gameIds = await engineGameIdsUnder({ matchId: match.id });
    await match.destroy();
    await resyncAutoIncrement(Match);
    const gameSync = await deleteGamesQuietly(gameIds);
    return res.status(200).json({ id: req.params.id, game_sync: gameSync });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const removeTeamMatch = async (req, res) => {
  const { matchId, teamId } = req.params;
  try {
    const match = await Match.findByPk(matchId);
    if (!match) {
      return res.status(404).json({
        message: `Match not found`,
      });
    }
    if (!canManageMatch(req.auth, match)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    const team = await Team.findByPk(teamId);
    if (!team) {
      return res.status(404).json({
        message: `Team not found`,
      });
    }
    await match.removeTeam(team);
    // Roster removal used to stop at the join table: the team kept its solo
    // practice game and its seat in every shared game, so it went on playing a
    // match it is no longer on -- and kept appearing in that match's standings.
    const gameSync = await detachTeamFromMatchGames(match.id, team.id);
    const failed = gameSync.filter((row) => !row.ok);
    if (failed.length) {
      return res.status(502).json({
        message:
          `Team removed from the match, but ${failed.length} game(s) could ` +
          "not be updated on the engine. Retry to sync them.",
        match_id: matchId,
        team_id: teamId,
        game_sync: gameSync,
        failed_game_ids: failedGameIds(gameSync),
      });
    }
    return res.status(200).json({
      match_id: matchId,
      team_id: teamId,
      game_sync: gameSync,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createTeamMatch = async (req, res) => {
  const { matchId, teamId } = req.params;
  try {
    const match = await Match.findByPk(matchId);
    if (!match) {
      return res.status(404).json({
        message: `Match not found`,
      });
    }
    if (!canManageMatch(req.auth, match)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    const team = await Team.findByPk(teamId);
    if (!team) {
      return res.status(404).json({
        message: `Team not found`,
      });
    }
    if (!teamFitsMatch(team, match)) {
      return res.status(400).json({
        message: `"${team.name}" is not a member of this match's group`,
      });
    }
    const staffRefusal = rejectStaffPlayers([team]);
    if (staffRefusal) return res.status(400).json({ message: staffRefusal });
    await match.addTeams(team);
    const gameSync = await syncTeamToGames(matchId, team);
    const failed = gameSync.filter((r) => !r.ok);
    if (failed.length) {
      // The team_match row is committed, but the engine didn't register the
      // team on some games -- tell the admin so they can retry (sync is
      // idempotent) instead of silently locking the team out of those games.
      return res.status(502).json({
        message: `Team added to the match, but ${failed.length} game(s) could not be updated. Retry to sync them.`,
        match_id: matchId,
        team_id: teamId,
        game_sync: gameSync,
        failed_game_ids: failedGameIds(gameSync),
      });
    }
    return res.status(200).json({
      match_id: matchId,
      team_id: teamId,
      game_sync: gameSync,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Bulk add teams to matches
// Body: { match_ids: number[], team_ids: number[] }
const bulkAddTeams = async (req, res) => {
  const { match_ids, team_ids } = req.body;
  try {
    if (!match_ids?.length || !team_ids?.length) {
      return res.status(400).json({
        message: "match_ids and team_ids are required",
      });
    }

    const matches = await Match.findAll({
      where: { id: match_ids },
      include: [{ model: Team, as: "teams", attributes: ["id"] }],
    });

    const teams = await Team.findAll({
      where: { id: team_ids },
    });

    // An id that matches nothing used to be dropped in silence, so a roster
    // edit could report success while half the teams were never added.
    // Consistent with group.js#addMembers, which already 404s the first
    // unknown id.
    const unknown = missingIds(match_ids, matches);
    if (unknown.length) {
      return res
        .status(404)
        .json({ message: `Match(es) not found: ${unknown.join(", ")}` });
    }
    const unknownTeams = missingIds(team_ids, teams);
    if (unknownTeams.length) {
      return res
        .status(404)
        .json({ message: `Team(s) not found: ${unknownTeams.join(", ")}` });
    }

    // Staff accounts are FILTERED OUT, not a reason to fail the batch: a
    // manager selecting its whole group picks up its own manager account every
    // time. The response names what was left out.
    const { players, staff } = splitStaffPlayers(teams);
    const skippedStaff = staff.map((t) => ({ id: t.id, name: t.name }));
    if (!players.length) {
      return res.status(400).json({
        message:
          "Every selected account is staff, so there is nobody to roster: " +
          `${staff.map((t) => t.name).join(", ")}. ${STAFF_PLAYER_REASON}`,
        skipped_staff: skippedStaff,
      });
    }

    // Scope the whole batch before touching anything. Only the accounts that
    // will actually be rostered are group-checked -- a skipped staff account
    // must not fail the batch on its group either.
    for (const match of matches) {
      if (!canManageMatch(req.auth, match)) {
        return res.status(403).json({ message: `Not allowed: match "${match.name}"` });
      }
      const strangers = outsiders(players, match);
      if (strangers.length) {
        return res.status(400).json({
          message: `Not in the group of match "${match.name}": ${strangers
            .map((t) => t.name)
            .join(", ")}`,
        });
      }
    }

    let addedCount = 0;
    const gameSync = [];
    for (const match of matches) {
      const existingTeamIds = match.teams.map((t) => t.id);
      const teamsToAdd = players.filter((t) => !existingTeamIds.includes(t.id));
      if (teamsToAdd.length > 0) {
        await match.addTeams(teamsToAdd);
        addedCount += teamsToAdd.length;
        // All of this match's (question x team) engine calls in one pooled
        // pass, with one board write per question (syncTeamsToGames).
        gameSync.push(...(await syncTeamsToGames(match.id, teamsToAdd)));
      }
    }

    const staffNote = skippedStaff.length
      ? ` ${skippedStaff.length} staff account(s) were skipped.`
      : "";
    const failed = gameSync.filter((r) => !r.ok);
    if (failed.length) {
      return res.status(502).json({
        message:
          `Teams added, but ${failed.length} game(s) could not be updated on ` +
          `the engine. Retry to sync them.${staffNote}`,
        added_count: addedCount,
        game_sync: gameSync,
        // The ids the UI has to name when it asks the admin to retry.
        failed_game_ids: failedGameIds(gameSync),
        skipped_staff: skippedStaff,
      });
    }
    return res.status(200).json({
      message:
        `Successfully added ${addedCount} team-match relationships.${staffNote}`,
      added_count: addedCount,
      game_sync: gameSync,
      failed_game_ids: [],
      skipped_staff: skippedStaff,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Bulk remove teams from matches
// Body: { match_ids: number[], team_ids: number[] }
const bulkRemoveTeams = async (req, res) => {
  const { match_ids, team_ids } = req.body;
  try {
    if (!match_ids?.length || !team_ids?.length) {
      return res.status(400).json({
        message: "match_ids and team_ids are required",
      });
    }

    const matches = await Match.findAll({
      where: { id: match_ids },
      include: [{ model: Team, as: "teams", attributes: ["id"] }],
    });

    const teams = await Team.findAll({
      where: { id: team_ids },
    });

    const unknown = missingIds(match_ids, matches);
    if (unknown.length) {
      return res
        .status(404)
        .json({ message: `Match(es) not found: ${unknown.join(", ")}` });
    }
    const unknownTeams = missingIds(team_ids, teams);
    if (unknownTeams.length) {
      return res
        .status(404)
        .json({ message: `Team(s) not found: ${unknownTeams.join(", ")}` });
    }
    for (const match of matches) {
      if (!canManageMatch(req.auth, match)) {
        return res.status(403).json({ message: `Not allowed: match "${match.name}"` });
      }
    }

    // Only the teams actually ON each match's roster. `removed_count` used to
    // be matches x requested teams regardless of what was there, so
    // "removed 12" could mean nothing at all happened.
    const plan = [];
    let removedCount = 0;
    for (const match of matches) {
      const rostered = new Set(match.teams.map((t) => t.id));
      const toRemove = teams.filter((team) => rostered.has(team.id));
      if (!toRemove.length) continue;
      await match.removeTeams(toRemove);
      removedCount += toRemove.length;
      plan.push({ match, toRemove });
    }

    // ...and off the engine, same as the single-team route. One call per match,
    // and the fan-out INSIDE it (question x team) is what goes through the
    // shared 4-worker pool. Deliberately not pooled out here as well: nesting
    // two pools would put 4 x 4 calls in flight and blow the engine's burst
    // budget, which is the thing the pool exists to stay under.
    const gameSync = [];
    for (const { match, toRemove } of plan) {
      gameSync.push(
        ...(await detachTeamsFromMatchGames(
          match.id,
          toRemove.map((team) => team.id),
        )),
      );
    }

    const failed = gameSync.filter((row) => !row.ok);
    if (failed.length) {
      return res.status(502).json({
        message:
          `Teams removed, but ${failed.length} game(s) could not be updated ` +
          "on the engine. Retry to sync them.",
        removed_count: removedCount,
        game_sync: gameSync,
        failed_game_ids: failedGameIds(gameSync),
      });
    }
    return res.status(200).json({
      message: `Successfully removed ${removedCount} team-match relationships`,
      removed_count: removedCount,
      game_sync: gameSync,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMatches,
  getMatch,
  getMatchByName,
  createMatch,
  updateMatch,
  removeMatch,
  removeTeamMatch,
  createTeamMatch,
  bulkAddTeams,
  bulkRemoveTeams,
};
