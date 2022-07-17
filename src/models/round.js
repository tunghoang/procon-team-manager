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
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
    },
  },
  {
    sequelize,
    modelName: "Round",
    tableName: "round",
  }
);

module.exports = Round;
