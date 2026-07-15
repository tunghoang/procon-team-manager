const { DataTypes, Model } = require("sequelize");
const sequelize = require("./dbInstance");

class Match extends Model {}

Match.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    start_time: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    end_time: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Practice match: each team plays its own isolated, self-paced game
    // (the game service creates one solo game per team).
    is_practice: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Competitive practice (only meaningful with is_practice): a submitted day
    // is final -- teams can't reset or re-submit an earlier day, and compete on
    // a shared leaderboard. Plain self-paced practice leaves this false.
    no_reset: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: "Match",
    tableName: "match",
    indexes: [{ unique: true, fields: ["name", "round_id"] }],
    //  uniqueKeys: {
    //    Items_unique: {
    //      fields: ["name", "round_id"],
    //    },
    //  },
  },
);

module.exports = Match;
