const { DataTypes, Model } = require("sequelize");
const sequelize = require("./dbInstance");

class Question extends Model {}

Question.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
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
      type: DataTypes.TEXT("long"),
    },
    // mode: {
    //   type: DataTypes.INTEGER,
    //   allowNull: true,
    //   comment: "Generation mode for auto-generated questions",
    // },
    // max_ops: {
    //   type: DataTypes.INTEGER,
    //   allowNull: true,
    //   comment: 'Maximum operations for auto-generated questions',
    // },
    // rotations: {
    //   type: DataTypes.INTEGER,
    //   allowNull: true,
    //   comment: 'Number of rotations for auto-generated questions',
    // },
    order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    // Auto-reset cron: every N minutes the question's game(s) are wiped back to
    // the agent-selection stage so the same board can be played again (see
    // lib/autoReset.js). 0 = off.
    auto_reset_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // When the next automatic reset is due, as EPOCH SECONDS. Also the
    // scheduler's claim token: the tick only resets rows whose due time has
    // passed, and moves the time forward in the same statement, so two app
    // instances can never both fire the same reset.
    //
    // Deliberately not a DATETIME. This deployment's MySQL session runs at
    // +00:00 while Node runs at +07:00 and dbInstance sets no `timezone`, so a
    // JS Date written to a DATETIME comes back 7 h out (measured: stored
    // "20:37" local wall clock against a UTC NOW(), read back as 03:37 the next
    // day) -- the cron's "is it due yet?" comparison silently never matched. An
    // integer has no timezone to disagree about.
    auto_reset_at_sec: {
      type: DataTypes.BIGINT,
      allowNull: true,
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
  },
);

module.exports = Question;
