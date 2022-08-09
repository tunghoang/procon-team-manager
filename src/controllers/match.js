const Match = require("../models/match");
const useController = require("../lib/useController");
const { Team } = require("../models");
const { handleTeamMatch } = require("../middleware/match");
const { getAll, get, update, create, remove } = useController(Match);

const filterField = {
  match_id: {
    field: "id",
    op: "like",
  },
  eq_tournament_id: {
    field: "tournament_id",
    op: "eq",
  },
  eq_round_id: {
    field: "round_id",
    op: "eq",
  },
};

const include = [
  {
    model: Team,
    as: "teams",
  },
];

const getMatches = async (req, res) => {
  await getAll(req, res, null, include, filterField);
};

const getMatch = async (req, res) => {
  await get(req, res, null, include, filterField);
};

const createMatch = async (req, res) => {
  await create(req, res);
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
    return res.status(200).json({
      match_id: matchId,
      team_id: teamId,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMatches,
  getMatch,
  createMatch,
  updateMatch,
  removeMatch,
  removeTeamMatch,
  createTeamMatch,
};
