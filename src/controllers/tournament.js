const { Tournament } = require("../models");
const useController = require("./useController");
const { getAll, get, update, create, remove } = useController(Tournament);
const getAllTournament = async (req, res) => {
  return await getAll(req, res);
};
const getTournament = async (req, res) => {
  return await get(req, res);
};

const createTournament = async (req, res) => {
  return await create(req, res);
};

const updateTournament = async (req, res) => {
  return await update(req, res);
};

const removeTournament = async (req, res) => {
  return await remove(req, res);
};

module.exports = {
  getAllTournament,
  getTournament,
  createTournament,
  updateTournament,
  removeTournament,
};
