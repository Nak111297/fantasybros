// Shapes returned by the public Sleeper API (https://docs.sleeper.com).
// Only the fields this app uses are typed; Sleeper returns more.

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  is_owner?: boolean | null;
  metadata?: { team_name?: string; avatar?: string } | null;
}

/** settings.type: 0 = redraft, 1 = keeper, 2 = dynasty */
export interface SleeperLeagueSettings {
  type?: number;
  num_teams?: number;
  playoff_teams?: number;
  playoff_week_start?: number;
  trade_deadline?: number;
  waiver_type?: number;
  waiver_budget?: number;
  taxi_slots?: number;
  reserve_slots?: number;
  best_ball?: number;
  [key: string]: number | undefined;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  sport: string;
  status: "pre_draft" | "drafting" | "in_season" | "complete" | string;
  total_rosters: number;
  avatar: string | null;
  previous_league_id: string | null;
  draft_id: string | null;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: SleeperLeagueSettings;
}

export interface SleeperRosterSettings {
  wins?: number;
  losses?: number;
  ties?: number;
  fpts?: number;
  fpts_decimal?: number;
  fpts_against?: number;
  fpts_against_decimal?: number;
  waiver_budget_used?: number;
  [key: string]: number | undefined;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners?: string[] | null;
  league_id: string;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
  settings: SleeperRosterSettings;
}

export interface SleeperPlayer {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string | null;
  fantasy_positions?: string[] | null;
  team?: string | null;
  age?: number | null;
  years_exp?: number | null;
  injury_status?: string | null;
  status?: string | null;
}

export type SleeperPlayerMap = Record<string, SleeperPlayer>;

export interface SleeperNflState {
  season: string;
  league_season: string;
  week: number;
  season_type: string;
}

export interface SleeperDraftPick {
  player_id: string;
  picked_by: string;
  roster_id: number | string;
  is_keeper?: boolean | null;
  metadata?: { amount?: string; position?: string } | null;
}

export interface SleeperTransaction {
  type: "trade" | "waiver" | "free_agent" | "commissioner" | string;
  status: string;
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  settings?: { waiver_bid?: number } | null;
  status_updated?: number;
  created?: number;
}

export interface SleeperProjection {
  player_id: string;
  week?: number;
  stats: Record<string, number>;
}
