const { Router } = require("express");
const { requireAdmin, requireStaff } = require("../middleware/authenticate");
const {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  removeGroup,
  getMembers,
  getCandidates,
  addMembers,
  removeMember,
} = require("../controllers/group");

const router = Router();

// Staff (superadmin or group manager). The controller narrows a manager to its
// own group on every one of these.
router.use(requireStaff);
router.route("/").get(getGroups);
router.route("/:id").get(getGroup);
router.route("/:id/members").get(getMembers).post(addMembers);
router.route("/:id/candidates").get(getCandidates);
router.route("/:id/members/:teamId").delete(removeMember);

// Creating, renaming and deleting groups is the superadmin's alone.
router.all("*", requireAdmin);
router.route("/").post(createGroup);
router.route("/:id").put(updateGroup).delete(removeGroup);

module.exports = router;
