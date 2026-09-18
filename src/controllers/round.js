const Round = require("../models/round");
const { Match, Team } = require("../models");
const { Sequelize } = require('sequelize');
const useController = require("../lib/useController");
const { isStaff } = require("../lib/scope");
const { resyncAutoIncrement } = require("../lib/common");
const {
  deleteGamesQuietly,
  engineGameIdsUnder,
} = require("../lib/engineGames");
const { getAll, get, update, create } = useController(Round);

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
  // Superadmin and group managers see every round: a manager picks the round
  // its group's matches go under (rounds themselves stay read-only for it).
  if (isStaff(req.auth)) {
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
  // Wrapped: the duplicate-name lookup used to sit outside any try, so a DB
  // error here rejected the handler's promise and left the request hanging
  // until the client timed out instead of answering 500.
  try {
    const round = await Round.findOne({
      where: { name: req.body.name, tournament_id: req.body.tournament_id },
    });
    if (round) return res.status(400).json({ message: "Duplicated name" });
    await create(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateRound = async (req, res) => {
  await update(req, res);
};

/**
 * Deleting a round cascades to its matches, questions and answers in the DB --
 * and, before this, left every engine game under it running forever, because
 * the cascade happens inside MySQL and the game service never hears about it.
 * The game ids are resolved from the subtree BEFORE it is destroyed.
 */
const removeRound = async (req, res) => {
  try {
    const round = await Round.findByPk(req.params.id);
    if (!round) return res.status(404).json({ message: "Round not found" });
    const gameIds = await engineGameIdsUnder({ roundId: round.id });
    await round.destroy();
    await resyncAutoIncrement(Round);
    const gameSync = await deleteGamesQuietly(gameIds);
    return res.status(200).json({ id: req.params.id, game_sync: gameSync });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getRounds,
  getRound,
  createRound,
  updateRound,
  removeRound,
};
