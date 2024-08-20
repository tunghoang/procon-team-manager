const { Op, QueryTypes } = require("sequelize");
const { sequelize } = require("../models");

const getFilter = (query, filterField) => {
  return Object.keys(query).reduce((cur, queryField) => {
    let value = query[queryField];
    const filter = filterField[queryField];
    if (!filter) return cur;
    if (typeof value === "object") {
      return {
        ...cur,
        ...getFilter(value, filter),
      };
    }

    return {
      ...cur,
      [filter.field]: {
        [Op[filter.op]]: filter.op === "like" ? `%${value}%` : value,
      },
    };
  }, {});
};

const checkValidAnswer = async (question, teamId) => {
  let message = "";
  const team = await sequelize.query(
    `SELECT * FROM team_match where team_id = ${teamId} and match_id = ${question.match_id}`,
    { type: QueryTypes.SELECT }
  );
  if (!team.length) message = "Question not found";
  else if (!question.match.is_active) message = "Match inactive";
  else {
    const now = new Date();
    const startTime = new Date(question.start_time);
    const endTime = new Date(question.end_time);
    if (now < startTime || now > endTime) message = "Out of time";
  }

  return message;
};

const safeJSONParse = (str) => {
  try {
    const j = JSON.parse(str);

    return j;
  } catch (e) {
    // handle exception, logging?
    return null;
  }
};

module.exports = { getFilter, checkValidAnswer, safeJSONParse };
