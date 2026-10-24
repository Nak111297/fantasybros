import {
  averageLineup,
  leaguePositions,
  orderSlots,
  rosPpg,
  teamStrength,
  type Replacement,
} from "./lineup";
import type { EnginePlayer, EngineTeam, LeagueSnapshot, Position } from "./types";

/** Everything derived once per league sync, shared by the trade search. */
export interface LeagueModel {
  snap: LeagueSnapshot;
  orderedSlots: string[];
  positions: Set<Position>;
  repl: Replacement;
  ppg: Record<string, number>;
  /** Trade value TV(p) = VORP in ppg. */
  tv: Record<string, number>;
}

const REPLACEMENT_DEPTH = 3;

export function buildModel(snap: LeagueSnapshot): LeagueModel {
  const positions = leaguePositions(snap.slots);
  const ppg: Record<string, number> = {};
  for (const p of Object.values(snap.players)) ppg[p.id] = rosPpg(snap, p);

  // Replacement level: mean ROS ppg of the best few free agents at each position.
  const repl: Replacement = {};
  for (const pos of positions) {
    const best = snap.freeAgentIds
      .map((id) => snap.players[id])
      .filter((p): p is EnginePlayer => !!p && p.position === pos)
      .map((p) => ppg[p.id])
      .sort((a, b) => b - a)
      .slice(0, REPLACEMENT_DEPTH);
    repl[pos] = best.length ? best.reduce((a, b) => a + b, 0) / best.length : 0;
  }

  const tv: Record<string, number> = {};
  for (const p of Object.values(snap.players)) tv[p.id] = ppg[p.id] - (repl[p.position] ?? 0);

  return { snap, orderedSlots: orderSlots(snap.slots), positions, repl, ppg, tv };
}

export function rosterOf(model: LeagueModel, ids: string[]): EnginePlayer[] {
  return ids.map((id) => model.snap.players[id]).filter((p): p is EnginePlayer => !!p);
}

export function strength(model: LeagueModel, ids: string[]): number {
  return teamStrength(model.snap, rosterOf(model, ids), model.orderedSlots, model.repl);
}

export function lineupFor(model: LeagueModel, ids: string[]) {
  return averageLineup(
    model.snap.slots,
    rosterOf(model, ids).map((p) => ({ id: p.id, position: p.position, ppg: model.ppg[p.id] })),
    model.repl,
  );
}

export interface TeamProfile {
  team: EngineTeam;
  strength: number;
  /** Starter ppg contributed by each position, FLEX included. */
  starterPoints: Partial<Record<Position, number>>;
  /** z-score vs the league; positive = weak at that position. */
  need: Partial<Record<Position, number>>;
  /** Δrem(T, p) = S(T) − S(T without p), per player. */
  removalCost: Record<string, number>;
  /** TV(p) − Δrem(T, p): high = good trade chip. */
  surplus: Record<string, number>;
}

export function profileTeams(model: LeagueModel): TeamProfile[] {
  const profiles = model.snap.teams.map((team): TeamProfile => {
    const s = strength(model, team.playerIds);
    const starterPoints: Partial<Record<Position, number>> = {};
    for (const e of lineupFor(model, team.playerIds)) {
      if (!e.playerId) continue;
      const pos = model.snap.players[e.playerId].position;
      starterPoints[pos] = (starterPoints[pos] ?? 0) + e.ppg;
    }
    const removalCost: Record<string, number> = {};
    const surplus: Record<string, number> = {};
    for (const id of team.playerIds) {
      removalCost[id] = s - strength(model, team.playerIds.filter((x) => x !== id));
      surplus[id] = model.tv[id] - removalCost[id];
    }
    return { team, strength: s, starterPoints, need: {}, removalCost, surplus };
  });

  for (const pos of model.positions) {
    const vals = profiles.map((p) => p.starterPoints[pos] ?? 0);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
    profiles.forEach((p, i) => (p.need[pos] = (mean - vals[i]) / sd));
  }
  return profiles;
}
