const { Op } = require("sequelize");
const { Group, Team, Match } = require("../models");
const useController = require("../lib/useController");
const {
  isSuperAdmin,
  isManager,
  managerGroupId,
  canManageGroup,
  canAddToGroup,
  canRemoveFromGroup,
} = require("../lib/scope");
const { groupMoveConflict } = require("../lib/groupRoster");
const { resyncAutoIncrement } = require("../lib/common");
const { setGroupOnMatchGames } = require("../lib/engineGames");

const { get, update, create } = useController(Group);

// What a member row shows inside a group: never the password hash.
const MEMBER_ATTRIBUTES = ["id", "name", "account", "group_role", "is_admin"];

/**
 * GET /group -- every group for the superadmin, only its own for a manager.
 * Each row carries its member and match counts so the admin page can show at
 * a glance which groups are actually populated.
 */
const getGroups = async (req, res) => {
  try {
    const where = {};
    if (isManager(req.auth)) where.id = managerGroupId(req.auth);
    else if (!isSuperAdmin(req.auth)) return res.status(200).json({ count: 0, data: [] });

    const groups = await Group.findAll({
      where,
      include: [
        { model: Team, as: "members", attributes: ["id", "name", "group_role"] },
        { model: Match, as: "matches", attributes: ["id"] },
      ],
      order: [["name", "ASC"]],
    });
    const data = groups.map((g) => {
      const row = g.toJSON();
      row.member_count = row.members.length;
      row.match_count = row.matches.length;
      row.managers = row.members
        .filter((m) => m.group_role === "manager")
        .map((m) => ({ id: m.id, name: m.name }));
      delete row.members;
      delete row.matches;
      return row;
    });
    return res.status(200).json({ count: data.length, data });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getGroup = async (req, res) => {
  if (!canManageGroup(req.auth, req.params.id)) {
    return res.status(404).json({ message: "Group not found" });
  }
  await get(req, res);
};

const createGroup = async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "name is required" });
    const clash = await Group.findOne({ where: { name } });
    if (clash) return res.status(400).json({ message: "Duplicated name" });
    req.body = { name, description: req.body.description ?? null };
    await create(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateGroup = async (req, res) => {
  try {
    const body = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: "name is required" });
      const clash = await Group.findOne({
        where: { name, id: { [Op.ne]: req.params.id } },
      });
      if (clash) return res.status(400).json({ message: "Duplicated name" });
      body.name = name;
    }
    if (req.body.description !== undefined) body.description = req.body.description;
    req.body = body;
    await update(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /group/:id -- the group row only. Its accounts and matches survive
 * and drop back to "no group" (the FK is SET NULL at the ORM level; the
 * columns are cleared here explicitly too because the live tables were
 * ALTERed without a constraint).
 */
const removeGroup = async (req, res) => {
  try {
    const group = await Group.findByPk(req.params.id);
    if (!group) return res.status(404).json({ message: "Group not found" });
    // Collected BEFORE the group_id columns are cleared -- afterwards there is
    // nothing left to say which matches used to belong to this group.
    const orphanedMatches = await Match.findAll({
      where: { group_id: group.id },
      attributes: ["id"],
    });
    await Team.update(
      { group_id: null, group_role: "member" },
      { where: { group_id: group.id } },
    );
    await Match.update({ group_id: null }, { where: { group_id: group.id } });
    await group.destroy();
    await resyncAutoIncrement(Group);

    // The engine stores the owning group on each game and treats that group's
    // manager as its admin. With the group gone the games have to drop it too,
    // or a deleted group's manager account would keep admin rights over them.
    const gameSync = await setGroupOnMatchGames(
      orphanedMatches.map((m) => m.id),
      null,
    );
    const failed = gameSync.filter((row) => !row.ok);
    if (failed.length) {
      return res.status(502).json({
        message:
          `Group deleted, but ${failed.length} game(s) still carry it on the ` +
          "engine.",
        id: req.params.id,
        game_sync: gameSync,
      });
    }
    return res.status(200).json({ id: req.params.id, game_sync: gameSync });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/** GET /group/:id/members -- the accounts in a group (staff of that group). */
const getMembers = async (req, res) => {
  if (!canManageGroup(req.auth, req.params.id)) {
    return res.status(404).json({ message: "Group not found" });
  }
  try {
    const members = await Team.findAll({
      where: { group_id: req.params.id },
      attributes: MEMBER_ATTRIBUTES,
      order: [["name", "ASC"]],
    });
    return res.status(200).json({ count: members.length, data: members });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET /group/:id/candidates -- accounts that could be pulled into this group.
 * For a manager that is exactly the UNGROUPED, non-admin accounts (the only
 * ones it may claim -- see scope.canAddToGroup); the superadmin sees every
 * account outside the group, so it can also move a team between groups.
 */
const getCandidates = async (req, res) => {
  if (!canManageGroup(req.auth, req.params.id)) {
    return res.status(404).json({ message: "Group not found" });
  }
  try {
    const where = isSuperAdmin(req.auth)
      ? { [Op.or]: [{ group_id: null }, { group_id: { [Op.ne]: req.params.id } }] }
      : { group_id: null, is_admin: false };
    const teams = await Team.findAll({
      where,
      attributes: ["id", "name", "account", "group_id"],
      order: [["name", "ASC"]],
    });
    return res.status(200).json({ count: teams.length, data: teams });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /group/:id/members  { team_ids: number[] }
 * All-or-nothing: every id is checked against the caller's scope BEFORE any
 * row changes, and the response names the first one that is not allowed.
 * Accounts join as plain members; the manager role is the superadmin's to
 * hand out (PUT /team/:id).
 */
const addMembers = async (req, res) => {
  const groupId = Number(req.params.id);
  if (!canManageGroup(req.auth, groupId)) {
    return res.status(404).json({ message: "Group not found" });
  }
  const ids = Array.isArray(req.body?.team_ids) ? req.body.team_ids.map(Number) : [];
  if (!ids.length) return res.status(400).json({ message: "team_ids is required" });
  try {
    const group = await Group.findByPk(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    const teams = await Team.findAll({ where: { id: ids } });
    const found = new Set(teams.map((t) => t.id));
    const missing = ids.find((id) => !found.has(id));
    if (missing !== undefined) {
      return res.status(404).json({ message: `Team ${missing} not found` });
    }
    for (const team of teams) {
      if (team.is_admin) {
        return res.status(400).json({ message: `"${team.name}" is a superadmin account` });
      }
      if (!canAddToGroup(req.auth, team, groupId)) {
        return res.status(403).json({
          message:
            team.group_id == null
              ? `Not allowed to add "${team.name}"`
              : `"${team.name}" already belongs to another group`,
        });
      }
      // Only the superadmin gets here with a team that already has a group.
      // Moving it must not leave its old group's matches with an outsider on
      // the roster (lib/groupRoster.js).
      const conflict = await groupMoveConflict(team, groupId);
      if (conflict) {
        return res.status(conflict.status).json({ message: conflict.message });
      }
    }
    // A team moved by the superadmin out of another group loses any manager
    // role it held there; a fresh member has none to begin with.
    const [changed] = await Team.update(
      { group_id: groupId, group_role: "member" },
      { where: { id: ids } },
    );
    return res.status(200).json({ group_id: groupId, added_count: changed });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/** DELETE /group/:id/members/:teamId -- back to "no group". */
const removeMember = async (req, res) => {
  const groupId = Number(req.params.id);
  if (!canManageGroup(req.auth, groupId)) {
    return res.status(404).json({ message: "Group not found" });
  }
  try {
    const team = await Team.findByPk(req.params.teamId);
    if (!team || Number(team.group_id) !== groupId) {
      return res.status(404).json({ message: "Team is not in this group" });
    }
    if (!canRemoveFromGroup(req.auth, team)) {
      return res.status(403).json({ message: "A manager cannot remove itself from its group" });
    }
    // Dropping a team out of its group while it is still rostered on that
    // group's matches would leave those matches with a player the group no
    // longer contains -- which every ADD-side check would refuse.
    const conflict = await groupMoveConflict(team, null);
    if (conflict) {
      return res.status(conflict.status).json({ message: conflict.message });
    }
    await team.update({ group_id: null, group_role: "member" });
    return res.status(200).json({ group_id: groupId, team_id: team.id });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  removeGroup,
  getMembers,
  getCandidates,
  addMembers,
  removeMember,
};
