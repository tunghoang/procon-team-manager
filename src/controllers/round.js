const Round = require("../models/round");
const { Match, Team } = require("../models");
const { Sequelize } = require('sequelize');
const useController = require("../lib/useController");
const { getAll, get, update, create, remove } = useController(Round);

const filterField = {
  match_id: {
    field: "id",
    op: "like",
  },
  eq_tournament_id: {
    field: "tournament_id",
    op: "eq",
  },
};

const include = [
  {
    model: Match,
    as: "matches",
    include: [
      {
        model: Team,
        as: "teams",
        attributes: [],
      },
    ],
    attributes: [],
  },
];

const getRounds = async (req, res) => {
  if (req.auth.is_admin) {
    return await getAll(req, res, null, null, filterField);
  }

  try {
    const teamId = req.auth.id;

    const where = {};

    if (req.query.eq_tournament_id) {
      where.tournament_id = req.query.eq_tournament_id;
    }

    where.id = {
      [Sequelize.Op.in]: Sequelize.literal(`(
        SELECT DISTINCT r.id
        FROM round r
        INNER JOIN \`match\` m ON m.round_id = r.id
        INNER JOIN team_match tm ON tm.match_id = m.id
        WHERE tm.team_id = ${teamId}
      )`),
    };

    const rounds = await Round.findAll({ where });
    return res.status(200).json({ data: rounds, message: "Success" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getRound = async (req, res) => {
  await get(req, res);
};

const createRound = async (req, res) => {
  const round = await Round.findOne({
    where: { name: req.body.name, tournament_id: req.body.tournament_id },
  });
  if (round) return res.status(400).json({ message: "Duplicated name" });
  await create(req, res);
};

const updateRound = async (req, res) => {
  await update(req, res);
};

const removeRound = async (req, res) => {
  await remove(req, res);
};

module.exports = {
  getRounds,
  getRound,
  createRound,
  updateRound,
  removeRound,
};
