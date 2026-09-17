const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const { Team, Match, Group } = require("../models");
const { comparePassword, encryptPassword } = require("../lib/encrypt");
const useController = require("../lib/useController");
const { getFilter } = require("../lib/common");
const { isSuperAdmin, isManager, managerGroupId } = require("../lib/scope");
const { get, update, create, remove } = useController(Team);

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
  eq_group_id: {
    field: "group_id",
    op: "eq",
  },
};

const GROUP_INCLUDE = { model: Group, as: "group", attributes: ["id", "name"] };

// The role fields in a token. Both are read by the game service too (a manager
// is an admin over its own group's games there), so they must travel together.
const tokenPayload = (team) => ({
  id: team.id,
  name: team.name,
  is_admin: !!team.is_admin,
  group_id: team.group_id ?? null,
  group_role: team.group_role || "member",
});
const ignore = ["password"];

const getTeams = async (req, res) => {
  try {
    // Superadmin: everyone. Group manager: its own group. Team: itself.
    if (isManager(req.auth)) req.query.eq_group_id = managerGroupId(req.auth);
    else if (!isSuperAdmin(req.auth)) req.query.eq_id = req.auth.id;

    const filter = getFilter(req.query, filterField);
    const { round_id } = req.query;

    // Build include with optional round_id filter
    const matchInclude = {
      model: Match,
      as: "Matches",
      attributes: ["id", "name"],
      through: { attributes: [] },
    };

    if (round_id) {
      matchInclude.where = { round_id };
      matchInclude.required = false; // Return all teams, but only include matches from this round
    }

    const data = await Team.findAndCountAll({
      where: filter,
      attributes: { exclude: ignore },
      include: [matchInclude, GROUP_INCLUDE],
      distinct: true, // Fix count when using include with many-to-many
    });

    return res.status(200).json({ count: data.count, data: data.rows });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getTeam = async (req, res) => {
  // Own row always; a superadmin any row; a manager its own group's rows.
  if (req.params.id != req.auth.id && !isSuperAdmin(req.auth)) {
    const target = isManager(req.auth)
      ? await Team.findByPk(req.params.id, { attributes: ["id", "group_id"] })
      : null;
    if (!target || Number(target.group_id) !== managerGroupId(req.auth)) {
      return res.status(405).json({ message: "Not allowed" });
    }
  }
  const include = [
    {
      model: Match,
      as: "Matches",
      attributes: ["id", "name"],
      through: { attributes: [] },
    },
    GROUP_INCLUDE,
  ];
  await get(req, res, ignore, include);
};

// group_id / group_role as the superadmin's form sends them: "" means none,
// and a role only makes sense inside a group.
const normalizeGroupFields = (body) => {
  if ("group_id" in body) {
    body.group_id =
      body.group_id === "" || body.group_id == null ? null : Number(body.group_id);
  }
  if ("group_role" in body) {
    body.group_role = body.group_role === "manager" ? "manager" : "member";
  }
  if (body.group_id === null) body.group_role = "member";
};

const updateTeam = async (req, res) => {
  try {
    req.body.password =
      req.body.password && (await encryptPassword(req.body.password));
    normalizeGroupFields(req.body);
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
  const bootstrapAccount = process.env.BOOTSTRAP_ADMIN_ACCOUNT;
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (
    bootstrapAccount &&
    bootstrapPassword &&
    account === bootstrapAccount &&
    password === bootstrapPassword
  ) {
    const token = jwt.sign(
      {
        id: 0,
        name: account,
        is_admin: true,
      },
      process.env.JWT_SECRET_KEY,
      {
        algorithm: "HS256",
        expiresIn: "2d",
      },
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

    const payload = tokenPayload(team);
    const token = jwt.sign(payload, process.env.JWT_SECRET_KEY, {
      algorithm: "HS256",
      expiresIn: "2d",
    });

    return res.status(200).json({
      id: team.id,
      is_admin: payload.is_admin,
      group_id: payload.group_id,
      group_role: payload.group_role,
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
    normalizeGroupFields(req.body);
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
