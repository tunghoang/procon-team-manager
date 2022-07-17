const Match = require("../models/match");
const useController = require("../lib/useController");
const { Team } = require("../models");
const { get, update, create, remove } = useController(Match);
const getMatches = async (req, res) => {
  try {
    const query = req.query;
    const filter = Object.keys(query).reduce((cur, qKey) => {
      if (qKey.substring(0, 6) === "match_") {
        const value = query[qKey];
        const key = qKey.slice(6);
        return {
          ...cur,
          [key]: filterFields.includes(key)
            ? { [Op.like]: `%${value}%` }
            : value,
        };
      }
      return cur;
    }, {});

    const data = await Match.findAll({
      where: filter,
      include: [
        {
          model: Team,
          as: "teams",
        },
      ],
    });

    return res.status(200).json({ data });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getMatch = async (req, res) => {
  await get(req, res);
};

const createMatch = async (req, res) => {
  await create(req, res);
};

const updateMatch = async (req, res) => {
  await update(req, res);
};

const removeMatch = async (req, res) => {
  await remove(req, res);
};

module.exports = {
  getMatches,
  getMatch,
  createMatch,
  updateMatch,
  removeMatch,
};
