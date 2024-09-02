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

const checkValidAnswer = async (match, teamId) => {
  let message = "";
  const team = await sequelize.query(
    `SELECT * FROM team_match where team_id = ${teamId} and match_id = ${match.id}`,
    { type: QueryTypes.SELECT }
  );
  if (!team.length) message = "Team not allowed";
  else if (!match.is_active) message = "Match inactive";
  else {
    const now = new Date();
    const startTime = new Date(match.start_time);
    const endTime = new Date(match.end_time);
    if (now < startTime || now > endTime) message = "Out of time";
  }

  return message;
};

const getServiceApi = () => {
  // Load balancing
  const SERVICE_APIS = process.env.SERVICE_APIS;
  return SERVICE_APIS[Math.floor(Math.random() * SERVICE_APIS.length)];
};

module.exports = { getFilter, checkValidAnswer, getServiceApi };
