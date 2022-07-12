const Match = require("../models/match");
const useController = require("./useController");
const { getAll, get, update, create, remove } = useController(Match);
const getMatchs = async (req, res) => {
  await getAll(req, res);
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

module.exports = {
  getMatchs,
  getMatch,
  createMatch,
  updateMatch,
  removeMatch,
};
