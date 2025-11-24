const { Tournament, Round, Match, Team } = require("../models");
const useController = require("../lib/useController");
const { Sequelize } = require('sequelize');
const { getAll, get, update, create, remove } = useController(Tournament);

const getTournaments = async (req, res) => {
  if (req.auth.is_admin) return getAll(req, res);

  try {
    const teamId = req.auth.id;

    const tournaments = await Tournament.findAll({
      where: {
        id: {
          [Sequelize.Op.in]: Sequelize.literal(`(
            SELECT DISTINCT t.id
            FROM tournament t
            INNER JOIN round r ON r.tournament_id = t.id
            INNER JOIN \`match\` m ON m.round_id = r.id
            INNER JOIN team_match tm ON tm.match_id = m.id
            WHERE tm.team_id = ${teamId}
          )`),
        },
      },
    });
    return res.status(200).json({ data: tournaments, message: "Success" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
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
