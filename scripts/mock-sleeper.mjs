// Stand-in for the Sleeper and FantasyCalc APIs, for working offline or in
// sandboxes that can't reach them. Data is synthetic but shaped like the real
// responses. Run it, then start the app with
//   SLEEPER_API_BASE=http://localhost:4010/v1 \
//   SLEEPER_PROJECTIONS_BASE=http://localhost:4010 \
//   FANTASYCALC_API_BASE=http://localhost:4010 npm run dev
// and search for username "demo".
import http from "node:http";

const SEASON = "2026";
const WEEK = 8;
const NFL = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"];
const bye = Object.fromEntries(NFL.map((t, i) => [t, 5 + (i % 10)]));

// Deterministic pseudo-random numbers so every run looks the same.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const COUNTS = { QB: 40, RB: 90, WR: 120, TE: 50, K: 32, DEF: 32, DL: 60, LB: 60, DB: 60 };
const players = {};
const statsFor = {};
let nextId = 1000;
for (const [pos, n] of Object.entries(COUNTS)) {
  for (let i = 0; i < n; i++) {
    const team = NFL[(i * 7 + pos.length) % NFL.length];
    const id = pos === "DEF" ? team : String(nextId++);
    if (pos === "DEF" && players[id]) continue;
    const quality = Math.pow(1 - i / n, 1.6) * (0.85 + rand() * 0.3);
    const injury = rand() < 0.05 ? "Questionable" : rand() < 0.02 ? "IR" : null;
    players[id] = {
      player_id: id,
      full_name: pos === "DEF" ? undefined : `${pos} Player ${i + 1}`,
      first_name: pos === "DEF" ? team : undefined,
      last_name: pos === "DEF" ? "Defense" : undefined,
      position: pos,
      fantasy_positions: [pos],
      team,
      age: 21 + Math.floor(rand() * 12),
      injury_status: injury,
      status: "Active",
    };
    const s = {
      QB: { pass_yd: 140 + 160 * quality, pass_td: 0.6 + 1.6 * quality, pass_int: 0.8, rush_yd: 5 + 25 * quality, rush_td: 0.1 + 0.2 * quality },
      RB: { rush_yd: 15 + 85 * quality, rush_td: 0.1 + 0.7 * quality, rec: 0.5 + 4 * quality, rec_yd: 4 + 30 * quality, rec_td: 0.05 + 0.15 * quality, fum_lost: 0.05 },
      WR: { rec: 1 + 6 * quality, rec_yd: 12 + 80 * quality, rec_td: 0.08 + 0.55 * quality, rush_yd: 1 },
      TE: { rec: 1 + 5 * quality, rec_yd: 8 + 60 * quality, rec_td: 0.05 + 0.45 * quality },
      K: { fgm_30_39: 0.6 + 0.6 * quality, fgm_40_49: 0.4 + 0.5 * quality, fgm_50p: 0.1 + 0.3 * quality, xpm: 1.5 + 1.5 * quality },
      DEF: { sack: 1.5 + 2 * quality, int: 0.5 + 0.7 * quality, fum_rec: 0.4 + 0.4 * quality, def_td: 0.1 + 0.15 * quality, pts_allow: 28 - 12 * quality },
      DL: { idp_tkl_solo: 1.5 + 2.5 * quality, idp_tkl_ast: 1 + 1.5 * quality, idp_sack: 0.2 + 0.7 * quality, idp_qb_hit: 0.5 + quality },
      LB: { idp_tkl_solo: 2.5 + 4 * quality, idp_tkl_ast: 1.5 + 2.5 * quality, idp_sack: 0.1 + 0.3 * quality, idp_pass_def: 0.2 + 0.4 * quality },
      DB: { idp_tkl_solo: 2 + 3 * quality, idp_tkl_ast: 0.8 + 1.2 * quality, idp_int: 0.05 + 0.2 * quality, idp_pass_def: 0.4 + 0.8 * quality },
    }[pos];
    statsFor[id] = s;
  }
}

function projections(week) {
  return Object.values(players)
    .filter((p) => bye[p.team] !== week)
    .map((p) => ({
      player_id: p.player_id,
      week,
      stats: Object.fromEntries(Object.entries(statsFor[p.player_id]).map(([k, v]) => [k, +(v * (0.92 + rand() * 0.16)).toFixed(2)])),
    }));
}

const scoringSuper = {
  pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rush_td: 6, rec: 1, rec_yd: 0.1, rec_td: 6, fum_lost: -2,
  bonus_rec_te: 0.5, fgm_30_39: 3, fgm_40_49: 4, fgm_50p: 5, xpm: 1, sack: 1, int: 2, fum_rec: 2, def_td: 6,
  pts_allow_0: 10, pts_allow_1_6: 7, pts_allow_7_13: 4, pts_allow_14_20: 1, pts_allow_21_27: 0, pts_allow_28_34: -1, pts_allow_35p: -4,
  idp_tkl_solo: 1, idp_tkl_ast: 0.5, idp_sack: 4, idp_qb_hit: 1, idp_int: 3, idp_pass_def: 1,
};

function makeLeague({ id, name, teams, positions, type, scoring, draftId, userRoster }) {
  const league = {
    league_id: id, name, season: SEASON, sport: "nfl", status: "in_season", total_rosters: teams, avatar: null,
    previous_league_id: null, draft_id: draftId, roster_positions: positions, scoring_settings: scoring,
    settings: { type, num_teams: teams, playoff_week_start: 15, playoff_teams: 4, playoff_round_type: 0, trade_deadline: 11, waiver_budget: 250 },
  };
  const users = Array.from({ length: teams }, (_, i) => ({
    user_id: i === userRoster ? "1001" : `${id}-u${i}`,
    display_name: i === userRoster ? "Demo" : `Manager ${i + 1}`,
    avatar: null,
    metadata: { team_name: i === userRoster ? "Demo Bros" : `Team ${i + 1}` },
  }));
  // Snake-ish draft of the best players into rosters by position need.
  const size = positions.filter((p) => p !== "IR" && p !== "TAXI").length;
  const pools = Object.fromEntries(Object.keys(COUNTS).map((pos) => [pos, Object.values(players).filter((p) => p.position === pos).map((p) => p.player_id)]));
  const allowed = new Set(positions.flatMap((s) => ({ FLEX: ["RB","WR","TE"], SUPER_FLEX: ["QB","RB","WR","TE"], IDP_FLEX: ["DL","LB","DB"], BN: [] }[s] ?? [s])));
  const order = [];
  const template = ["QB","RB","RB","WR","WR","WR","TE","RB","WR","QB","K","DEF","LB","DB","DL","RB","WR","TE","LB","DB","WR","RB","QB","DL"];
  const rosters = users.map((u, i) => ({ roster_id: i + 1, owner_id: u.user_id, league_id: id, players: [], starters: [], reserve: [], taxi: null, settings: {} }));
  const picks = [];
  for (let round = 0; picks.length < teams * size && round < template.length * 2; round++) {
    const pos = template[round % template.length];
    if (!allowed.has(pos)) continue;
    for (let k = 0; k < teams; k++) {
      const r = rosters[round % 2 ? teams - 1 - k : k];
      if (r.players.length >= size) continue;
      const pid = pools[pos].shift();
      if (!pid) continue;
      r.players.push(pid);
      picks.push({ player_id: pid, picked_by: r.owner_id, roster_id: r.roster_id, is_keeper: false, metadata: { amount: String(Math.max(1, Math.round(60 * Math.pow(0.86, round) + rand() * 8))), position: pos } });
    }
  }
  rosters.forEach((r, i) => {
    r.starters = r.players.slice(0, 10);
    const hurt = r.players.find((p) => players[p].injury_status === "IR");
    if (hurt && positions.includes("IR")) r.reserve = [hurt];
    const w = Math.floor(rand() * 8);
    r.settings = { wins: w, losses: 7 - w, ties: 0, fpts: 700 + Math.floor(rand() * 300), fpts_decimal: 25, fpts_against: 800 };
  });
  return { league, users, rosters, picks };
}

const SUPER_POSITIONS = ["QB","RB","RB","WR","WR","WR","TE","FLEX","SUPER_FLEX","K","DEF","IDP_FLEX","IDP_FLEX","IDP_FLEX","BN","BN","BN","BN","BN","BN","BN","BN","IR"];
const REDRAFT_POSITIONS = ["QB","RB","RB","WR","WR","TE","FLEX","K","DEF","BN","BN","BN","BN","BN","BN"];

const leagues = [
  makeLeague({ id: "9001", name: "Super League (demo)", teams: 8, positions: SUPER_POSITIONS, type: 1, scoring: scoringSuper, draftId: "d9001", userRoster: 2 }),
  makeLeague({ id: "9002", name: "Redraft 12 (demo)", teams: 12, positions: REDRAFT_POSITIONS, type: 0, scoring: { ...scoringSuper, rec: 0.5, bonus_rec_te: 0 }, draftId: "d9002", userRoster: 5 }),
];

const user = { user_id: "1001", username: "demo", display_name: "Demo", avatar: null };
const routes = {
  "/v1/state/nfl": { season: SEASON, league_season: SEASON, week: WEEK, season_type: "regular" },
  "/v1/user/demo": user,
  "/v1/user/1001": user,
  [`/v1/user/1001/leagues/nfl/${SEASON}`]: leagues.map((l) => l.league),
  "/v1/players/nfl": players,
};
for (const l of leagues) {
  routes[`/v1/league/${l.league.league_id}`] = l.league;
  routes[`/v1/league/${l.league.league_id}/users`] = l.users;
  routes[`/v1/league/${l.league.league_id}/rosters`] = l.rosters;
  routes[`/v1/draft/${l.league.draft_id}/picks`] = l.picks;
}
const projCache = {};

function fantasyCalc() {
  return Object.values(players)
    .filter((p) => ["QB", "RB", "WR", "TE"].includes(p.position))
    .map((p) => {
      const s = statsFor[p.player_id];
      const base = (s.pass_yd ?? 0) / 25 + (s.rush_yd ?? 0) / 10 + (s.rec_yd ?? 0) / 10 + (s.rec ?? 0);
      return { player: { sleeperId: p.player_id, name: p.full_name, position: p.position }, value: Math.round(base * base * (32 - p.age) * 1.5) };
    });
}

const port = Number(process.env.PORT ?? 4010);
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    let body = routes[path] ?? null;
    let m;
    if ((m = path.match(/^\/projections\/nfl\/\d+\/(\d+)$/))) body = projCache[m[1]] ??= projections(Number(m[1]));
    else if (path.match(/\/leagues\/nfl\/\d+$/)) body = body ?? [];
    else if (path.match(/^\/v1\/league\/\d+\/transactions\/\d+$/)) body = [];
    else if (path === "/values/current") body = fantasyCalc();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  })
  .listen(port, () => console.log(`Mock Sleeper API on http://localhost:${port}/v1 (try username "demo")`));
