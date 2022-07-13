const { Answer } = require("../models");
const useController = require("./useController");
const { getAll, get, update, create, remove } = useController(Answer);
const getAnswers = async (req, res) => {
  return await getAll(req, res);
};
const getAnswer = async (req, res) => {
  return await get(req, res);
};

const createAnswer = async (req, res) => {
  return await create(req, res);
};

const updateAnswer = async (req, res) => {
  return await update(req, res);
};

const removeAnswer = async (req, res) => {
  return await remove(req, res);
};

module.exports = {
  getAnswers,
  getAnswer,
  createAnswer,
  updateAnswer,
  removeAnswer,
};
