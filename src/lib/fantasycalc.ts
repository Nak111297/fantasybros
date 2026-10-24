import { memoFetch } from "./sleeper/client";

// FantasyCalc market values (https://fantasycalc.com). Terms: cache each
// parameter set for at least 3 hours and show attribution wherever the values
// are used. Commercial use needs written permission.
const BASE = process.env.FANTASYCALC_API_BASE ?? "https://api.fantasycalc.com";

interface FantasyCalcRow {
  player: { sleeperId?: string | null; name: string; position: string };
  value: number;
}

const fetchValues = memoFetch<FantasyCalcRow[]>(3 * 60 * 60 * 1000);

export interface MarketParams {
  dynasty: boolean;
  numQbs: 1 | 2;
  numTeams: number;
  ppr: number;
}

/** Market value keyed by Sleeper player id. */
export async function getMarketValues(p: MarketParams): Promise<Record<string, number>> {
  const numTeams = Math.min(14, Math.max(8, p.numTeams));
  const ppr = p.ppr >= 0.75 ? 1 : p.ppr >= 0.25 ? 0.5 : 0;
  const rows = await fetchValues(
    `${BASE}/values/current?isDynasty=${p.dynasty}&numQbs=${p.numQbs}&numTeams=${numTeams}&ppr=${ppr}`,
  );
  const out: Record<string, number> = {};
  for (const r of rows) if (r.player.sleeperId) out[r.player.sleeperId] = r.value;
  return out;
}

export const FANTASYCALC_ATTRIBUTION = { label: "Values from FantasyCalc", href: "https://fantasycalc.com" };
