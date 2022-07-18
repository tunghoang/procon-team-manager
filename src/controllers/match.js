const Match = require("../models/match");
const useController = require("../lib/useController");
const { Team } = require("../models");
const { getAll, get, update, create, remove } = useController(Match);
const getMatches = async (req, res) => {
  const ignore = [];
  const include = [
    {
      model: Team,
      as: "teams",
    },
  ];
  await getAll(req, res, ignore, include);
};

const getMatch = async (req, res) => {
  await get(req, res);
};

const createMatch = async (req, res) => {
  await create(req, res);
};

const updateMatch = async (req, res) => {
  // await update(req, res);
  const id = req.params.id || req.fields?.id;
  try {
    const match = await Match.findByPk(id);
    if (!match) {
      return res.status(404).json({
        message: `${Model.name} not found`,
      });
    }
    if (req.body.team_id) {
      const team = await Team.findByPk(req.body.team_id);
      await match.addTeams(team);
    }
    await match.update(req.body);
    return res.status(200).json({
      id,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const removeMatch = async (req, res) => {
  await remove(req, res);
};

module.exports = {
  getMatches,
  getMatch,
  createMatch,
  updateMatch,
  removeMatch,
};
