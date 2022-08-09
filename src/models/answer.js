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
    score_data: {
      type: DataTypes.TEXT,
    },
  },
  {
    sequelize,
    modelName: "Answer",
    tableName: "answer",
    uniqueKeys: {
      Items_unique: {
        fields: ["team_id", "question_id"],
      },
    },
  }
);

module.exports = Answer;
