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
    mode: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Generation mode for auto-generated questions',
    },
    max_ops: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Maximum operations for auto-generated questions',
    },
    rotations: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Number of rotations for auto-generated questions',
    },
    order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
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
