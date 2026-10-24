import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperPlayer,
  SleeperPlayerMap,
  SleeperRoster,
} from "./types";

export type LeagueType = "redraft" | "keeper" | "dynasty";

export function leagueType(league: Pick<SleeperLeague, "settings">): LeagueType {
  switch (league.settings?.type) {
    case 2:
      return "dynasty";
    case 1:
      return "keeper";
    default:
      return "redraft";
  }
}

const NON_STARTING_SLOTS = new Set(["BN", "IR", "TAXI"]);
const IDP_POSITIONS = new Set(["DL", "LB", "DB", "DE", "DT", "CB", "S", "IDP_FLEX"]);

export interface ScoringSummary {
  /** e.g. "PPR", "Half PPR", "Standard", "0.75 PPR" */
  format: string;
  pointsPerReception: number;
  /** Extra points per reception for TEs (0 when none). */
  tePremium: number;
  passTd: number;
  /** Points per passing yard, e.g. 0.04 = 1 pt per 25 yds. */
  passYd: number;
  superflex: boolean;
  idp: boolean;
  starterSlots: string[];
  benchSlots: number;
}

export function summarizeScoring(
  league: Pick<SleeperLeague, "scoring_settings" | "roster_positions">,
): ScoringSummary {
  const s = league.scoring_settings ?? {};
  const ppr = s.rec ?? 0;
  const positions = league.roster_positions ?? [];
  const starterSlots = positions.filter((p) => !NON_STARTING_SLOTS.has(p));

  let format: string;
  if (ppr === 1) format = "PPR";
  else if (ppr === 0.5) format = "Half PPR";
  else if (ppr === 0) format = "Standard";
  else format = `${ppr} PPR`;

  return {
    format,
    pointsPerReception: ppr,
    tePremium: s.bonus_rec_te ?? 0,
    passTd: s.pass_td ?? 4,
    passYd: s.pass_yd ?? 0.04,
    superflex: starterSlots.includes("SUPER_FLEX") || starterSlots.filter((p) => p === "QB").length > 1,
    idp: starterSlots.some((p) => IDP_POSITIONS.has(p)),
    starterSlots,
    benchSlots: positions.filter((p) => p === "BN").length,
  };
}

export interface RosterPlayer {
  id: string;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  injuryStatus: string | null;
}

export interface Team {
  rosterId: number;
  ownerId: string | null;
  ownerName: string;
  teamName: string;
  avatar: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  starters: RosterPlayer[];
  bench: RosterPlayer[];
  reserve: RosterPlayer[];
  taxi: RosterPlayer[];
}

export function resolvePlayer(id: string, players: SleeperPlayerMap): RosterPlayer {
  const p: SleeperPlayer | undefined = players[id];
  if (!p) {
    // Team defenses are keyed by team abbreviation and may be missing from the dump.
    const isDef = /^[A-Z]{2,3}$/.test(id);
    return { id, name: isDef ? `${id} D/ST` : `Unknown (${id})`, position: isDef ? "DEF" : "?", team: isDef ? id : null, age: null, injuryStatus: null };
  }
  const name =
    p.full_name ??
    ([p.first_name, p.last_name].filter(Boolean).join(" ") || id);
  return {
    id,
    name: p.position === "DEF" ? `${name} D/ST` : name,
    position: p.position ?? p.fantasy_positions?.[0] ?? "?",
    team: p.team ?? null,
    age: p.age ?? null,
    injuryStatus: p.injury_status ?? null,
  };
}

function points(whole?: number, decimal?: number): number {
  return (whole ?? 0) + (decimal ?? 0) / 100;
}

export function buildTeams(
  rosters: SleeperRoster[],
  users: SleeperLeagueUser[],
  players: SleeperPlayerMap,
): Team[] {
  const usersById = new Map(users.map((u) => [u.user_id, u]));

  const teams = rosters.map((r): Team => {
    const owner = r.owner_id ? usersById.get(r.owner_id) : undefined;
    // Sleeper uses "0" as an empty starting slot.
    const starterIds = (r.starters ?? []).filter((id) => id && id !== "0");
    const reserveIds = r.reserve ?? [];
    const taxiIds = r.taxi ?? [];
    const placed = new Set([...starterIds, ...reserveIds, ...taxiIds]);
    const benchIds = (r.players ?? []).filter((id) => !placed.has(id));
    const resolve = (ids: string[]) => ids.map((id) => resolvePlayer(id, players));

    const ownerName = owner?.display_name ?? "Orphaned team";
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      ownerName,
      teamName: owner?.metadata?.team_name || ownerName,
      avatar: owner?.metadata?.avatar ?? owner?.avatar ?? null,
      wins: r.settings?.wins ?? 0,
      losses: r.settings?.losses ?? 0,
      ties: r.settings?.ties ?? 0,
      pointsFor: points(r.settings?.fpts, r.settings?.fpts_decimal),
      pointsAgainst: points(r.settings?.fpts_against, r.settings?.fpts_against_decimal),
      starters: resolve(starterIds),
      bench: resolve(benchIds),
      reserve: resolve(reserveIds),
      taxi: resolve(taxiIds),
    };
  });

  return teams.sort(
    (a, b) =>
      b.wins + b.ties / 2 - (a.wins + a.ties / 2) || b.pointsFor - a.pointsFor,
  );
}

export function findUserTeam(teams: Team[], userId: string, rosters: SleeperRoster[]): Team | undefined {
  const roster = rosters.find(
    (r) => r.owner_id === userId || (r.co_owners ?? []).includes(userId),
  );
  return roster ? teams.find((t) => t.rosterId === roster.roster_id) : undefined;
}

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"];

export function positionCounts(team: Team): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of [...team.starters, ...team.bench, ...team.reserve, ...team.taxi]) {
    counts[p.position] = (counts[p.position] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(
      ([a], [b]) => (POSITION_ORDER.indexOf(a) + 1 || 99) - (POSITION_ORDER.indexOf(b) + 1 || 99),
    ),
  );
}
