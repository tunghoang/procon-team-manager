const { DataTypes, Model } = require("sequelize");
const sequelize = require("./dbInstance");

class Tournament extends Model {}

Tournament.init(
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
    description: {
      type: DataTypes.TEXT,
    },
  },
  {
    sequelize,
    modelName: "Tournament",
    tableName: "tournament",
  }
);

module.exports = Tournament;
