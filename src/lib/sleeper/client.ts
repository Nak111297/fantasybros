import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperNflState,
  SleeperPlayerMap,
  SleeperRoster,
  SleeperUser,
} from "./types";

// Override with SLEEPER_API_BASE to point at a local mock while developing.
const BASE_URL = process.env.SLEEPER_API_BASE ?? "https://api.sleeper.app/v1";

export class SleeperNotFoundError extends Error {}

async function get<T>(path: string, revalidateSeconds = 300): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    next: { revalidate: revalidateSeconds },
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

// The full player dump is ~5MB, too big for Next's fetch cache, and Sleeper
// asks callers to pull it at most once a day. Keep it in memory instead.
const PLAYERS_TTL_MS = 24 * 60 * 60 * 1000;
let playersCache: { at: number; data: Promise<SleeperPlayerMap> } | null = null;

export function getAllPlayers(): Promise<SleeperPlayerMap> {
  if (playersCache && Date.now() - playersCache.at < PLAYERS_TTL_MS) {
    return playersCache.data;
  }
  const data = fetch(`${BASE_URL}/players/nfl`, { cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error(`Sleeper API ${res.status} for /players/nfl`);
    return res.json() as Promise<SleeperPlayerMap>;
  });
  playersCache = { at: Date.now(), data };
  data.catch(() => {
    playersCache = null;
  });
  return data;
}

export function avatarUrl(avatarId: string | null | undefined, thumb = true): string | null {
  if (!avatarId) return null;
  if (avatarId.startsWith("http")) return avatarId;
  return `https://sleepercdn.com/avatars/${thumb ? "thumbs/" : ""}${avatarId}`;
}
