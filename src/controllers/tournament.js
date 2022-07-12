const { Tournament } = require("../models");

const getAllTournament = async (req, res) => {
  try {
    console.log(req.auth);
    const tournaments = await Tournament.findAll();

    return res.status(200).json({ data: tournaments });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};
const getTournament = async (req, res) => {
  const { id } = req.parmas;
  try {
    const tournament = await Tournament.findByPk(id);
    return res.status(200).json(tournament);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const createTournament = async (req, res) => {
  const { name } = req.body;
  try {
    const tournament = await Tournament.create({
      name,
    });
    return res.status(200).json(tournament);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const updateTournament = () => {};

const removeTournament = () => {};

module.exports = {
  getAllTournament,
  getTournament,
  createTournament,
  updateTournament,
  removeTournament,
};
