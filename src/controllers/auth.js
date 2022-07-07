const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Team } = require("../models");

const signin = async (req, res) => {
  const { account, password } = req.body;
  try {
    const team = await Team.findOne({
      where: {
        account,
      },
    });
    if (team) {
      const isPasswordMatch = await bcrypt.compare(password, team.password);
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
    } else {
      return res.status(401).json({ error: "Account does not found" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error });
  }
};

const saltRounds = 10;

const signup = async (req, res) => {
  const { name, account, password } = req.body;
  try {
    const team = await Team.findOne({
      where: {
        account: account,
      },
    });
    if (user) {
      return res.status(400).json({ error: `${name} has already existed` });
    }
    bcrypt.hash(password, saltRounds, async (error, hash_password) => {
      if (error) {
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
