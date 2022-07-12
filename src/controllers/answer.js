const { Answer } = require("../models");
const useController = require("./useController");
const { getAll, get, update, create, remove } = useController(Answer);
const getAnswers = async (req, res) => {
  await getAll(req, res);
};
const getAnswer = async (req, res) => {
  await get(req, res);
};

const createAnswer = async (req, res) => {
  await create(req, res);
};

const updateAnswer = async () => {
  await update(req, res);
};

const removeAnswer = async () => {
  await remove(req, res);
};

module.exports = {
  getAnswers,
  getAnswer,
  createAnswer,
  updateAnswer,
  removeAnswer,
};
