const { Op } = require("sequelize");

const useController = (Model) => {
  const getAll = async (req, res) => {
    try {
      const query = req.query;
      const filter = Object.keys(query).reduce((cur, qKey) => {
        if (qKey.substring(0, 6) === "match_") {
          let value = query[qKey];
          const key = qKey.slice(6);
          if (key === "name" || key === "description") {
            value = {
              [Op.like]: `%${value}%`,
            };
          }
          return {
            ...cur,
            [key]: value,
          };
        }
        return cur;
      }, {});

      const data = await Model.findAll({
        where: filter,
      });

      return res.status(200).json({ data });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };
  const get = async (req, res) => {
    const { id } = req.params;
    try {
      const data = await Model.findByPk(id);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };

  const create = async (req, res) => {
    try {
      const data = await Model.create(req.body);
      return res.status(200).json({
        id: data.id,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };

  const update = async (req, res) => {
    const { id } = req.params;
    try {
      const data = await Model.findByPk(id);
      if (!data) {
        return res.status(400).json({
          error: "Not found",
        });
      }
      await data.update(req.body);
      return res.status(200).json();
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };

  const remove = async (req, res) => {
    const { id } = req.params;
    try {
      const data = await Model.findByPk(id);
      await data.destroy();
      return res.status(200).json();
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };

  return { getAll, get, update, create, remove };
};

module.exports = useController;
