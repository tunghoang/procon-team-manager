/**
 * Round-level HEXUDON standings: rank each match, then add the ranks up.
 *
 * Scoring, as decided for this competition:
 *   - a team's score in one match is its FINISHING POSITION there (1st = 1);
 *   - the round total is the sum of those positions, so the SMALLEST total wins;
 *   - a team that was ON THAT MATCH'S ROSTER but never competed -- it answered
 *     no day at all (days_submitted 0) -- takes the match's LAST position.
 *     Sitting a match out must never pay off. Note that merely missing the
 *     agent-kind window is NOT sitting out: the engine defaults such a team to
 *     all-patrol and it plays on, so it is ranked on what it scored;
 *   - a team that was not on that match's roster has nothing to score there, so
 *     the match simply does not appear for it.
 *
 * Positions are numbered among the teams that ACTUALLY COMPETED, so an absent
 * team can never push a competing one down. The engine ranks every team,
 * absentees included, and since they all score zero its tie-break can even sort
 * an absent team above a team that played and collected nothing -- taking those
 * slots at face value would hand out positions nobody earned.
 *
 * Kept as a pure module (no Express, no HTTP) so the ranking rules can be
 * tested directly -- see hexudonSummary.test.js.
 */

/**
 * Did this team actually play the match? `days_submitted` is the engine's count
 * of days it answered. Results produced before that field existed fall back to
 * the old signal (missed_selection), which back then also meant "barred from
 * submitting".
 */
const competed = (detail) => {
  if (!detail) return false;
  if (typeof detail.days_submitted === "number") return detail.days_submitted > 0;
  return detail.missed_selection !== true;
};

/**
 * Turn one game's /game/result into per-team rows carrying a position each.
 *
 * Competing teams are numbered 1..k in the engine's own ranking order (which
 * already applies the official tie-break chain: distinct types, cumulative
 * daily types, servings, response time). Every rostered team that did not
 * compete takes the SAME last position -- the size of the match roster -- and
 * is flagged so the UI and the export can show why it got there.
 */
const positionsFor = (result) => {
  const ranking = Array.isArray(result?.ranking) ? result.ranking : [];
  const detail = result?.detail || {};
  const lastPosition = ranking.length;
  let earned = 0;
  return ranking.map((teamId) => {
    const teamDetail = detail[String(teamId)] || detail[teamId] || {};
    const didCompete = competed(teamDetail);
    if (didCompete) earned += 1;
    return {
      team_id: String(teamId),
      position: didCompete ? earned : lastPosition,
      // On the roster -> this match always contributes rank points.
      counted: true,
      competed: didCompete,
      distinct_types: teamDetail.distinct_types ?? 0,
      cumulative_daily_types: teamDetail.cumulative_daily_types ?? 0,
      total_servings: teamDetail.total_servings ?? 0,
      cumulative_response_time: teamDetail.cumulative_response_time ?? 0,
      // Played with agent kinds it did not choose (all-patrol default) -- shown
      // as a note next to its position, not as a penalty.
      missed_selection: teamDetail.missed_selection === true,
      days_submitted: teamDetail.days_submitted ?? 0,
    };
  });
};

/**
 * @param {Array} matches  [{question_id, match_name, question_name, status, result}]
 * @param {Array} teams    [{id, name}] every team in the round
 * @returns {{matches: Array, teams: Array}} matches carry their per-team rows,
 *          teams carry the round total, already sorted and given a round rank.
 */
const buildRoundSummary = (matches, teams) => {
  const byTeam = new Map();
  for (const team of teams) {
    byTeam.set(String(team.id), {
      team_id: String(team.id),
      team_name: team.name,
      rank_points: 0,
      matches_counted: 0,   // matches contributing rank points
      matches_played: 0,    // of those, actually competed in
      matches_missed: 0,    // of those, taken as a default last place
      per_match: {},
      totals: {
        distinct_types: 0,
        cumulative_daily_types: 0,
        total_servings: 0,
        cumulative_response_time: 0,
      },
    });
  }

  const matchRows = [];
  for (const match of matches) {
    const rows = positionsFor(match.result);
    for (const row of rows) {
      // A team that played but is no longer in the round's team list (e.g.
      // removed afterwards) still gets an entry, so nothing silently vanishes.
      if (!byTeam.has(row.team_id)) {
        byTeam.set(row.team_id, {
          team_id: row.team_id,
          team_name: `#${row.team_id}`,
          rank_points: 0,
          matches_counted: 0,
          matches_played: 0,
          matches_missed: 0,
          per_match: {},
          totals: {
            distinct_types: 0,
            cumulative_daily_types: 0,
            total_servings: 0,
            cumulative_response_time: 0,
          },
        });
      }
      const entry = byTeam.get(row.team_id);
      entry.per_match[match.question_id] = {
        position: row.position,
        counted: row.counted,
        competed: row.competed,
        missed_selection: row.missed_selection,
        days_submitted: row.days_submitted,
        distinct_types: row.distinct_types,
        cumulative_daily_types: row.cumulative_daily_types,
        total_servings: row.total_servings,
        cumulative_response_time: row.cumulative_response_time,
      };
      // Every rostered team scores this match -- competing teams with the
      // position they earned, absentees with the match's last position.
      entry.rank_points += row.position;
      entry.matches_counted += 1;
      if (row.competed) {
        entry.matches_played += 1;
        entry.totals.distinct_types += row.distinct_types;
        entry.totals.cumulative_daily_types += row.cumulative_daily_types;
        entry.totals.total_servings += row.total_servings;
        entry.totals.cumulative_response_time += row.cumulative_response_time;
      } else {
        entry.matches_missed += 1;
      }
    }
    matchRows.push({ ...match, result: undefined, rows });
  }

  const ordered = [...byTeam.values()].sort((a, b) => {
    // A team with nothing counted has a total of 0, which would otherwise put
    // it on top; it belongs at the bottom.
    const aPlayed = a.matches_counted > 0;
    const bPlayed = b.matches_counted > 0;
    if (aPlayed !== bPlayed) return aPlayed ? -1 : 1;
    if (a.rank_points !== b.rank_points) return a.rank_points - b.rank_points;
    // Same total: the team that earned it over more matches ranks higher,
    // and among those the one that actually competed more.
    if (a.matches_counted !== b.matches_counted) {
      return b.matches_counted - a.matches_counted;
    }
    if (a.matches_played !== b.matches_played) {
      return b.matches_played - a.matches_played;
    }
    // Then the official metrics, in their official order.
    if (a.totals.distinct_types !== b.totals.distinct_types) {
      return b.totals.distinct_types - a.totals.distinct_types;
    }
    if (a.totals.cumulative_daily_types !== b.totals.cumulative_daily_types) {
      return b.totals.cumulative_daily_types - a.totals.cumulative_daily_types;
    }
    if (a.totals.total_servings !== b.totals.total_servings) {
      return b.totals.total_servings - a.totals.total_servings;
    }
    if (
      a.totals.cumulative_response_time !== b.totals.cumulative_response_time
    ) {
      return (
        a.totals.cumulative_response_time - b.totals.cumulative_response_time
      );
    }
    return Number(a.team_id) - Number(b.team_id);
  });

  ordered.forEach((entry, index) => {
    entry.rank = entry.matches_counted > 0 ? index + 1 : null;
  });

  return { matches: matchRows, teams: ordered };
};

module.exports = { buildRoundSummary, positionsFor, competed };
