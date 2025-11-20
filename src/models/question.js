const { DataTypes, Model } = require("sequelize");
const sequelize = require("./dbInstance");

class Question extends Model { }

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
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    start_time: {
      type: DataTypes.DATE,
    },
    end_time: {
      type: DataTypes.DATE,
    },
    question_data: {
      type: DataTypes.TEXT('long'),
    },
    match_factor: {
      type: DataTypes.FLOAT,
      defaultValue: 1.0,
    },
    step_factor: {
      type: DataTypes.FLOAT,
      defaultValue: -0.05,
    },
    resub_factor: {
      type: DataTypes.FLOAT,
      defaultValue: -10.0,
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
