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

let loadTurn = 0;
const getServiceApi = (mode='roundrobin') => {
  // Load balancing
  const SERVICE_APIS = JSON.parse(process.env.SERVICE_APIS || '[]');
  let url;
  if (mode === 'random') {
    url = SERVICE_APIS[Math.floor(Math.random() * SERVICE_APIS.length)];
  } else if (mode === 'roundrobin') {
    url = SERVICE_APIS[loadTurn];
    loadTurn = (loadTurn + 1) % SERVICE_APIS.length;
  } else {
    url = SERVICE_APIS[0];
  }
  return url
};

module.exports = { getFilter, checkValidAnswer, getServiceApi };
