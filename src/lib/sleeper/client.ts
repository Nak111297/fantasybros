import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperNflState,
  SleeperPlayerMap,
  SleeperRoster,
  SleeperUser,
  SleeperDraftPick,
  SleeperTransaction,
  SleeperProjection,
} from "./types";

// Override with SLEEPER_API_BASE to point at a local mock while developing.
const BASE_URL = process.env.SLEEPER_API_BASE ?? "https://api.sleeper.app/v1";

export class SleeperNotFoundError extends Error {}

async function get<T>(path: string, revalidateSeconds = 300): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    next: { revalidate: revalidateSeconds },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Sleeper API ${res.status} for ${path}`);
  }
  // Sleeper answers 200 with a `null` body for unknown users and leagues.
  const body = (await res.json()) as T | null;
  if (body === null) {
    throw new SleeperNotFoundError(`Not found: ${path}`);
  }
  return body;
}

export function getNflState(): Promise<SleeperNflState> {
  return get("/state/nfl", 3600);
}

export function getUser(usernameOrId: string): Promise<SleeperUser> {
  return get(`/user/${encodeURIComponent(usernameOrId)}`, 3600);
}

export function getUserLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
  return get(`/user/${userId}/leagues/nfl/${season}`);
}

export function getLeague(leagueId: string): Promise<SleeperLeague> {
  return get(`/league/${leagueId}`);
}

export function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
  return get(`/league/${leagueId}/rosters`);
}

export function getLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]> {
  return get(`/league/${leagueId}/users`);
}

/** In-memory cache for responses too big for Next's 2MB fetch cache. */
export function memoFetch<T>(ttlMs: number) {
  const cache = new Map<string, { at: number; data: Promise<T> }>();
  return (url: string): Promise<T> => {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < ttlMs) return hit.data;
    const data = fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) }).then((res) => {
      if (!res.ok) throw new Error(`${res.status} for ${url}`);
      return res.json() as Promise<T>;
    });
    cache.set(url, { at: Date.now(), data });
    data.catch(() => cache.delete(url));
    return data;
  };
}

// The full player dump is ~5MB and Sleeper asks callers to pull it at most
// once a day.
const fetchPlayers = memoFetch<SleeperPlayerMap>(24 * 60 * 60 * 1000);

export function getAllPlayers(): Promise<SleeperPlayerMap> {
  return fetchPlayers(`${BASE_URL}/players/nfl`);
}

export function getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
  return get(`/draft/${draftId}/picks`, 3600);
}

export function getTransactions(leagueId: string, week: number): Promise<SleeperTransaction[]> {
  return get(`/league/${leagueId}/transactions/${week}`, 900);
}

// Weekly projections live outside /v1 and are undocumented. One call per week
// covers every position; responses are ~1MB, so cache them in memory.
const PROJECTIONS_BASE = process.env.SLEEPER_PROJECTIONS_BASE ?? "https://api.sleeper.com";
const PROJECTION_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"];
const fetchProjections = memoFetch<SleeperProjection[]>(3 * 60 * 60 * 1000);

export function getWeekProjections(season: string, week: number): Promise<SleeperProjection[]> {
  const pos = PROJECTION_POSITIONS.map((p) => `position[]=${p}`).join("&");
  return fetchProjections(`${PROJECTIONS_BASE}/projections/nfl/${season}/${week}?season_type=regular&${pos}`);
}

export function avatarUrl(avatarId: string | null | undefined, thumb = true): string | null {
  if (!avatarId) return null;
  if (avatarId.startsWith("http")) return avatarId;
  return `https://sleepercdn.com/avatars/${thumb ? "thumbs/" : ""}${avatarId}`;
}
