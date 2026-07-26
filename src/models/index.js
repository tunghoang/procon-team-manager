const sequelize = require("./dbInstance");
const Team = require("./team");
const Tournament = require("./tournament");
const Match = require("./match");
const Question = require("./question");
const Answer = require("./answer");
const Round = require("./round");
const OptimalAnswer = require("./optimal_answer");

Tournament.hasMany(Round, {
  as: "rounds",
  foreignKey: {
    name: "tournament_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

Round.belongsTo(Tournament, {
  as: "tournament",
  foreignKey: {
    name: "tournament_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

Round.hasMany(Match, {
  as: "matches",
  foreignKey: {
    name: "round_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

Match.belongsTo(Round, {
  as: "round",
  foreignKey: {
    name: "round_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

Match.hasMany(Question, {
  as: "questions",
  foreignKey: {
    name: "match_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

Question.belongsTo(Match, {
  as: "match",
  foreignKey: {
    name: "match_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

Match.hasMany(Answer, {
  as: "answers",
  foreignKey: {
    name: "match_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

Answer.belongsTo(Match, {
  as: "match",
  foreignKey: {
    name: "match_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

Match.belongsToMany(Team, {
  through: "team_match",
  foreignKey: "match_id",
  as: "teams",
});

Team.belongsToMany(Match, {
  through: "team_match",
  foreignKey: "team_id",
});

Team.hasMany(Answer, {
  as: "answers",
  foreignKey: {
    name: "team_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

Answer.belongsTo(Team, {
  as: "team",
  foreignKey: {
    name: "team_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

Answer.belongsTo(Question, {
  as: "question",
  foreignKey: {
    name: "question_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

Question.hasMany(OptimalAnswer, {
  as: "optimal_answers",
  foreignKey: {
    name: "question_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

OptimalAnswer.belongsTo(Question, {
  as: "question",
  foreignKey: {
    name: "question_id",
    allowNull: false,
  },
  onDelete: "cascade",
});

// Lightweight idempotent migrations: sequelize.sync() creates a column on a
// fresh DB but never ALTERs an existing table, so each added column is applied
// by hand here. Duplicate-column errors (already applied) are swallowed, and
// MySQL treats `match` as a keyword -> must be backticked.
//
// Sequenced AFTER sync() resolves, and one at a time: fired concurrently with
// sync (as they used to be) they race it for the table's metadata lock, and
// because the error is swallowed a lost race left the column silently missing
// -- measured on MySQL 9.7, where `auto_reset_minutes` never appeared and every
// auto-reset tick then failed with "Unknown column".
const ADDED_COLUMNS = [
  "ALTER TABLE `match` ADD COLUMN `is_practice` TINYINT(1) NOT NULL DEFAULT 0",
  // Competitive practice (no day reset). Only meaningful with is_practice.
  "ALTER TABLE `match` ADD COLUMN `no_reset` TINYINT(1) NOT NULL DEFAULT 0",
  // Per-question auto-reset cron (lib/autoReset.js): the interval in minutes
  // (0 = off) and when the next reset is due, which doubles as the claim token.
  // Epoch seconds, not DATETIME -- see the column comment in models/question.js
  // for the timezone skew that ruled DATETIME out.
  "ALTER TABLE `question` ADD COLUMN `auto_reset_minutes` INT NOT NULL DEFAULT 0",
  "ALTER TABLE `question` ADD COLUMN `auto_reset_at_sec` BIGINT NULL",
  // Short-lived DATETIME version of the column above; dropped where it exists.
  "ALTER TABLE `question` DROP COLUMN `auto_reset_at`",
];

const migrated = sequelize.sync().then(async () => {
  for (const statement of ADDED_COLUMNS) {
    try {
      await sequelize.query(statement);
      console.log(`applied migration: ${statement}`);
    } catch {
      /* already there */
    }
  }
});

module.exports = {
  // Resolves once sync + the column migrations above have run. Anything that
  // queries an added column on boot (the auto-reset cron) should await it
  // rather than logging "Unknown column" for its first few ticks.
  migrated,
  sequelize,
  Team,
  Tournament,
  Round,
  Match,
  Question,
  Answer,
  OptimalAnswer,
};
