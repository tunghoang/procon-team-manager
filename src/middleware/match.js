const { Match, Team } = require("../models");

const handleTeamMatch = async (req, res, action) => {
  const { matchId, teamId } = req.params;
  try {
    const match = await Match.findByPk(matchId);
    if (!match) {
      return res.status(404).json({
        message: `Match not found`,
      });
    }
    const team = await Team.findByPk(teamId);
    if (!team) {
      return res.status(404).json({
        message: `Team not found`,
      });
    }
    switch (action) {
      case "create":
        await match.addTeams(team);
        break;
      case "remove":
        await match.removeTeam(team);
        break;
    }

    return res.status(200).json({
      match_id: matchId,
      team_id: teamId,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { handleTeamMatch };
