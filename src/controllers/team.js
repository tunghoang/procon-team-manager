const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const { Team, Match, Group } = require("../models");
const { comparePassword, encryptPassword } = require("../lib/encrypt");
const useController = require("../lib/useController");
const { getFilter } = require("../lib/common");
const { isSuperAdmin, isManager, managerGroupId } = require("../lib/scope");
const { groupMoveConflict } = require("../lib/groupRoster");
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
      // 403, not 405: the route and method are right, the caller is not.
      return res.status(403).json({ message: "Not allowed" });
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
    normalizeGroupFields(req.body);
    if ("group_id" in req.body) {
      // Moving (or ungrouping) a team must not strand it on its old group's
      // match rosters -- the same invariant the group endpoints enforce
      // (lib/groupRoster.js). Read the CURRENT row for the group it leaves.
      const current = await Team.findByPk(req.params.id, {
        attributes: ["id", "name", "group_id"],
      });
      if (!current) return res.status(404).json({ message: "Team not found" });
      const conflict = await groupMoveConflict(current, req.body.group_id);
      if (conflict) {
        return res.status(conflict.status).json({ message: conflict.message });
      }
    }
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
    // Missing credentials take the same answer as wrong ones. (They also used
    // to reach Sequelize as `account: undefined` and bcrypt as `undefined`,
    // both of which throw -- a 500 on an empty form.)
    if (!account || !password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const team = await Team.findOne({
      where: { account },
    });
    // One answer for both "no such account" and "wrong password": 404
    // "Account not found" vs 400 "Account or password error" told an attacker
    // which account names are real, which is all a credential-stuffing list
    // needs. The UI shows whatever `message` says (procon-react
    // api/auth.js#apiSignIn), so no message key is being broken here.
    const isMatch =
      !!team && (await comparePassword(password, team.password));
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

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

/**
 * PUT /team/password  { current_password, password } -- change YOUR OWN password.
 *
 * The current password is required. Without it a token alone was enough to
 * change the password it authenticates -- so a token picked up anywhere (it
 * lives for two days, and the same token administers the game service) could
 * be turned into permanent ownership of the account, locking the real team out
 * mid-contest. Proving the current password is what makes the token
 * insufficient.
 */
const changePassword = async (req, res) => {
  try {
    // The bootstrap admin is an env-var login with no row (see signin), so
    // there is nothing here to change.
    if (Number(req.auth.id) === 0) {
      return res.status(400).json({
        message:
          "bootstrap admin password is set by environment " +
          "(BOOTSTRAP_ADMIN_PASSWORD); create a real admin account to change a password here",
      });
    }

    const { current_password: currentPassword, password } = req.body || {};
    if (!password) {
      return res.status(400).json({ message: "password is required" });
    }
    if (!currentPassword) {
      return res.status(400).json({ message: "current_password is required" });
    }

    const team = await Team.findByPk(req.auth.id);
    if (!team) return res.status(404).json({ message: "Team not found" });

    // Same comparison as signin.
    const isMatch = await comparePassword(currentPassword, team.password);
    if (!isMatch) {
      return res.status(400).json({ message: "current_password is incorrect" });
    }

    team.password = await encryptPassword(password);
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
