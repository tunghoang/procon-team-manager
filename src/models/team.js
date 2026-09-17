const { DataTypes, Model } = require("sequelize");
const sequelize = require("./dbInstance");

class Team extends Model {}

Team.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING, // VARCHAR(255)
      allowNull: false,
      unique: true,
    },
    account: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // Superadmin: the organiser. Unscoped -- sees and edits everything on both
    // the manager and the game service (the JWT flag is trusted there too).
    is_admin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // School/group this account belongs to (models/group.js). NULL = none yet.
    // Assigned by hand: by the superadmin, or by that group's manager pulling
    // an ungrouped account in.
    group_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // "manager" = runs its group's matches (a dedicated non-playing account);
    // "member" = an ordinary team. Meaningless without group_id.
    group_role: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "member",
    },
  },
  {
    sequelize,
    modelName: "Team",
    tableName: "team",
  }
);

module.exports = Team;
