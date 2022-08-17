const { DataTypes, Model } = require("sequelize");
const sequelize = require("./dbInstance");

class Round extends Model {}

Round.init(
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
  },
  {
    sequelize,
    modelName: "Round",
    tableName: "round",
    uniqueKeys: {
      Items_unique: {
        fields: ["name", "tournament_id"],
      },
    },
  }
);

module.exports = Round;
