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
    is_admin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: "Team",
    tableName: "team",
  }
);

module.exports = Team;
