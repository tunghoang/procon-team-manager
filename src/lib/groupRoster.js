/**
 * The group/roster invariant, in one place.
 *
 * `scope.teamFitsMatch` says a group match only takes that group's members, and
 * every roster endpoint enforces it. Nothing enforced the other direction: a
 * team could be moved out of (or between) groups while still rostered on its
 * old group's matches, which left that match with a player the group no longer
 * contains -- invisible to every later check, because they all run when a team
 * is ADDED, never when its group changes.
 *
 * So the three paths that can change `team.group_id` (group.js#addMembers for a
 * superadmin moving a team between groups, group.js#removeMember, and
 * team.js#updateTeam) all ask here first, and refuse with 409 naming the
 * matches that block the move. The operator's fix is to take the team off those
 * rosters, which is why the message lists them.
 *
 * ONLY LIVE MATCHES BLOCK. A finished match's roster is a historical record --
 * it is what its results are read against (lib/hexudonSummary.js scores every
 * rostered team) -- so a team that has to be moved between groups after the
 * group stage must not have to be stripped off last week's brackets to do it.
 * "Finished" is `is_active = false` or `end_time` already past, the same test
 * `lib/common.js#checkValidAnswer` uses to decide a match is out of time.
 */
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../models");

/**
 * Is this match still live, i.e. would an outsider on its roster still matter?
 *
 * The comparison is done in JS, not with SQL NOW(): this deployment's MySQL
 * session runs at +00:00 while Node runs at +07:00, so a DATETIME written by
 * the app and NOW() are 7 h apart (see models/question.js). Reading the column
 * back through the driver and comparing it to a JS Date keeps both sides in the
 * same frame -- and is what every other time check in this service does.
 */
const isLiveMatch = (match, now = new Date()) => {
  // `is_active` comes back as 0/1 from MySQL.
  if (match.is_active === false || match.is_active === 0) return false;
  if (match.end_time == null) return true;
  const endsAt = new Date(match.end_time);
  if (Number.isNaN(endsAt.getTime())) return true; // unreadable -> treat as live
  return endsAt > now;
};

/**
 * Matches that would be stranded if `teamId` left group `fromGroupId`:
 * the LIVE matches owned by that group which still have the team on their
 * roster.
 *
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
const matchesBlockingGroupMove = async (teamId, fromGroupId, now = new Date()) => {
  if (fromGroupId == null || teamId == null) return [];
  const rows = await sequelize.query(
    "SELECT m.id, m.name, m.is_active, m.end_time FROM `match` m " +
      "INNER JOIN team_match tm ON tm.match_id = m.id " +
      "WHERE tm.team_id = :teamId AND m.group_id = :groupId " +
      "ORDER BY m.name ASC",
    {
      replacements: { teamId, groupId: fromGroupId },
      type: QueryTypes.SELECT,
    },
  );
  return rows
    .filter((row) => isLiveMatch(row, now))
    .map((row) => ({ id: row.id, name: row.name }));
};

/**
 * Would moving `team` to `newGroupId` strand it on its old group's LIVE matches?
 *
 * @param team        the CURRENT row (its `group_id` is the group it leaves)
 * @param newGroupId  the group it would land in (null = no group)
 * @returns {Promise<{status: number, message: string}|null>} null when allowed
 */
const groupMoveConflict = async (team, newGroupId) => {
  const from = team?.group_id ?? null;
  if (from == null) return null; // nothing to leave
  const to = newGroupId == null ? null : Number(newGroupId);
  if (to !== null && to === Number(from)) return null; // not actually moving

  const blocking = await matchesBlockingGroupMove(team.id, from);
  if (!blocking.length) return null;
  return {
    status: 409,
    message:
      `"${team.name}" is still on the roster of that group's LIVE match(es): ` +
      `${blocking.map((m) => m.name).join(", ")}. ` +
      "Remove it from them first. (Finished matches -- inactive, or past their " +
      "end time -- do not block the move: their rosters are the record their " +
      "results are read against.)",
  };
};

module.exports = { groupMoveConflict, isLiveMatch, matchesBlockingGroupMove };
