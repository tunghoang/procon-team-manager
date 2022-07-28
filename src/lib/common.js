const { Op } = require("sequelize");

const getFilter = (query) => {
  const filterFields = ["name", "description"];
  return Object.keys(query).reduce((cur, qKey) => {
    if (qKey.substring(0, 6) === "match_") {
      const value = query[qKey];
      const key = qKey.slice(6);
      return {
        ...cur,
        [key]: filterFields.includes(key) ? { [Op.like]: `%${value}%` } : value,
      };
    }
    return cur;
  }, {});
};

module.exports = { getFilter };
