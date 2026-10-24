import type { KeeperContext, KeeperLimit, KeeperRules, Position } from "./types";

/** Super League rules: 8 teams, $250 auction. */
export const SUPER_LEAGUE_RULES: KeeperRules = {
  auctionBudget: 250,
  slotsByFinish: [
    { from: 1, to: 1, slots: 3, limits: onePerPosition() },
    {
      from: 2,
      to: 6,
      slots: 4,
      limits: [
        { positions: ["QB", "RB"], max: 3 },
        { positions: ["WR"], max: 3 },
      ],
    },
    { from: 7, to: 99, slots: 3, limits: onePerPosition() },
  ],
};

function onePerPosition(): KeeperLimit[] {
  const all: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"];
  return all.map((p) => ({ positions: [p], max: 1 }));
}

const OFFENSE = new Set<Position>(["QB", "RB", "WR", "TE"]);

/** Next season's keeper cost from the acquisition price. */
export function keeperCost(
  price: { amount: number; drafted: boolean } | undefined,
  position: Position,
): number {
  const c = price?.amount ?? 0;
  if (c <= 5) return 10;
  if (price?.drafted) {
    if (c <= 10) return c + 5;
    return OFFENSE.has(position) ? Math.ceil(c * 1.5) : c;
  }
  if (c < 10) return c + 5;
  return Math.ceil(c * 1.5);
}

/**
 * Converts a dynasty value DV into next year's auction $ by sharing the
 * league's auction pool over replacement: the top N = teams × roster spots
 * players split (pool − N) by their DV above the Nth player, plus $1 each.
 */
export function auctionValues(
  dv: Record<string, number>,
  numTeams: number,
  rosterSpots: number,
  budget: number,
): Record<string, number> {
  const n = numTeams * rosterSpots;
  const ranked = Object.entries(dv).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, n);
  const repl = top.length ? top[top.length - 1][1] : 0;
  const totalOver = top.reduce((s, [, v]) => s + (v - repl), 0) || 1;
  const pool = numTeams * budget - n;
  const out: Record<string, number> = {};
  for (const [id, v] of ranked) out[id] = 0;
  for (const [id, v] of top) out[id] = 1 + ((v - repl) / totalOver) * pool;
  return out;
}

export function keeperSurplus(
  ctx: KeeperContext,
  playerId: string,
  position: Position,
): number {
  return (ctx.auctionValue[playerId] ?? 0) - keeperCost(ctx.price[playerId], position);
}

export function keeperSlotsFor(rules: KeeperRules, rank: number) {
  return (
    rules.slotsByFinish.find((r) => rank >= r.from && rank <= r.to) ??
    rules.slotsByFinish[rules.slotsByFinish.length - 1]
  );
}

/**
 * K(T): best total keeper surplus over legal keeper sets. The limits here are
 * position caps under a total cap, which form a matroid, so taking players in
 * descending surplus while they still fit is optimal.
 */
export function keeperValue(
  players: { id: string; position: Position; ks: number }[],
  slots: number,
  limits: KeeperLimit[],
): { value: number; keepers: string[] } {
  const counts = limits.map(() => 0);
  const keepers: string[] = [];
  let value = 0;
  for (const p of [...players].sort((a, b) => b.ks - a.ks)) {
    if (keepers.length >= slots || p.ks <= 0) break;
    const hit = limits.map((l, i) => (l.positions.includes(p.position) ? i : -1)).filter((i) => i >= 0);
    if (hit.some((i) => counts[i] >= limits[i].max)) continue;
    hit.forEach((i) => counts[i]++);
    keepers.push(p.id);
    value += p.ks;
  }
  return { value, keepers };
}
