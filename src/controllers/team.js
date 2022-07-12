const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const { Team } = require("../models");

const signin = async (req, res) => {
  const { account, password } = req.body;
  try {
    const team = await Team.findOne({
      where: {
        account,
      },
    });
    if (!team) {
      return res.status(401).json({ error: "Account not found" });
    }
    const isPasswordMatch = await bcrypt.compare(
      String(password),
      team.password
    );
    if (!isPasswordMatch) {
      return res
        .status(401)
        .json({ error: "Account and Password haven't matched" });
    }
    const token = jwt.sign(
      {
        id: team.id,
        name: team.name,
        is_admin: team.is_admin,
      },
      process.env.JWT_SECRET_KEY
    );

    return res.status(200).json({
      token,
      name: team.name,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const signup = async (req, res) => {
  const { name, account, password } = req.body;
  try {
    const team = await Team.findOne({
      where: {
        [Op.or]: [
          {
            account,
          },
          {
            name,
          },
        ],
      },
    });
    if (team) {
      return res.status(400).json({ error: `${name} has already existed` });
    }
    const saltRounds = 10;
    bcrypt.hash(String(password), saltRounds, async (error, hash_password) => {
      if (error) {
        console.log(error);
        return res.status(400).json({ error });
      }
      const newTeam = await Team.create({
        name,
        account,
        password: hash_password,
      });
      newTeam.password = undefined;
      return res.status(201).json({ team: newTeam });
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

module.exports = {
  signin,
  signup,
};
