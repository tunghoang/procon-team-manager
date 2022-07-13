const useController = (Model) => {
  const getAll = async (req, res) => {
    try {
      const data = await Model.findAll();

      return res.status(200).json({ data });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error });
    }
  };
  const get = async (req, res) => {
    const { id } = req.params;
    try {
      const data = await Model.findByPk(id);
      return res.status(200).json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error });
    }
  };

  const create = async (req, res) => {
    try {
      const data = await Model.create(req.body);
      return res.status(200).json({
        id: data.id,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error });
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
      console.log(error);
      return res.status(500).json({ error });
    }
  };

  const remove = async (req, res) => {
    const { id } = req.params;
    try {
      const data = await Model.findByPk(id);
      await data.destroy();
      return res.status(200).json();
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error });
    }
  };

  return { getAll, get, update, create, remove };
};

module.exports = useController;
