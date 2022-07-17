const bcrypt = require("bcrypt");

const encryptPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(String(password), salt);
};

const comparePassword = async (password, encrypt) => {
  return await bcrypt.compare(String(password), encrypt);
};

module.exports = { encryptPassword, comparePassword };
