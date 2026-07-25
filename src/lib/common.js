const { Op, QueryTypes } = require("sequelize");
const jwt = require("jsonwebtoken");
const { sequelize } = require("../models");

// Both services share JWT_SECRET_KEY, so team-manager can mint its own
// short-lived admin token for server-to-server calls to the game service
// instead of needing a specific team's session token on hand.
const serviceAdminToken = () =>
  jwt.sign({ id: 0, is_admin: true }, process.env.JWT_SECRET_KEY, {
    expiresIn: "5m",
  });

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
    `SELECT * FROM team_match where team_id = :teamId and match_id = :matchId`,
    { replacements: { teamId, matchId: match.id }, type: QueryTypes.SELECT }
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

/**
 * Pull a table's AUTO_INCREMENT counter back down to MAX(id) + 1.
 *
 * InnoDB never lowers that counter on its own, and all three of these were
 * measured on MySQL 9.7: a unique-key clash burns a number (row 1 -> next id 3),
 * a rolled-back transaction burns one (3 -> 5), and a DELETE simply leaves its
 * gap behind (delete 5 -> next id 6). So creating a team after any failed
 * attempt, or after clearing out test teams, produced jumped ids (1, 2, 7, ...),
 * which reads as data loss to an operator.
 *
 * MySQL clamps the value to at least MAX(id) + 1, so this can never hand out an
 * id that a live row already holds. It only closes the gap at the TAIL: an
 * interior hole (delete team 2 of 1,2,3) is left alone on purpose, because
 * recycling that id would silently give a new team the roster slot the deleted
 * one still occupies inside an already-initialized game on the game service.
 *
 * Cosmetic, so failures are swallowed: the delete/create result must not depend
 * on it (a non-MySQL dialect or a lacking ALTER grant just keeps the gaps).
 */
const resyncAutoIncrement = async (Model) => {
  try {
    const pk = Model.primaryKeyAttribute;
    if (pk !== "id" || !Model.rawAttributes?.id?.autoIncrement) return;
    const table = Model.getTableName();
    const name = typeof table === "string" ? table : table.tableName;
    const max = await Model.max("id");
    const next = Number.isFinite(Number(max)) && max != null ? Number(max) + 1 : 1;
    if (!Number.isInteger(next) || next < 1) return;
    // `match` is a MySQL keyword -> the table name must stay backticked. `next`
    // is a validated integer, never user input, so it is safe to interpolate
    // (ALTER TABLE does not accept bind parameters).
    await Model.sequelize.query(
      `ALTER TABLE \`${name}\` AUTO_INCREMENT = ${next}`,
    );
  } catch (error) {
    // Ignore: ids keep their gaps, nothing else changes.
  }
};

let loadTurn = 0;
const getServiceApi = (mode) => {
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

module.exports = {
  getFilter,
  checkValidAnswer,
  getServiceApi,
  serviceAdminToken,
  resyncAutoIncrement,
};
