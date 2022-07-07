const { DataTypes, Model } = require("sequelize");
const sequelize = require("./dbInstance");

class Question extends Model {}

Question.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    start_time: {
      type: DataTypes.DATE,
    },
    end_time: {
      type: DataTypes.DATE,
    },
    question_data: {
      type: DataTypes.TEXT,
    },
  },
  {
    sequelize,
    modelName: "Question",
    tableName: "question",
  }
);

module.exports = Question;
