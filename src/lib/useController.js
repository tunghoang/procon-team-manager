const { Op } = require("sequelize");
const filterFields = ["name", "description"];
const useController = (Model) => {
  const getAll = async (req, res, ignore = []) => {
    try {
      const query = req.query;
      const filter = Object.keys(query).reduce((cur, qKey) => {
        if (qKey.substring(0, 6) === "match_") {
          const value = query[qKey];
          const key = qKey.slice(6);
          return {
            ...cur,
            [key]: filterFields.includes(key)
              ? { [Op.like]: `%${value}%` }
              : value,
          };
        }
        return cur;
      }, {});

      const data = await Model.findAll({
        where: filter,
        attributes: { exclude: ignore },
      });

      return res.status(200).json({ data });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  };
  const get = async (req, res, ignore = []) => {
    const id = req.params.id || req.fields?.id;
    try {
      const data = await Model.findByPk(id, {
        attributes: { exclude: ignore },
      });
      if (!data) {
        return res.status(404).json({
          message: `${Model.name} not found`,
        });
      }
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  };

  const create = async (req, res) => {
    try {
      const data = await Model.create(req.body);
      return res.status(201).json({
        id: data.id,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };

  const update = async (req, res) => {
    const id = req.params.id || req.fields?.id;
    try {
      const data = await Model.findByPk(id);
      if (!data) {
        return res.status(404).json({
          message: `${Model.name} not found`,
        });
      }
      await data.update(req.body);
      return res.status(200).json({
        id,
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  };

  const remove = async (req, res) => {
    const id = req.params.id || req.fields?.id;
    try {
      const data = await Model.findByPk(id);
      if (!data) {
        return res.status(404).json({
          message: "Not found",
        });
      }
      await data.destroy();
      return res.status(200).json({
        id,
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  };

  return { getAll, get, update, create, remove };
};

module.exports = useController;
