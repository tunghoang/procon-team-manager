const sequelize = require("./dbInstance");
const Team = require("./team");
const Tournament = require("./tournament");
const Match = require("./match");
const Question = require("./question");
const Answer = require("./answer");
const Round = require("./round");

Tournament.hasMany(Round, {
  as: "rounds",
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

Match.hasMany(Question, {
  as: "questions",
  foreignKey: {
    name: "match_id",
  },
});

Question.belongsTo(Match, {
  as: "match",
  foreignKey: {
    name: "match_id",
  },
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

sequelize.sync();

module.exports = {
  sequelize,
  Team,
  Tournament,
  Match,
  Question,
  Answer,
};
