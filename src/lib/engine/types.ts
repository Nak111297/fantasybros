// Platform-neutral snapshot of one league. Adapters (Sleeper now, ESPN later)
// build it; everything the engine reads lives here, so runs are reproducible
// and testable offline.

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF" | "DL" | "LB" | "DB";

export interface EnginePlayer {
  id: string;
  name: string;
  position: Position;
  nflTeam: string | null;
  injuryStatus: string | null;
  /** League points per remaining week (already scored with this league's rules
   * and multiplied by availability). Same length as LeagueSnapshot.weeks. */
  weekly: number[];
}

export interface EngineTeam {
  id: string;
  name: string;
  ownerName: string;
  isUser: boolean;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  /** Active roster, excluding IR. */
  playerIds: string[];
  irPlayerIds: string[];
}

export interface KeeperRules {
  /** Keeper slots by final standing (1-based ranks, inclusive). */
  slotsByFinish: { from: number; to: number; slots: number; limits: KeeperLimit[] }[];
  auctionBudget: number;
}

/** At most `max` keepers whose position is in `positions`. */
export interface KeeperLimit {
  positions: Position[];
  max: number;
}

export interface KeeperContext {
  rules: KeeperRules;
  /** Acquisition price (auction $) per player id. Missing = undrafted, $0 pickup. */
  price: Record<string, { amount: number; drafted: boolean }>;
  /** Next season auction value in $ per player id. */
  auctionValue: Record<string, number>;
  /** Roster spots per team, for the auction pool. */
  rosterSpots: number;
}

export interface LeagueSnapshot {
  id: string;
  name: string;
  season: string;
  currentWeek: number;
  /** Remaining NFL weeks through the last fantasy playoff week. */
  weeks: number[];
  /** ω_w per entry of `weeks`. */
  weekWeights: number[];
  /** Starting slots, e.g. ["QB","RB","RB","WR","WR","TE","FLEX","SUPER_FLEX"]. */
  slots: string[];
  /** Max active roster size (starters + bench, excluding IR/taxi). */
  rosterMax: number;
  numTeams: number;
  /** Weeks left in the regular season (for projected standings). */
  regularWeeksLeft: number;
  tradeDeadlinePassed: boolean;
  teams: EngineTeam[];
  players: Record<string, EnginePlayer>;
  freeAgentIds: string[];
  keeper?: KeeperContext;
}
