import { describe, expect, it } from "vitest";
import { auctionValues, keeperCost, keeperValue, SUPER_LEAGUE_RULES, keeperSlotsFor } from "../keeper";
import { TradeEngine, DEFAULT_SETTINGS } from "../trades";
import type { EnginePlayer, LeagueSnapshot, Position } from "../types";
import { buildModel, profileTeams } from "../valuation";

// The worked example from the design doc: flat ROS ppg, one week, no byes.
function player(id: string, position: Position, ppg: number): EnginePlayer {
  return { id, name: id, position, nflTeam: null, injuryStatus: null, weekly: [ppg] };
}

function workedExample(): LeagueSnapshot {
  const ps = [
    player("uQB", "QB", 19), player("uRB11", "RB", 11), player("uRB8", "RB", 8), player("uRB6.5", "RB", 6.5),
    player("uWR17", "WR", 17), player("uWR15", "WR", 15), player("uWR14", "WR", 14), player("uWR12.5", "WR", 12.5),
    player("uTE", "TE", 9),
    player("oQB", "QB", 18), player("oRB16", "RB", 16), player("oRB13.5", "RB", 13.5), player("oRB12", "RB", 12),
    player("oWR13", "WR", 13), player("oWR10", "WR", 10), player("oWR8", "WR", 8), player("oTE", "TE", 7),
    player("faRB1", "RB", 7), player("faRB2", "RB", 7), player("faRB3", "RB", 7),
    player("faWR1", "WR", 9), player("faWR2", "WR", 9), player("faWR3", "WR", 9),
    player("faQB", "QB", 10), player("faTE", "TE", 4),
  ];
  const team = (id: string, isUser: boolean) => ({
    id, name: id, ownerName: id, isUser, wins: 0, losses: 0, ties: 0, pointsFor: 0,
    playerIds: ps.filter((p) => p.id.startsWith(id[0])).map((p) => p.id).filter((x) => !x.startsWith("fa")),
    irPlayerIds: [],
  });
  return {
    id: "L", name: "Example", season: "2026", currentWeek: 8, weeks: [8], weekWeights: [1],
    slots: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN"],
    rosterMax: 9, numTeams: 2, regularWeeksLeft: 6, tradeDeadlinePassed: false,
    teams: [team("user", true), team("opp", false)],
    players: Object.fromEntries(ps.map((p) => [p.id, p])),
    freeAgentIds: ps.filter((p) => p.id.startsWith("fa")).map((p) => p.id),
  };
}

describe("valuation", () => {
  const model = buildModel(workedExample());

  it("sets replacement from the top free agents", () => {
    expect(model.repl.RB).toBe(7);
    expect(model.repl.WR).toBe(9);
    expect(model.tv["oRB12"]).toBe(5);
  });

  it("solves the best lineup with FLEX", () => {
    const [u, o] = profileTeams(model);
    expect(u.strength).toBeCloseTo(93.0);
    expect(o.strength).toBeCloseTo(89.5);
    expect(u.need.RB).toBeGreaterThan(0);
    expect(o.need.WR).toBeGreaterThan(0);
  });
});

describe("worked example trades", () => {
  const engine = new TradeEngine(buildModel(workedExample()));
  const [user, opp] = engine.model.snap.teams;

  it("1-for-1: give WR 14.0, get RB 12.0", () => {
    const t = engine.evaluate(user, opp, ["uWR14"], ["oRB12"]);
    expect(t.user.delta).toBeCloseTo(2.5);
    expect(t.opponent.delta).toBeCloseTo(2.0);
    expect(t.valueToOpponent).toBeCloseTo(0);
    expect(t.pAccept).toBeCloseTo(0.82, 2);
    expect(t.score).toBeCloseTo(2.04, 1);
  });

  it("2-for-1: give WR 15.0 + RB 8.0, get RB 16.0", () => {
    const t = engine.evaluate(user, opp, ["uWR15", "uRB8"], ["oRB16"]);
    expect(t.user.delta).toBeCloseTo(5.5);
    expect(t.opponent.delta).toBeCloseTo(-1.0);
    expect(t.valueToOpponent).toBeCloseTo(-2.0);
    expect(t.pAccept).toBeCloseTo(0.18, 2);
    expect(t.score).toBeCloseTo(1.0, 1);
  });

  it("1-for-2: give WR 17.0, get RB 13.5 + RB 12.0 (their RB2 falls to replacement)", () => {
    const t = engine.evaluate(user, opp, ["uWR17"], ["oRB13.5", "oRB12"]);
    expect(t.user.delta).toBeCloseTo(2.0);
    expect(t.opponent.delta).toBeCloseTo(-1.5);
    expect(t.valueToOpponent).toBeCloseTo(-3.5);
    expect(t.pAccept).toBeCloseTo(0.08, 2);
  });

  it("ranks trades at least as good as the doc's best and explains them", () => {
    const all = engine.suggest("user");
    expect(all.length).toBeGreaterThan(0);
    // The search finds offers that beat the doc's hand-picked 1-for-1 (score 2.04).
    expect(all[0].score).toBeGreaterThanOrEqual(2.04);
    expect(all.map((t) => t.score)).toEqual([...all.map((t) => t.score)].sort((a, b) => b - a));
    expect(all[0].explanation.yourSide).toMatch(/Your RB\d goes from [\d.]+ to [\d.]+ ppg/);
    expect(all[0].explanation.theirSide).toMatch(/WR is a weak spot for them/);
  });

  it("only suggests trades that help both sides in win-win mode", () => {
    for (const t of engine.suggest("user")) {
      expect(t.user.total).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.minGain);
      expect(t.opponent.total).toBeGreaterThan(0);
    }
  });

  it("returns nothing after the trade deadline", () => {
    const snap = { ...workedExample(), tradeDeadlinePassed: true };
    expect(new TradeEngine(buildModel(snap)).suggest("user")).toEqual([]);
  });
});

describe("market values", () => {
  it("make managers value big names they barely start", () => {
    // The opponent's RB 12.0 is their FLEX; a hot market name should cost more.
    const snap = { ...workedExample(), marketValue: { "oRB12": 9000, "uWR14": 1000, "uWR17": 3000, "oRB16": 4000, "oRB13.5": 2500 } };
    const engine = new TradeEngine(buildModel(snap));
    const [user, opp] = engine.model.snap.teams;
    const t = engine.evaluate(user, opp, ["uWR14"], ["oRB12"]);
    expect(engine.model.tv["oRB12"]).toBeGreaterThan(engine.model.tv["uWR14"]);
    expect(t.valueToOpponent).toBeLessThan(0);
    expect(t.pAccept).toBeLessThan(0.82);
  });

  it("charges you for giving away more value than you get", () => {
    const snap = { ...workedExample(), marketValue: { uWR17: 20000, "oRB13.5": 1000, oRB12: 1000, uWR14: 1000 } };
    const engine = new TradeEngine(buildModel(snap));
    const [user, opp] = engine.model.snap.teams;
    const t = engine.evaluate(user, opp, ["uWR17"], ["oRB13.5", "oRB12"]);
    expect(t.valueToOpponent).toBeGreaterThan(0);
    expect(t.netGain).toBeLessThan(t.user.total);
    expect(t.score).toBeCloseTo(t.netGain * t.pAccept);
  });

  it("leaves IDP players out of trades unless asked", () => {
    const snap = workedExample();
    snap.slots = [...snap.slots, "IDP_FLEX"];
    snap.players["uLB"] = { id: "uLB", name: "uLB", position: "LB", nflTeam: null, injuryStatus: null, weekly: [12] };
    snap.players["oLB"] = { id: "oLB", name: "oLB", position: "LB", nflTeam: null, injuryStatus: null, weekly: [6] };
    snap.teams[0].playerIds.push("uLB");
    snap.teams[1].playerIds.push("oLB");
    snap.rosterMax = 10;
    const ids = (s: ReturnType<TradeEngine["suggest"]>) => s.flatMap((t) => [...t.give, ...t.get]);
    expect(ids(new TradeEngine(buildModel(snap), { ...DEFAULT_SETTINGS, mode: "aggressive" }).suggest("user"))).not.toContain("uLB");
    expect(ids(new TradeEngine(buildModel(snap), { ...DEFAULT_SETTINGS, mode: "aggressive" }).suggest("user"))).not.toContain("oLB");
  });

  it("discounts IDP, kickers and defenses", () => {
    const snap = workedExample();
    snap.players["oLB"] = { id: "oLB", name: "LB", position: "LB", nflTeam: null, injuryStatus: null, weekly: [10] };
    const tvPlain = buildModel(snap).tv["oLB"];
    const tvMarket = buildModel({ ...snap, marketValue: { uWR17: 5000 } }).tv["oLB"];
    expect(tvMarket).toBeCloseTo(tvPlain / 2);
  });
});

describe("Super League keeper rules", () => {
  it("prices keepers by bracket", () => {
    expect(keeperCost({ amount: 1, drafted: true }, "RB")).toBe(10);
    expect(keeperCost({ amount: 5, drafted: true }, "RB")).toBe(10);
    expect(keeperCost({ amount: 8, drafted: true }, "WR")).toBe(13);
    expect(keeperCost({ amount: 30, drafted: true }, "QB")).toBe(45);
    expect(keeperCost({ amount: 30, drafted: true }, "LB")).toBe(30);
    expect(keeperCost({ amount: 0, drafted: false }, "WR")).toBe(10);
    expect(keeperCost({ amount: 12, drafted: false }, "DEF")).toBe(18);
    expect(keeperCost(undefined, "TE")).toBe(10);
  });

  it("gives slots by finish", () => {
    expect(keeperSlotsFor(SUPER_LEAGUE_RULES, 1).slots).toBe(3);
    expect(keeperSlotsFor(SUPER_LEAGUE_RULES, 4).slots).toBe(4);
    expect(keeperSlotsFor(SUPER_LEAGUE_RULES, 8).slots).toBe(3);
  });

  it("picks the best legal keeper set", () => {
    const players = [
      { id: "a", position: "RB" as const, ks: 40 },
      { id: "b", position: "RB" as const, ks: 30 },
      { id: "c", position: "WR" as const, ks: 20 },
      { id: "d", position: "QB" as const, ks: 10 },
      { id: "e", position: "TE" as const, ks: -5 },
    ];
    const first = keeperValue(players, 3, SUPER_LEAGUE_RULES.slotsByFinish[0].limits);
    expect(first.keepers).toEqual(["a", "c", "d"]);
    expect(first.value).toBe(70);
    const mid = keeperValue(players, 4, SUPER_LEAGUE_RULES.slotsByFinish[1].limits);
    expect(mid.keepers).toEqual(["a", "b", "c", "d"]);
  });

  it("shares the auction pool over replacement", () => {
    const dv = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`p${i}`, 100 - i * 5]));
    const av = auctionValues(dv, 2, 5, 100);
    const total = Object.values(av).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(200);
    expect(av.p0).toBeGreaterThan(av.p1);
    expect(av.p15).toBe(0);
  });
});
