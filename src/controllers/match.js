const Match = require("../models/match");
const useController = require("../lib/useController");
const { Team } = require("../models");
const { handleTeamMatch } = require("../middleware/match");
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
  await update(req, res);
};

const removeMatch = async (req, res) => {
  await remove(req, res);
};

const removeTeamMatch = async (req, res) => {
  await handleTeamMatch(req, res, "remove");
};

const createTeamMatch = async (req, res) => {
  await handleTeamMatch(req, res, "create");
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
