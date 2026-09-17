/**
 * Who may touch what. Three levels, read off the JWT payload (`req.auth`):
 *
 *   superadmin   is_admin === true. Unscoped.
 *   manager      group_role === "manager" with a group_id. Scoped to that ONE
 *                group: its members, and matches carrying its group_id (plus
 *                the questions inside them). Cannot create accounts, cannot
 *                see other groups, cannot use the board generator.
 *   team         everyone else. Sees only what it is rostered on.
 *
 * Kept free of Express/Sequelize so the rules are testable (scope.test.js);
 * controllers call these and turn `false` into a 403/404.
 */

const isSuperAdmin = (auth) => !!auth?.is_admin;

const isManager = (auth) =>
  !isSuperAdmin(auth) && auth?.group_role === "manager" && auth?.group_id != null;

/** Admin-area access: superadmin or a group manager. */
const isStaff = (auth) => isSuperAdmin(auth) || isManager(auth);

/** The manager's own group id, or null for anyone else. */
const managerGroupId = (auth) => (isManager(auth) ? Number(auth.group_id) : null);

const sameGroup = (a, b) => a != null && b != null && Number(a) === Number(b);

/** May `auth` administer this match (edit/delete/roster/questions)? */
const canManageMatch = (auth, match) => {
  if (isSuperAdmin(auth)) return true;
  if (!isManager(auth) || !match) return false;
  return sameGroup(match.group_id, auth.group_id);
};

/** May `auth` administer this group (list members, add/remove them)? */
const canManageGroup = (auth, groupId) => {
  if (isSuperAdmin(auth)) return true;
  return isManager(auth) && sameGroup(groupId, auth.group_id);
};

/**
 * Is this team allowed on this match's roster?
 * A group match only takes that group's members -- a manager must not be able
 * to pull an outside team into its bracket, and the superadmin gets the same
 * guard so a group match cannot be muddled by accident.
 */
const teamFitsMatch = (team, match) =>
  match?.group_id == null || sameGroup(team?.group_id, match.group_id);

/**
 * May `auth` move this account INTO group `groupId`?
 * Superadmin: always. Manager: only into its own group, and only an account
 * that belongs to no group yet -- claiming another school's team is not a
 * manager's call.
 */
const canAddToGroup = (auth, team, groupId) => {
  if (isSuperAdmin(auth)) return true;
  if (!canManageGroup(auth, groupId)) return false;
  return team?.group_id == null;
};

/**
 * May `auth` take this account OUT of its group?
 * Manager: only its own members, and never itself (a group must keep its
 * manager; the superadmin reassigns those).
 */
const canRemoveFromGroup = (auth, team) => {
  if (isSuperAdmin(auth)) return true;
  if (!isManager(auth) || !team) return false;
  if (!sameGroup(team.group_id, auth.group_id)) return false;
  return Number(team.id) !== Number(auth.id);
};

module.exports = {
  isSuperAdmin,
  isManager,
  isStaff,
  managerGroupId,
  canManageMatch,
  canManageGroup,
  teamFitsMatch,
  canAddToGroup,
  canRemoveFromGroup,
};
