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
      type: DataTypes.TEXT("long"),
      /*get() {
        const raw = this.getDataValue('answer_data');
        try {
          console.log(raw, JSON.parse(raw));
          return JSON.parse(raw);
        }
        catch(e) {
          console.log(e.message);
          return null;
        }
      },
      set(value) {
        this.setDataValue('answer_data', JSON.stringify(value));
      }*/
    },
    score_data: {
      type: DataTypes.TEXT("long"),
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
