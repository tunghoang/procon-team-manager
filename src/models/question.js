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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
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
    uniqueKeys: {
      Items_unique: {
        fields: ["name", "match_id"],
      },
    },
  }
);

module.exports = Question;
