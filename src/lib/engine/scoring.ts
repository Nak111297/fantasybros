import type { Position } from "./types";

export type StatLine = Record<string, number>;

const POSITION_REC_BONUS: Record<string, Position> = {
  bonus_rec_te: "TE",
  bonus_rec_rb: "RB",
  bonus_rec_wr: "WR",
};

// Sleeper scores team defense points/yards allowed in brackets; a projection
// gives one expected number, so score the bracket it falls in.
const PTS_ALLOW: [number, string][] = [
  [0, "pts_allow_0"],
  [6, "pts_allow_1_6"],
  [13, "pts_allow_7_13"],
  [20, "pts_allow_14_20"],
  [27, "pts_allow_21_27"],
  [34, "pts_allow_28_34"],
  [Infinity, "pts_allow_35p"],
];
const YDS_ALLOW: [number, string][] = [
  [99, "yds_allow_0_100"],
  [199, "yds_allow_100_199"],
  [299, "yds_allow_200_299"],
  [349, "yds_allow_300_349"],
  [399, "yds_allow_350_399"],
  [449, "yds_allow_400_449"],
  [499, "yds_allow_450_499"],
  [549, "yds_allow_500_549"],
  [Infinity, "yds_allow_550p"],
];

function bracket(value: number, table: [number, string][]): string {
  const v = Math.round(value);
  return table.find(([max]) => v <= max)![1];
}

/**
 * League points for a projected stat line. Projections are stored as raw
 * stats so each league converts them with its own rules (PPR, TE premium,
 * 4 vs 6 point passing TDs, bonuses, IDP).
 */
export function scoreStats(stats: StatLine, rules: Record<string, number>, position: Position): number {
  let pts = 0;
  for (const [key, mult] of Object.entries(rules)) {
    if (!mult) continue;
    const bonusPos = POSITION_REC_BONUS[key];
    if (bonusPos) {
      if (position === bonusPos) pts += (stats.rec ?? 0) * mult;
      continue;
    }
    if (key.startsWith("pts_allow_") || key.startsWith("yds_allow_")) continue;
    const v = stats[key];
    if (typeof v === "number") pts += v * mult;
  }
  if (position === "DEF") {
    if (typeof stats.pts_allow === "number") pts += rules[bracket(stats.pts_allow, PTS_ALLOW)] ?? 0;
    if (typeof stats.yds_allow === "number") pts += rules[bracket(stats.yds_allow, YDS_ALLOW)] ?? 0;
  }
  return pts;
}
