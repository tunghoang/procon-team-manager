const got = require("got");
const Match = require("../models/match");
const useController = require("../lib/useController");
const { Team, Tournament, Question } = require("../models");
const Round = require("../models/round");
const { getServiceApi, serviceAdminToken } = require("../lib/common");
const { getAll, update, create, remove } = useController(Match);

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
const syncTeamToGames = async (matchId, team) => {
  const questions = await Question.findAll({ where: { match_id: matchId } });
  const results = [];
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

    try {
      if (data.is_practice) {
        // Practice: the new team gets its OWN solo game "{question.id}:{team.id}"
        // (same board/start cells), not a seat in a shared game.
        const base = { ...data };
        delete base.game_id;
        await got.post(`${getServiceApi()}/game/init`, {
          headers: { Authorization: `Bearer ${serviceAdminToken()}` },
          json: {
            ...base,
            game_id: `${question.id}:${team.id}`,
            teams: [{ team_id: String(team.id), agents }],
            players: 1,
            is_practice: true,
          },
        });
      } else {
        await got.post(`${getServiceApi()}/game/teams`, {
          json: { game_id: question.id, team_id: team.id, agents },
          headers: { Authorization: `Bearer ${serviceAdminToken()}` },
        });
      }
      if (!teams.some((t) => String(t.team_id) === String(team.id))) {
        await question.update({
          question_data: JSON.stringify({
            ...data,
            teams: [...teams, { team_id: String(team.id), agents }],
          }),
        });
      }
      results.push({ question_id: question.id, ok: true });
    } catch (err) {
      const body = err.response?.body || "";
      const bodyText = typeof body === "string" ? body : JSON.stringify(body);
      // Already-registered => idempotent success (safe to re-run).
      if (/already exists/i.test(bodyText)) {
        results.push({ question_id: question.id, ok: true, alreadyRegistered: true });
      } else {
        results.push({ question_id: question.id, ok: false, message: bodyText || err.message });
      }
    }
  }
  return results;
};

const include = [
  {
    model: Team,
    as: "teams",
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
  teams: {
    eq_id: {
      field: "$teams.id$",
      op: "eq",
    },
  },
};

const getMatches = async (req, res) => {
  if (!req.auth.is_admin) {
    req.query = {
      ...req.query,
      teams: {
        ...req.query.teams,
        eq_id: req.auth.id,
      },
      match_is_active: true,
    };
  }
  await getAll(req, res, null, include, filterField);
};

const getMatchByName = async (req, res) => {
  try {
    const where = {
      name: req.params.name,
    };
    if (!req.auth.is_admin) {
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
    if (!req.auth.is_admin) {
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
    if (!team && !req.auth.is_admin)
      return res.status(405).json({
        message: "Not allowed",
      });

    return res.status(200).json(match);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createMatch = async (req, res) => {
  try {
    const match = await Match.findOne({
      where: { name: req.body.name, round_id: req.body.round_id },
    });
    if (match) return res.status(400).json({ message: "Duplicated name" });
    await create(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateMatch = async (req, res) => {
  await update(req, res);
};

const removeMatch = async (req, res) => {
  await remove(req, res);
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
    const team = await Team.findByPk(teamId);
    if (!team) {
      return res.status(404).json({
        message: `Team not found`,
      });
    }
    await match.removeTeam(team);
    return res.status(200).json({
      match_id: matchId,
      team_id: teamId,
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
    const team = await Team.findByPk(teamId);
    if (!team) {
      return res.status(404).json({
        message: `Team not found`,
      });
    }
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

    if (!matches.length) {
      return res.status(404).json({ message: "No matches found" });
    }
    if (!teams.length) {
      return res.status(404).json({ message: "No teams found" });
    }

    let addedCount = 0;
    const gameSync = [];
    for (const match of matches) {
      const existingTeamIds = match.teams.map((t) => t.id);
      const teamsToAdd = teams.filter((t) => !existingTeamIds.includes(t.id));
      if (teamsToAdd.length > 0) {
        await match.addTeams(teamsToAdd);
        addedCount += teamsToAdd.length;
        for (const team of teamsToAdd) {
          gameSync.push(...(await syncTeamToGames(match.id, team)));
        }
      }
    }

    const failed = gameSync.filter((r) => !r.ok);
    if (failed.length) {
      return res.status(502).json({
        message: `Teams added, but ${failed.length} game(s) could not be updated on the engine. Retry to sync them.`,
        added_count: addedCount,
        game_sync: gameSync,
      });
    }
    return res.status(200).json({
      message: `Successfully added ${addedCount} team-match relationships`,
      added_count: addedCount,
      game_sync: gameSync,
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
    });

    const teams = await Team.findAll({
      where: { id: team_ids },
    });

    if (!matches.length) {
      return res.status(404).json({ message: "No matches found" });
    }
    if (!teams.length) {
      return res.status(404).json({ message: "No teams found" });
    }

    let removedCount = 0;
    for (const match of matches) {
      await match.removeTeams(teams);
      removedCount += teams.length;
    }

    return res.status(200).json({
      message: `Successfully removed ${removedCount} team-match relationships`,
      removed_count: removedCount,
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
