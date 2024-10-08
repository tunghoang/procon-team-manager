const { Tournament } = require("../models");
const useController = require("../lib/useController");
const { getAll, get, update, create, remove } = useController(Tournament);
const getTournaments = async (req, res) => {
  await getAll(req, res);
};
const getTournament = async (req, res) => {
  await get(req, res);
};

const createTournament = async (req, res) => {
  try {
    const tour = await Tournament.findOne({ where: { name: req.body.name } });
    if (tour) return res.status(400).json({ message: "Duplicated name" });
    await create(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateTournament = async (req, res) => {
  await update(req, res);
};

const removeTournament = async (req, res) => {
  await remove(req, res);
};

module.exports = {
  getTournaments,
  getTournament,
  createTournament,
  updateTournament,
  removeTournament,
};
