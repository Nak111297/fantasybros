import type { EnginePlayer, LeagueSnapshot, Position } from "./types";

const SLOT_ELIGIBILITY: Record<string, Position[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  DL: ["DL"],
  LB: ["LB"],
  DB: ["DB"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  IDP_FLEX: ["DL", "LB", "DB"],
};

export function slotEligibility(slot: string): Position[] {
  return SLOT_ELIGIBILITY[slot] ?? [];
}

/** Starting slots that count, most restrictive first, so greedy filling is optimal. */
export function orderSlots(slots: string[]): string[] {
  return slots
    .filter((s) => slotEligibility(s).length > 0)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => slotEligibility(a.s).length - slotEligibility(b.s).length || a.i - b.i)
    .map(({ s }) => s);
}

export function leaguePositions(slots: string[]): Set<Position> {
  return new Set(slots.flatMap(slotEligibility));
}

export type Replacement = Partial<Record<Position, number>>;

function slotReplacement(slot: string, repl: Replacement): number {
  return Math.max(0, ...slotEligibility(slot).map((p) => repl[p] ?? 0));
}

/** Best legal lineup points for one week. Empty slots score at replacement level. */
function solveWeek(
  roster: EnginePlayer[],
  week: number,
  orderedSlots: string[],
  repl: Replacement,
): number {
  const sorted = roster
    .filter((p) => p.weekly[week] > 0)
    .sort((a, b) => b.weekly[week] - a.weekly[week]);
  const used = new Array<boolean>(sorted.length).fill(false);
  let total = 0;
  for (const slot of orderedSlots) {
    const elig = SLOT_ELIGIBILITY[slot];
    let picked = -1;
    for (let i = 0; i < sorted.length; i++) {
      if (!used[i] && elig.includes(sorted[i].position)) {
        picked = i;
        break;
      }
    }
    if (picked >= 0) {
      used[picked] = true;
      total += sorted[picked].weekly[week];
    } else {
      total += slotReplacement(slot, repl);
    }
  }
  return total;
}

/** S(T): weighted average weekly points of the best legal lineup over the remaining weeks. */
export function teamStrength(
  snap: Pick<LeagueSnapshot, "weekWeights">,
  roster: EnginePlayer[],
  orderedSlots: string[],
  repl: Replacement,
): number {
  let sum = 0;
  let weights = 0;
  snap.weekWeights.forEach((w, i) => {
    sum += w * solveWeek(roster, i, orderedSlots, repl);
    weights += w;
  });
  return weights ? sum / weights : 0;
}

/** Weighted rest-of-season points per game for one player. */
export function rosPpg(snap: Pick<LeagueSnapshot, "weekWeights">, p: EnginePlayer): number {
  let sum = 0;
  let weights = 0;
  snap.weekWeights.forEach((w, i) => {
    sum += w * (p.weekly[i] ?? 0);
    weights += w;
  });
  return weights ? sum / weights : 0;
}

export interface LineupEntry {
  label: string;
  slot: string;
  playerId: string | null;
  ppg: number;
}

/**
 * The typical lineup using ROS ppg, with labels like "RB2" for explanations.
 * Positional slots are labelled by the player's position rank among starters.
 */
export function averageLineup(
  slots: string[],
  roster: { id: string; position: Position; ppg: number }[],
  repl: Replacement,
): LineupEntry[] {
  const sorted = [...roster].sort((a, b) => b.ppg - a.ppg);
  const used = new Set<string>();
  const entries: LineupEntry[] = [];
  for (const slot of orderSlots(slots)) {
    const elig = slotEligibility(slot);
    const p = sorted.find((x) => !used.has(x.id) && elig.includes(x.position));
    if (p) used.add(p.id);
    entries.push({ label: slot, slot, playerId: p?.id ?? null, ppg: p?.ppg ?? slotReplacement(slot, repl) });
  }
  const counters: Record<string, number> = {};
  const total: Record<string, number> = {};
  for (const e of entries) total[e.slot] = (total[e.slot] ?? 0) + 1;
  for (const e of entries.sort((a, b) => b.ppg - a.ppg)) {
    counters[e.slot] = (counters[e.slot] ?? 0) + 1;
    if (total[e.slot] > 1) e.label = `${e.slot}${counters[e.slot]}`;
  }
  return entries;
}
