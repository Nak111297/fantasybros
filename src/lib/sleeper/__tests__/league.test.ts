import { describe, expect, it } from "vitest";
import {
  buildTeams,
  findUserTeam,
  leagueType,
  positionCounts,
  resolvePlayer,
  summarizeScoring,
} from "../league";
import type { SleeperLeagueUser, SleeperPlayerMap, SleeperRoster } from "../types";

// Trimmed-down copies of real Sleeper API responses.
const players: SleeperPlayerMap = {
  "4046": { player_id: "4046", full_name: "Patrick Mahomes", position: "QB", team: "KC", age: 31 },
  "4034": { player_id: "4034", full_name: "Christian McCaffrey", position: "RB", team: "SF", age: 30, injury_status: "Questionable" },
  "6794": { player_id: "6794", full_name: "Justin Jefferson", position: "WR", team: "MIN", age: 27 },
  "4881": { player_id: "4881", full_name: "Lamar Jackson", position: "QB", team: "BAL", age: 29 },
  "9509": { player_id: "9509", first_name: "Bijan", last_name: "Robinson", position: "RB", team: "ATL", age: 24 },
  "11632": { player_id: "11632", full_name: "Rookie Taxi", position: "WR", team: "NYJ", age: 21 },
  SF: { player_id: "SF", first_name: "San Francisco", last_name: "49ers", position: "DEF", team: "SF" },
};

const users: SleeperLeagueUser[] = [
  { user_id: "u1", display_name: "nico", avatar: "abc", metadata: { team_name: "Bros FC" } },
  { user_id: "u2", display_name: "rival", avatar: null },
];

const rosters: SleeperRoster[] = [
  {
    roster_id: 1,
    owner_id: "u2",
    league_id: "L",
    players: ["4881", "9509"],
    starters: ["4881", "0"],
    reserve: null,
    taxi: null,
    settings: { wins: 5, losses: 2, ties: 0, fpts: 800, fpts_decimal: 50 },
  },
  {
    roster_id: 2,
    owner_id: "u1",
    league_id: "L",
    players: ["4046", "4034", "6794", "11632", "SF"],
    starters: ["4046", "6794", "SF"],
    reserve: ["4034"],
    taxi: ["11632"],
    settings: { wins: 5, losses: 2, ties: 0, fpts: 900, fpts_decimal: 12, fpts_against: 700 },
  },
  {
    roster_id: 3,
    owner_id: null,
    league_id: "L",
    players: [],
    starters: [],
    reserve: null,
    taxi: null,
    settings: { wins: 1, losses: 6 },
  },
];

describe("leagueType", () => {
  it("maps Sleeper settings.type", () => {
    expect(leagueType({ settings: { type: 0 } })).toBe("redraft");
    expect(leagueType({ settings: { type: 1 } })).toBe("keeper");
    expect(leagueType({ settings: { type: 2 } })).toBe("dynasty");
    expect(leagueType({ settings: {} })).toBe("redraft");
  });
});

describe("summarizeScoring", () => {
  it("detects half PPR, TE premium and superflex", () => {
    const s = summarizeScoring({
      scoring_settings: { rec: 0.5, bonus_rec_te: 0.5, pass_td: 6, pass_yd: 0.04 },
      roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SUPER_FLEX", "BN", "BN", "BN", "IR", "TAXI"],
    });
    expect(s.format).toBe("Half PPR");
    expect(s.tePremium).toBe(0.5);
    expect(s.passTd).toBe(6);
    expect(s.superflex).toBe(true);
    expect(s.idp).toBe(false);
    expect(s.starterSlots).toHaveLength(8);
    expect(s.benchSlots).toBe(3);
  });

  it("handles standard 1QB leagues and IDP", () => {
    const s = summarizeScoring({
      scoring_settings: { rec: 0 },
      roster_positions: ["QB", "RB", "WR", "TE", "DL", "LB", "BN"],
    });
    expect(s.format).toBe("Standard");
    expect(s.superflex).toBe(false);
    expect(s.idp).toBe(true);
  });
});

describe("resolvePlayer", () => {
  it("falls back to first/last name and labels defenses", () => {
    expect(resolvePlayer("9509", players).name).toBe("Bijan Robinson");
    expect(resolvePlayer("SF", players).name).toBe("San Francisco 49ers D/ST");
    expect(resolvePlayer("NYG", players)).toMatchObject({ name: "NYG D/ST", position: "DEF" });
    expect(resolvePlayer("999999", players).name).toBe("Unknown (999999)");
  });
});

describe("buildTeams", () => {
  const teams = buildTeams(rosters, users, players);

  it("sorts by record, then points for", () => {
    expect(teams.map((t) => t.rosterId)).toEqual([2, 1, 3]);
    expect(teams[0].pointsFor).toBeCloseTo(900.12);
  });

  it("splits starters, bench, IR and taxi", () => {
    const mine = teams[0];
    expect(mine.teamName).toBe("Bros FC");
    expect(mine.starters.map((p) => p.id)).toEqual(["4046", "6794", "SF"]);
    expect(mine.reserve.map((p) => p.id)).toEqual(["4034"]);
    expect(mine.taxi.map((p) => p.id)).toEqual(["11632"]);
    expect(mine.bench).toEqual([]);
  });

  it("drops empty starter slots and keeps the rest on the bench", () => {
    const rival = teams[1];
    expect(rival.starters.map((p) => p.id)).toEqual(["4881"]);
    expect(rival.bench.map((p) => p.id)).toEqual(["9509"]);
    expect(rival.teamName).toBe("rival");
  });

  it("labels orphaned teams", () => {
    expect(teams[2].ownerName).toBe("Orphaned team");
  });

  it("finds the user's team and counts positions", () => {
    const mine = findUserTeam(teams, "u1", rosters)!;
    expect(mine.rosterId).toBe(2);
    expect(positionCounts(mine)).toEqual({ QB: 1, RB: 1, WR: 2, DEF: 1 });
  });
});
