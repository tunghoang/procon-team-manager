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
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: "Match",
    tableName: "match",
    // uniqueKeys: {
    //   Items_unique: {
    //     fields: ["name", "round_id"],
    //   },
    // },
    indexes: [{ unique: true, fields: ["name", "round_id"] }],
  }
);

module.exports = Match;
