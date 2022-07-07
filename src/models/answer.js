const { DataTypes, Model } = require("sequelize");
const sequelize = require("./dbInstance");

class Answer extends Model {}

Answer.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    answer_data: {
      type: DataTypes.TEXT,
    },
    score: {
      type: DataTypes.DECIMAL(10, 2),
    },
  },
  {
    sequelize,
    modelName: "Answer",
    tableName: "answer",
  }
);

module.exports = Answer;
