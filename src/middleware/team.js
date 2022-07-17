const changeRequest = (req, res, next) => {
  req.fields = {
    id: req.auth.id,
  };
  next();
};

const restrictEditMe = (req, res, next) => {
  req.body = {
    name: req.body.name,
    password: req.body.password,
  };
  next();
};

module.exports = { changeRequest, restrictEditMe };
