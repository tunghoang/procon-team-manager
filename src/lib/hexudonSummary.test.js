/**
 * Tests for the round scoring rules (no DB, no HTTP).
 *
 * Run with:  node src/lib/hexudonSummary.test.js
 *
 * These pin the decisions taken for this competition: a match is scored by
 * finishing position (1st = 1), the round total is the sum of positions with
 * the SMALLEST total winning, a rostered team that did not compete -- answered
 * no day at all -- takes the match's LAST position (so sitting one out never
 * pays off), and a team that was not on a match's roster simply has no entry
 * for it. Missing the agent-kind window is NOT sitting out: such a team plays
 * as all-patrol and is ranked on what it scored.
 */

const assert = require("assert");
const { buildRoundSummary } = require("./hexudonSummary");

const TEAMS = [
  { id: 1, name: "Alpha" },
  { id: 2, name: "Beta" },
  { id: 3, name: "Gamma" },
];

const detailFor = (ids, overrides = {}) =>
  Object.fromEntries(
    ids.map((id) => [
      String(id),
      {
        distinct_types: 0,
        cumulative_daily_types: 0,
        total_servings: 0,
        cumulative_response_time: 0,
        missed_selection: false,
        // Played every day of a 4-day match unless a case says otherwise.
        days_submitted: 4,
        ...(overrides[String(id)] || {}),
      },
    ])
  );

const match = (id, ranking, overrides = {}) => ({
  question_id: id,
  match_name: `Match ${id}`,
  question_name: `Q${id}`,
  result: { ranking: ranking.map(String), detail: detailFor(ranking, overrides) },
});

const byName = (summary, name) =>
  summary.teams.find((t) => t.team_name === name);

const tests = {
  "positions are summed and the smallest total wins"() {
    const summary = buildRoundSummary(
      [match(10, [1, 2, 3]), match(11, [2, 3, 1])],
      TEAMS
    );
    // Alpha 1+3 = 4, Beta 2+1 = 3, Gamma 3+2 = 5
    assert.strictEqual(byName(summary, "Beta").rank_points, 3);
    assert.strictEqual(byName(summary, "Alpha").rank_points, 4);
    assert.strictEqual(byName(summary, "Gamma").rank_points, 5);
    assert.deepStrictEqual(
      summary.teams.map((t) => t.team_name),
      ["Beta", "Alpha", "Gamma"]
    );
    assert.deepStrictEqual(summary.teams.map((t) => t.rank), [1, 2, 3]);
  },

  "a rostered team that answered no day takes last place"() {
    const summary = buildRoundSummary(
      [
        match(10, [1, 2, 3], { 3: { days_submitted: 0 } }),
        match(11, [1, 2, 3]),
      ],
      TEAMS
    );
    const gamma = byName(summary, "Gamma");
    assert.strictEqual(gamma.matches_counted, 2, "both matches score");
    assert.strictEqual(gamma.matches_played, 1);
    assert.strictEqual(gamma.matches_missed, 1);
    assert.strictEqual(gamma.rank_points, 6, "3 (last of 3) + 3");
    assert.strictEqual(gamma.per_match[10].position, 3);
    assert.strictEqual(gamma.per_match[10].competed, false);
  },

  "missing the agent-kind window costs the choice, not the position"() {
    // Beta played the whole match with the all-patrol default the engine gave
    // it. That is a real entry: it keeps the position it earned.
    const summary = buildRoundSummary(
      [match(10, [2, 1, 3], { 2: { missed_selection: true } })],
      TEAMS
    );
    const beta = byName(summary, "Beta");
    assert.strictEqual(beta.per_match[10].competed, true);
    assert.strictEqual(beta.per_match[10].position, 1, "it won the match");
    assert.strictEqual(beta.per_match[10].missed_selection, true, "still noted");
    assert.strictEqual(beta.matches_missed, 0);
  },

  "a legacy result without days_submitted falls back to missed_selection"() {
    // Results stored before the engine counted answered days: back then the
    // flag also meant "barred from submitting".
    const legacy = {
      question_id: 10,
      match_name: "Match 10",
      question_name: "Q10",
      result: {
        ranking: ["1", "2", "3"],
        detail: {
          1: { distinct_types: 1 },
          2: { distinct_types: 0 },
          3: { distinct_types: 0, missed_selection: true },
        },
      },
    };
    const summary = buildRoundSummary([legacy], TEAMS);
    assert.strictEqual(byName(summary, "Beta").per_match[10].competed, true);
    assert.strictEqual(byName(summary, "Gamma").per_match[10].competed, false);
    assert.strictEqual(byName(summary, "Gamma").per_match[10].position, 3);
  },

  "sitting a match out can never beat playing it"() {
    // Gamma misses match 10 and comes 2nd in 11; Beta plays both (2nd, 1st).
    const summary = buildRoundSummary(
      [
        match(10, [1, 2, 3], { 3: { days_submitted: 0 } }),
        match(11, [2, 3, 1]),
      ],
      TEAMS
    );
    const beta = byName(summary, "Beta");
    const gamma = byName(summary, "Gamma");
    assert.strictEqual(beta.rank_points, 3, "2 + 1");
    assert.strictEqual(gamma.rank_points, 5, "3 (default last) + 2");
    assert.ok(
      summary.teams.indexOf(beta) < summary.teams.indexOf(gamma),
      "the team that played both matches must finish above the absentee"
    );
  },

  "an absentee never takes a position away from a team that played"() {
    // The engine can sort an all-zero absentee ABOVE a team that played and
    // scored nothing; positions must still be numbered among competitors.
    const summary = buildRoundSummary(
      [match(10, [1, 3, 2], { 3: { days_submitted: 0 } })],
      TEAMS
    );
    assert.strictEqual(byName(summary, "Alpha").per_match[10].position, 1);
    assert.strictEqual(
      byName(summary, "Beta").per_match[10].position,
      2,
      "second among the teams that actually competed"
    );
    assert.strictEqual(byName(summary, "Gamma").per_match[10].position, 3);
  },

  "several absentees all take the same last position"() {
    const summary = buildRoundSummary(
      [
        match(10, [1, 2, 3], {
          2: { days_submitted: 0 },
          3: { days_submitted: 0 },
        }),
      ],
      TEAMS
    );
    assert.strictEqual(byName(summary, "Alpha").per_match[10].position, 1);
    assert.strictEqual(byName(summary, "Beta").per_match[10].position, 3);
    assert.strictEqual(byName(summary, "Gamma").per_match[10].position, 3);
  },

  "a team absent from a match's roster simply has no entry for it"() {
    const summary = buildRoundSummary(
      [match(10, [1, 2]), match(11, [1, 2, 3])],
      TEAMS
    );
    const gamma = byName(summary, "Gamma");
    assert.strictEqual(gamma.per_match[10], undefined);
    assert.strictEqual(gamma.matches_counted, 1);
    assert.strictEqual(gamma.rank_points, 3);
  },

  "a team that played nothing is ranked last, never first on a zero total"() {
    const summary = buildRoundSummary(
      [match(10, [1, 2], {}), match(11, [1, 2])],
      TEAMS
    );
    const gamma = byName(summary, "Gamma");
    assert.strictEqual(gamma.rank_points, 0);
    assert.strictEqual(gamma.matches_counted, 0);
    assert.strictEqual(gamma.rank, null, "no rank without a counted match");
    assert.strictEqual(
      summary.teams[summary.teams.length - 1].team_name,
      "Gamma"
    );
  },

  "an equal total goes to the team that played more matches"() {
    // Alpha: 1 + 1 = 2 over two matches. Beta: 2 over one match.
    const summary = buildRoundSummary(
      [match(10, [1, 2]), match(11, [1, 3])],
      [TEAMS[0], TEAMS[1], TEAMS[2]]
    );
    const alpha = byName(summary, "Alpha");
    const beta = byName(summary, "Beta");
    assert.strictEqual(alpha.rank_points, 2);
    assert.strictEqual(beta.rank_points, 2);
    assert.ok(
      summary.teams.indexOf(alpha) < summary.teams.indexOf(beta),
      "two matches for the same total must outrank one"
    );
  },

  "official metrics are accumulated for the matches actually played"() {
    const summary = buildRoundSummary(
      [
        match(10, [1, 2, 3], {
          1: { distinct_types: 4, total_servings: 9, cumulative_response_time: 3 },
          3: { days_submitted: 0, distinct_types: 99, total_servings: 99 },
        }),
        match(11, [1, 2, 3], {
          1: { distinct_types: 2, total_servings: 5, cumulative_response_time: 7 },
        }),
      ],
      TEAMS
    );
    const alpha = byName(summary, "Alpha");
    assert.strictEqual(alpha.totals.distinct_types, 6);
    assert.strictEqual(alpha.totals.total_servings, 14);
    assert.strictEqual(alpha.totals.cumulative_response_time, 10);
    const gamma = byName(summary, "Gamma");
    assert.strictEqual(
      gamma.totals.distinct_types,
      0,
      "a match it did not compete in contributes no metrics, only the last place"
    );
    assert.strictEqual(gamma.rank_points, 6, "3 (default last) + 3");
  },

  "a team scored but no longer in the round list is still reported"() {
    const summary = buildRoundSummary([match(10, [1, 2, 7])], [TEAMS[0], TEAMS[1]]);
    const ghost = summary.teams.find((t) => t.team_id === "7");
    assert.ok(ghost, "a team present in the engine result must not vanish");
    assert.strictEqual(ghost.rank_points, 3);
  },

  "an empty round produces no ranks rather than throwing"() {
    const summary = buildRoundSummary([], TEAMS);
    assert.strictEqual(summary.matches.length, 0);
    assert.strictEqual(summary.teams.length, 3);
    assert.ok(summary.teams.every((t) => t.rank === null));
  },

};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${e.message}`);
  }
}
console.log(
  `\n${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`
);
process.exit(failed ? 1 : 0);
