// Tiny stand-in for api.sleeper.app, for working offline or in sandboxes
// where Sleeper is unreachable. Run it, then start the app with
// SLEEPER_API_BASE=http://localhost:4010/v1 npm run dev
import http from "node:http";

const user = { user_id: "1001", username: "demo", display_name: "Demo", avatar: null };
const league = {
  league_id: "9001",
  name: "Demo Dynasty League",
  season: "2026",
  sport: "nfl",
  status: "in_season",
  total_rosters: 2,
  avatar: null,
  previous_league_id: null,
  draft_id: null,
  roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SUPER_FLEX", "BN", "BN", "BN", "IR", "TAXI"],
  scoring_settings: { rec: 1, bonus_rec_te: 0.5, pass_td: 4, pass_yd: 0.04, rush_yd: 0.1, rec_yd: 0.1, rush_td: 6, rec_td: 6 },
  settings: { type: 2, num_teams: 2 },
};
const users = [
  { user_id: "1001", display_name: "Demo", avatar: null, metadata: { team_name: "Demo Bros" } },
  { user_id: "1002", display_name: "Rival", avatar: null },
];
const rosters = [
  { roster_id: 1, owner_id: "1001", league_id: "9001", players: ["4046", "9509", "6794", "5859", "4866", "SF", "11632"], starters: ["4046", "9509", "6794", "5859", "0", "0", "0", "0"], reserve: ["4866"], taxi: ["11632"], settings: { wins: 6, losses: 1, ties: 0, fpts: 1012, fpts_decimal: 44, fpts_against: 880 } },
  { roster_id: 2, owner_id: "1002", league_id: "9001", players: ["4881", "4034", "7564"], starters: ["4881", "4034", "7564"], reserve: null, taxi: null, settings: { wins: 3, losses: 4, ties: 0, fpts: 905, fpts_decimal: 2, fpts_against: 990 } },
];
const players = {
  4046: { player_id: "4046", full_name: "Patrick Mahomes", position: "QB", team: "KC", age: 31 },
  9509: { player_id: "9509", full_name: "Bijan Robinson", position: "RB", team: "ATL", age: 24 },
  6794: { player_id: "6794", full_name: "Justin Jefferson", position: "WR", team: "MIN", age: 27 },
  5859: { player_id: "5859", full_name: "A.J. Brown", position: "WR", team: "PHI", age: 29 },
  4866: { player_id: "4866", full_name: "Saquon Barkley", position: "RB", team: "PHI", age: 29, injury_status: "IR" },
  11632: { player_id: "11632", full_name: "Rookie Receiver", position: "WR", team: "NYJ", age: 21 },
  4881: { player_id: "4881", full_name: "Lamar Jackson", position: "QB", team: "BAL", age: 29 },
  4034: { player_id: "4034", full_name: "Christian McCaffrey", position: "RB", team: "SF", age: 30, injury_status: "Questionable" },
  7564: { player_id: "7564", full_name: "Ja'Marr Chase", position: "WR", team: "CIN", age: 26 },
  SF: { player_id: "SF", first_name: "San Francisco", last_name: "49ers", position: "DEF", team: "SF" },
};

const routes = {
  "/v1/state/nfl": { season: "2026", league_season: "2026", week: 8, season_type: "regular" },
  "/v1/user/demo": user,
  "/v1/user/1001": user,
  "/v1/user/1001/leagues/nfl/2026": [league],
  "/v1/league/9001": league,
  "/v1/league/9001/users": users,
  "/v1/league/9001/rosters": rosters,
  "/v1/players/nfl": players,
};

const port = Number(process.env.PORT ?? 4010);
http
  .createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    const body = path in routes ? routes[path] : path.match(/\/leagues\/nfl\/\d+$/) ? [] : null;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  })
  .listen(port, () => console.log(`Mock Sleeper API on http://localhost:${port}/v1 (try username "demo")`));
