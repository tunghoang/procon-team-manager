const { DataTypes, Model } = require("sequelize");
const sequelize = require("./dbInstance");

class OptimalAnswer extends Model { }

OptimalAnswer.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    moves: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
      comment: "JSON string of all moves [{\"x\": row, \"y\": col, \"n\": size}, ...]",
    },
  },
  {
    sequelize,
    modelName: "OptimalAnswer",
    tableName: "optimal_answer",
  }
);

module.exports = OptimalAnswer;

