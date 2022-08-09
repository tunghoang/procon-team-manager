const Round = require("../models/round");
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

const getRounds = async (req, res) => {
  await getAll(req, res, null, null, filterField);
};

const getRound = async (req, res) => {
  await get(req, res, null, null, filterField);
};

const createRound = async (req, res) => {
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
