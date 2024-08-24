const { getFilter } = require("./common");

const useController = (Model) => {
  const getAll = async (req, res, ignore, include, filterField) => {
    try {
      const filter = getFilter(req.query, filterField);
      const data = await Model.findAndCountAll({
        where: filter,
        attributes: { exclude: ignore },
        include,
      });
      for (let row of data.rows) {
        if (row.answer_data != null && row.answer_data.length > 0)
          row.answer_data = JSON.parse(row.answer_data);
      }
      return res.status(200).json({ count: data.count, data: data.rows });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  };
  const get = async (req, res, ignore, include) => {
    const id = req.params.id;
    try {
      const data = await Model.findByPk(id, {
        attributes: { exclude: ignore },
        include,
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
      return res.status(500).json({ message: error.message });
    }
  };

  const update = async (req, res) => {
    const id = req.params.id;
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
    const id = req.params.id;
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
