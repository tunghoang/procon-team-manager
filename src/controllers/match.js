const Match = require("../models/match");
const useController = require("../lib/useController");
const { Team, Tournament } = require("../models");
const Round = require("../models/round");
const { getAll, get, update, create, remove } = useController(Match);

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
  teams: {
    eq_id: {
      field: "$teams.id$",
      op: "eq",
    },
  },
};

const getMatches = async (req, res) => {
  if (!req.auth.is_admin)
    req.query.teams = {
      ...req.query.teams,
      eq_id: req.auth.id,
    };
  await getAll(req, res, null, include, filterField);
};

const getMatch = async (req, res) => {
  try {
    const match = await Match.findByPk(req.params.id, {
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
