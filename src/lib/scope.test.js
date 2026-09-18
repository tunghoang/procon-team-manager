/**
 * Tests for the group/role scope rules (no DB, no HTTP).
 *
 * Run with:  node src/lib/scope.test.js
 *
 * These pin the boundary a group manager works inside: its own group's members
 * and matches, nothing else; it may only claim UNGROUPED accounts and may never
 * drop itself out of its group. The superadmin is unscoped except that a group
 * match still takes only that group's members.
 */

const assert = require("assert");
const s = require("./scope");

const admin = { id: 0, is_admin: true };
const manager = { id: 10, group_id: 1, group_role: "manager" };
const otherManager = { id: 20, group_id: 2, group_role: "manager" };
const member = { id: 11, group_id: 1, group_role: "member" };
const loner = { id: 30 };

// --- roles -------------------------------------------------------------------
assert.strictEqual(s.isSuperAdmin(admin), true);
assert.strictEqual(s.isManager(admin), false, "superadmin is not 'a manager'");
assert.strictEqual(s.isManager(manager), true);
assert.strictEqual(s.isManager(member), false);
assert.strictEqual(s.isManager({ id: 5, group_role: "manager" }), false, "manager needs a group");
assert.strictEqual(s.isStaff(admin), true);
assert.strictEqual(s.isStaff(manager), true);
assert.strictEqual(s.isStaff(member), false);
assert.strictEqual(s.isStaff(undefined), false);
assert.strictEqual(s.managerGroupId(manager), 1);
assert.strictEqual(s.managerGroupId(admin), null);
assert.strictEqual(s.managerGroupId(member), null);

// --- matches -----------------------------------------------------------------
const groupMatch = { id: 1, group_id: 1 };
const otherGroupMatch = { id: 2, group_id: 2 };
const organiserMatch = { id: 3, group_id: null };
assert.strictEqual(s.canManageMatch(admin, organiserMatch), true);
assert.strictEqual(s.canManageMatch(admin, groupMatch), true);
assert.strictEqual(s.canManageMatch(manager, groupMatch), true);
assert.strictEqual(s.canManageMatch(manager, { id: 9, group_id: "1" }), true, "string ids from a query compare equal");
assert.strictEqual(s.canManageMatch(manager, otherGroupMatch), false);
assert.strictEqual(s.canManageMatch(manager, organiserMatch), false, "organiser matches are off limits");
assert.strictEqual(s.canManageMatch(manager, null), false);
assert.strictEqual(s.canManageMatch(member, groupMatch), false);

// --- rosters -----------------------------------------------------------------
assert.strictEqual(s.teamFitsMatch(member, groupMatch), true);
assert.strictEqual(s.teamFitsMatch(loner, groupMatch), false, "ungrouped team can't join a group match");
assert.strictEqual(s.teamFitsMatch({ id: 21, group_id: 2 }, groupMatch), false);
assert.strictEqual(s.teamFitsMatch(loner, organiserMatch), true, "organiser matches take anyone");
assert.strictEqual(s.teamFitsMatch(member, organiserMatch), true);

// Only ordinary accounts may be rostered: a staff token administers the game
// rather than playing it, and the engine's team-only endpoints refuse it.
assert.strictEqual(s.isPlayerAccount(member), true);
assert.strictEqual(s.isPlayerAccount(loner), true);
assert.strictEqual(s.isPlayerAccount({ id: 11, group_role: "member" }), true);
assert.strictEqual(s.isPlayerAccount(manager), false, "a group manager never plays");
assert.strictEqual(
  s.isPlayerAccount({ id: 7, is_admin: true }),
  false,
  "a superadmin never plays",
);
assert.strictEqual(
  s.isPlayerAccount({ id: 8, is_admin: true, group_role: "member" }),
  false,
);
assert.strictEqual(s.isPlayerAccount(null), false);

// --- group membership --------------------------------------------------------
assert.strictEqual(s.canManageGroup(admin, 2), true);
assert.strictEqual(s.canManageGroup(manager, 1), true);
assert.strictEqual(s.canManageGroup(manager, "1"), true);
assert.strictEqual(s.canManageGroup(manager, 2), false);
assert.strictEqual(s.canManageGroup(member, 1), false);

assert.strictEqual(s.canAddToGroup(manager, loner, 1), true, "manager claims an ungrouped account");
assert.strictEqual(s.canAddToGroup(manager, loner, 2), false, "...but only into its own group");
assert.strictEqual(s.canAddToGroup(manager, { id: 21, group_id: 2 }, 1), false, "never another group's team");
assert.strictEqual(s.canAddToGroup(otherManager, member, 2), false);
assert.strictEqual(s.canAddToGroup(admin, { id: 21, group_id: 2 }, 1), true, "superadmin may move anyone");
assert.strictEqual(s.canAddToGroup(member, loner, 1), false);

assert.strictEqual(s.canRemoveFromGroup(manager, member), true);
assert.strictEqual(s.canRemoveFromGroup(manager, manager), false, "a manager can't drop itself");
assert.strictEqual(s.canRemoveFromGroup(manager, { id: 21, group_id: 2 }), false);
assert.strictEqual(s.canRemoveFromGroup(manager, loner), false);
assert.strictEqual(s.canRemoveFromGroup(admin, manager), true);
assert.strictEqual(s.canRemoveFromGroup(member, member), false);

console.log("scope.test.js: all assertions passed");
