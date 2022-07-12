const Match = require("../models/match");

const getMatchs = async (req, res) => {
  try {
    const matchs = await Match.findAll();
    return res.status(200).json({ data: matchs });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const getMatch = async (req, res) => {
  const { id } = req.params;
  try {
    const match = await Match.findByPk(id);
    return res.status(200).json(match);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const createMatch = async (req, res) => {
  const { name, description, is_active, tournament_id } = req.body;
  try {
    const match = await Match.create({
      name,
      description,
      is_active,
      tournament_id,
    });
    return res.status(200).json(match);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const updateMatch = async (req, res) => {
  const { id } = req.params;
  const { name, description, is_active } = req.body;
  try {
    const match = await Match.findByPk(id);
    if (!match) {
      return res.status(400).json({
        error: "Match not found",
      });
    }
    await match.update({
      name,
      description,
      is_active,
    });
    return res.status(200).json(match);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const removeMatch = async (req, res) => {
  const { id } = req.params;
  try {
    const match = await Match.findByPk(id);
    await match.destroy();
    return res.status(200).json(match);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

module.exports = {
  getMatchs,
  getMatch,
  createMatch,
  updateMatch,
  removeMatch,
};
