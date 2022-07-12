const { Tournament } = require("../models");
const useController = require("./useController");
const { getAll, get, update, create, remove } = useController(Tournament);
const getAllTournament = async (req, res) => {
  await getAll(req, res);
};
const getTournament = async (req, res) => {
  await get(req, res);
};

const createTournament = async (req, res) => {
  await create(req, res);
};

const updateTournament = async (req, res) => {
  await update(req, res);
};

const removeTournament = async (req, res) => {
  await remove(req, res);
};

module.exports = {
  getAllTournament,
  getTournament,
  createTournament,
  updateTournament,
  removeTournament,
};
