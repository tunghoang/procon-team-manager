const { DataTypes, Model } = require("sequelize");
const sequelize = require("./dbInstance");

/**
 * A group of accounts that belong together -- in practice one school (UET,
 * HCMUE, ...). Membership is set BY HAND: account names carry the school in
 * inconsistent ways ("UET.XLD", "UET-AUT", "HCMUE 1", and older rows with no
 * prefix at all), so nothing here derives it from the name.
 *
 * A group's MANAGER (team.group_role = "manager", a dedicated non-playing
 * account) can set up matches for its own members: create matches, add group
 * members to them, paste board JSON in as questions, reset/delete those. Its
 * reach stops at the group boundary; everything else stays with the
 * superadmin (team.is_admin).
 */
class Group extends Model {}

Group.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Group",
    // `group` is a reserved word in MySQL; keep the table name unambiguous.
    tableName: "team_group",
  },
);

module.exports = Group;
