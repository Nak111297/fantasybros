import { auctionValues, SUPER_LEAGUE_RULES } from "@/lib/engine/keeper";
import { scoreStats } from "@/lib/engine/scoring";
import type { EnginePlayer, EngineTeam, KeeperContext, LeagueSnapshot, Position } from "@/lib/engine/types";
import { leaguePositions } from "@/lib/engine/lineup";
import { buildModel } from "@/lib/engine/valuation";
import { getMarketValues } from "@/lib/fantasycalc";
import {
  getAllPlayers,
  getDraftPicks,
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getNflState,
  getTransactions,
  getWeekProjections,
} from "./client";
import { buildTeams, leagueType, summarizeScoring } from "./league";
import type {
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperPlayer,
  SleeperPlayerMap,
  SleeperProjection,
  SleeperRoster,
  SleeperTransaction,
} from "./types";

const POSITION_ALIASES: Record<string, Position> = {
  DE: "DL",
  DT: "DL",
  NT: "DL",
  OLB: "LB",
  ILB: "LB",
  MLB: "LB",
  CB: "DB",
  S: "DB",
  SS: "DB",
  FS: "DB",
};

export function enginePosition(p: SleeperPlayer | undefined, allowed: Set<Position>): Position | null {
  if (!p) return null;
  const candidates = [p.position, ...(p.fantasy_positions ?? [])].filter(Boolean) as string[];
  for (const c of candidates) {
    const pos = (POSITION_ALIASES[c] ?? c) as Position;
    if (allowed.has(pos)) return pos;
  }
  return null;
}

/** Remaining weeks, from the current week through the last fantasy playoff week. */
export function remainingWeeks(league: SleeperLeague, currentWeek: number) {
  const s = league.settings ?? {};
  const playoffStart = s.playoff_week_start || 0;
  let lastWeek = 17;
  if (playoffStart) {
    const rounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, s.playoff_teams ?? 6))));
    const roundType = s.playoff_round_type ?? 0;
    const playoffWeeks = roundType === 2 ? rounds * 2 : roundType === 1 ? rounds + 1 : rounds;
    lastWeek = Math.min(18, playoffStart + playoffWeeks - 1);
  }
  const weeks: number[] = [];
  for (let w = Math.max(1, currentWeek); w <= lastWeek; w++) weeks.push(w);
  const weekWeights = weeks.map((w) => (playoffStart && w >= playoffStart ? 1.5 : 1));
  const regularWeeksLeft = playoffStart ? Math.max(0, playoffStart - Math.max(1, currentWeek)) : weeks.length;
  return { weeks, weekWeights, regularWeeksLeft };
}

const OUT = new Set(["Out", "IR", "PUP", "Sus", "NA", "COV", "DNR"]);

/** Availability factor a(p, w): injuries only affect the current week, longer absences the next four. */
export function availability(injuryStatus: string | null | undefined, weekIndex: number): number {
  if (!injuryStatus) return 1;
  const long = ["IR", "PUP", "Sus", "NA"].includes(injuryStatus);
  if (long) return weekIndex < 4 ? 0 : 1;
  if (weekIndex > 0) return 1;
  if (OUT.has(injuryStatus)) return 0;
  if (injuryStatus === "Doubtful") return 0.25;
  if (injuryStatus === "Questionable") return 0.75;
  return 1;
}

/** Acquisition prices: draft price wins; undrafted players cost their latest waiver bid. */
export function acquisitionPrices(
  picks: SleeperDraftPick[],
  transactions: SleeperTransaction[],
): KeeperContext["price"] {
  const price: KeeperContext["price"] = {};
  const ordered = [...transactions].sort((a, b) => (a.status_updated ?? a.created ?? 0) - (b.status_updated ?? b.created ?? 0));
  for (const t of ordered) {
    if (t.status !== "complete" || t.type === "trade" || !t.adds) continue;
    for (const id of Object.keys(t.adds)) price[id] = { amount: t.settings?.waiver_bid ?? 0, drafted: false };
  }
  for (const p of picks) {
    price[p.player_id] = { amount: Number(p.metadata?.amount ?? 0) || 0, drafted: true };
  }
  return price;
}

export interface SleeperLeagueData {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  players: SleeperPlayerMap;
  currentWeek: number;
  /** Projections per remaining week, same order as the weeks list. */
  projections: SleeperProjection[][];
  userId?: string;
  keeper?: {
    picks: SleeperDraftPick[];
    transactions: SleeperTransaction[];
    marketValues: Record<string, number> | null;
  };
}

/** Pure conversion from Sleeper responses to the engine's snapshot. */
export function buildSnapshot(data: SleeperLeagueData): LeagueSnapshot {
  const { league, rosters, users, players, currentWeek } = data;
  const { weeks, weekWeights, regularWeeksLeft } = remainingWeeks(league, currentWeek);
  const slots = league.roster_positions.filter((s) => s !== "BN" && s !== "IR" && s !== "TAXI");
  const allowed = leaguePositions(slots);
  const rules = league.scoring_settings ?? {};

  const projById = data.projections.map((week) => new Map(week.filter((p) => p?.stats).map((p) => [p.player_id, p.stats])));

  const enginePlayers: Record<string, EnginePlayer> = {};
  const toEngine = (id: string): EnginePlayer | null => {
    if (enginePlayers[id]) return enginePlayers[id];
    const sp = players[id];
    const isTeamDef = !sp && /^[A-Z]{2,3}$/.test(id);
    const position = isTeamDef ? "DEF" : enginePosition(sp, allowed);
    if (!position) return null;
    const injury = sp?.injury_status ?? null;
    const weekly = weeks.map((_, i) => {
      const stats = projById[i]?.get(id);
      return stats ? scoreStats(stats, rules, position) * availability(injury, i) : 0;
    });
    const name = sp?.full_name ?? ([sp?.first_name, sp?.last_name].filter(Boolean).join(" ") || id);
    return (enginePlayers[id] = {
      id,
      name: position === "DEF" ? `${name} D/ST` : name,
      position,
      nflTeam: sp?.team ?? (isTeamDef ? id : null),
      injuryStatus: injury,
      weekly,
    });
  };

  const named = buildTeams(rosters, users, players);
  const rostered = new Set<string>();
  const teams: EngineTeam[] = rosters.map((r) => {
    const ir = new Set([...(r.reserve ?? []), ...(r.taxi ?? [])]);
    const all = r.players ?? [];
    all.forEach((id) => rostered.add(id));
    const view = named.find((t) => t.rosterId === r.roster_id)!;
    return {
      id: String(r.roster_id),
      name: view.teamName,
      ownerName: view.ownerName,
      isUser: !!data.userId && (r.owner_id === data.userId || (r.co_owners ?? []).includes(data.userId)),
      wins: view.wins,
      losses: view.losses,
      ties: view.ties,
      pointsFor: view.pointsFor,
      playerIds: all.filter((id) => !ir.has(id) && toEngine(id)),
      irPlayerIds: [...ir].filter((id) => toEngine(id)),
    };
  });

  // Free agents: unrostered players at league positions with any projection.
  const freeAgentIds: string[] = [];
  const projected = new Set(data.projections.flatMap((w) => w.map((p) => p.player_id)));
  for (const id of projected) {
    if (rostered.has(id)) continue;
    const sp = players[id];
    if (sp && !sp.team) continue;
    const p = toEngine(id);
    if (p && p.weekly.some((x) => x > 0)) freeAgentIds.push(id);
  }

  const s = league.settings ?? {};
  const deadline = s.trade_deadline ?? 99;
  const snap: LeagueSnapshot = {
    id: league.league_id,
    name: league.name,
    season: league.season,
    currentWeek,
    weeks,
    weekWeights,
    slots,
    rosterMax: league.roster_positions.filter((p) => p !== "IR" && p !== "TAXI").length,
    numTeams: league.total_rosters,
    regularWeeksLeft,
    tradeDeadlinePassed: deadline > 0 && deadline < 99 && currentWeek > deadline,
    teams,
    players: enginePlayers,
    freeAgentIds,
  };

  if (data.keeper) snap.keeper = keeperContext(snap, league, data.keeper);
  return snap;
}

/**
 * Next-season auction values: dynasty market value for offense, this season's
 * VORP (converted at the same $ per point) for IDP, K and DEF, which have no
 * market. Without market values, VORP drives everything.
 */
function keeperContext(
  snap: LeagueSnapshot,
  league: SleeperLeague,
  k: NonNullable<SleeperLeagueData["keeper"]>,
): KeeperContext {
  const rules = { ...SUPER_LEAGUE_RULES, auctionBudget: league.settings?.waiver_budget && league.settings.waiver_budget >= 100 ? league.settings.waiver_budget : SUPER_LEAGUE_RULES.auctionBudget };
  const model = buildModel(snap);
  const ids = Object.keys(snap.players);
  const offense = (id: string) => ["QB", "RB", "WR", "TE"].includes(snap.players[id].position);
  const market = k.marketValues;
  const vorp = (id: string) => Math.max(0, model.tv[id]);

  let dv: Record<string, number>;
  if (market) {
    // Put VORP on the market scale using the offensive players that have both.
    const both = ids.filter((id) => offense(id) && market[id] && vorp(id) > 0);
    const scale =
      both.length > 0
        ? both.reduce((s, id) => s + market[id], 0) / both.reduce((s, id) => s + vorp(id), 0)
        : 0;
    dv = Object.fromEntries(ids.map((id) => [id, offense(id) ? market[id] ?? 0 : vorp(id) * scale]));
  } else {
    dv = Object.fromEntries(ids.map((id) => [id, vorp(id)]));
  }

  return {
    rules,
    price: acquisitionPrices(k.picks, k.transactions),
    auctionValue: auctionValues(dv, snap.numTeams, snap.rosterMax, rules.auctionBudget),
    rosterSpots: snap.rosterMax,
  };
}

/** Fetch everything the engine needs for one Sleeper league. */
export async function loadSleeperSnapshot(leagueId: string, userId?: string): Promise<LeagueSnapshot> {
  const [league, rosters, users, players, state] = await Promise.all([
    getLeague(leagueId),
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
    getAllPlayers(),
    getNflState(),
  ]);
  const currentWeek = league.season === state.season ? Math.max(1, state.week) : 1;
  const { weeks } = remainingWeeks(league, currentWeek);
  const projections = await Promise.all(
    weeks.map((w) => getWeekProjections(league.season, w).catch(() => [] as SleeperProjection[])),
  );

  let keeper: SleeperLeagueData["keeper"];
  if (leagueType(league) === "keeper") {
    const scoring = summarizeScoring(league);
    const [picks, transactions, marketValues] = await Promise.all([
      league.draft_id ? getDraftPicks(league.draft_id).catch(() => []) : Promise.resolve([]),
      Promise.all(
        Array.from({ length: Math.max(1, currentWeek) }, (_, i) => getTransactions(leagueId, i + 1).catch(() => [])),
      ).then((w) => w.flat()),
      getMarketValues({
        dynasty: true,
        numQbs: scoring.superflex ? 2 : 1,
        numTeams: league.total_rosters,
        ppr: scoring.pointsPerReception,
      }).catch(() => null),
    ]);
    keeper = { picks, transactions, marketValues };
  }

  return buildSnapshot({ league, rosters, users, players, currentWeek, projections, userId, keeper });
}
