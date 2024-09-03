const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const { Team } = require("../models");
const { comparePassword, encryptPassword } = require("../lib/encrypt");
const useController = require("../lib/useController");
const { getAll, get, update, create, remove } = useController(Team);

const include = [];
const filterField = {
  match_id: {
    field: "id",
    op: "like",
  },
  eq_id: {
    field: "id",
    op: "eq",
  },
  match_name: {
    field: "name",
    op: "like",
  },
  match_account: {
    field: "account",
    op: "like",
  },
  match_is_admin: {
    field: "is_admin",
    op: "like",
  },
};
const ignore = ["password"];

const getTeams = async (req, res) => {
  if (!req.auth.is_admin) req.query.eq_id = req.auth.id;
  await getAll(req, res, ignore, include, filterField);
};
const getTeam = async (req, res) => {
  if (req.params.id != req.auth.id) {
    return res.status(405).json({ message: "Not allowed" });
  }
  await get(req, res, ignore, include);
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
  if (account === "admin" && password === "ProconVN@#24") {
    const token = jwt.sign(
      {
        id: 0,
        name: account,
        is_admin: true,
      },
      process.env.JWT_SECRET_KEY
    );
    return res.status(200).json({
      id: 0,
      token,
    });
  }
  try {
    const team = await Team.findOne({
      where: { account },
    });
    if (!team) return res.status(404).json({ message: "Account not found" });
    const isMatch = await comparePassword(password, team.password);
    if (!isMatch)
      return res.status(400).json({ message: "Account or password error" });

    const token = jwt.sign(
      {
        id: team.id,
        name: team.name,
        is_admin: team.is_admin,
      },
      process.env.JWT_SECRET_KEY,
      {
        algorithm: "HS256",
        expiresIn: "2d",
      }
    );

    return res.status(200).json({
      id: team.id,
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
      return res.status(400).json({ message: `Account has already existed` });

    req.body.password = await encryptPassword(req.body.password);
    if (!req.auth?.is_admin) req.body.is_admin = false;
    await create(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const team = await Team.findByPk(req.auth.id);

    if (!team) return res.status(404).json({ message: "Team not found" });

    if (!req.body.password)
      return res.status(406).json({ message: "password invalid" });

    const newPassword = await encryptPassword(req.body.password);

    team.password = newPassword;

    await team.save();

    return res.status(200).json({ id: team.id });
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
  changePassword,
};
