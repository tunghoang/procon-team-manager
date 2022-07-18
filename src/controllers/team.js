const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const { Team } = require("../models");
const { comparePassword, encryptPassword } = require("../lib/encrypt");
const useController = require("../lib/useController");
const { getAll, get, update, create, remove } = useController(Team);

const getTeams = async (req, res) => {
  const ignore = ["password"];
  await getAll(req, res, ignore);
};
const getTeam = async (req, res) => {
  const ignore = ["password"];
  await get(req, res, ignore);
};

const updateTeam = async (req, res) => {
  try {
    req.body.password =
      req.body.password && (await encryptPassword(req.body.password));
    await update(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const removeTeam = async (req, res) => {
  await remove(req, res);
};

const signin = async (req, res) => {
  const { account, password } = req.body;
  try {
    const team = await Team.findOne({
      where: { account },
    });
    if (!team) return res.status(404).json({ message: "Account not found" });
    const isMatch = await comparePassword(password, team.password);
    if (!isMatch)
      return res
        .status(400)
        .json({ message: "Account and Password haven't matched" });

    const token = jwt.sign(
      {
        id: team.id,
        name: team.name,
      },
      process.env.JWT_SECRET_KEY
    );

    return res.status(200).json({
      id: team.id,
      name: team.name,
      token,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createTeam = async (req, res) => {
  try {
    const team = await Team.findOne({
      where: {
        [Op.or]: [{ account: req.body.account }, { name: req.body.name }],
      },
    });
    if (team)
      return res
        .status(400)
        .json({ message: `Account or Name has already existed` });

    req.body.password = await encryptPassword(req.body.password);
    if (!req.auth?.is_admin) req.body.is_admin = false;
    await create(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  signin,
  createTeam,
  getTeams,
  getTeam,
  updateTeam,
  removeTeam,
};
