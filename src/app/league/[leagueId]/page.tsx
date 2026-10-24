import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllPlayers,
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  SleeperNotFoundError,
} from "@/lib/sleeper/client";
import {
  buildTeams,
  findUserTeam,
  leagueType,
  positionCounts,
  summarizeScoring,
  type RosterPlayer,
  type Team,
} from "@/lib/sleeper/league";

function PlayerList({ title, players }: { title: string; players: RosterPlayer[] }) {
  if (players.length === 0) return null;
  return (
    <>
      <h3 className="muted" style={{ fontSize: 13, margin: "12px 0 4px" }}>
        {title}
      </h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {players.map((p) => (
          <li key={p.id}>
            <span className="pos">{p.position}</span>
            {p.name}
            <span className="muted">
              {p.team ? ` · ${p.team}` : ""}
              {p.age ? ` · ${p.age}y` : ""}
            </span>
            {p.injuryStatus && <span className="injury">{p.injuryStatus}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

function RosterCard({ team }: { team: Team }) {
  return (
    <div className="card">
      <strong>{team.teamName}</strong>
      <div className="muted">
        {team.ownerName} · {team.wins}-{team.losses}
        {team.ties ? `-${team.ties}` : ""}
      </div>
      <div className="tags">
        {Object.entries(positionCounts(team)).map(([pos, n]) => (
          <span key={pos} className="tag">
            {pos} {n}
          </span>
        ))}
      </div>
      <PlayerList title="Starters" players={team.starters} />
      <PlayerList title="Bench" players={team.bench} />
      <PlayerList title="IR" players={team.reserve} />
      <PlayerList title="Taxi" players={team.taxi} />
    </div>
  );
}

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ user?: string }>;
}) {
  const { leagueId } = await params;
  const { user: userId } = await searchParams;

  const [league, rosters, users, players] = await Promise.all([
    getLeague(leagueId),
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
    getAllPlayers(),
  ]).catch((e) => {
    if (e instanceof SleeperNotFoundError) notFound();
    throw e;
  });

  const scoring = summarizeScoring(league);
  const teams = buildTeams(rosters, users, players);
  const mine = userId ? findUserTeam(teams, userId, rosters) : undefined;
  const others = teams.filter((t) => t !== mine);

  return (
    <>
      <h1>{league.name}</h1>
      <div className="muted">
        {league.season} · {league.total_rosters} teams · {league.status.replace("_", " ")}
      </div>
      <div className="tags">
        <span className="tag strong">{leagueType(league)}</span>
        <span className="tag">{scoring.format}</span>
        {scoring.superflex && <span className="tag">Superflex</span>}
        {scoring.tePremium > 0 && <span className="tag">TE premium +{scoring.tePremium}</span>}
        {scoring.idp && <span className="tag">IDP</span>}
        <span className="tag">{scoring.passTd} pt pass TD</span>
        {scoring.passYd > 0 && <span className="tag">1 pt / {Math.round(1 / scoring.passYd)} pass yds</span>}
      </div>

      <p>
        <Link href={`/league/${leagueId}/trades${userId ? `?user=${userId}` : ""}`} className="button-link">
          Find trades that help {mine ? "your team" : "a team"} →
        </Link>
      </p>

      <h2>Standings</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>Owner</th>
              <th className="num">W-L-T</th>
              <th className="num">PF</th>
              <th className="num">PA</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => (
              <tr key={t.rosterId} className={t === mine ? "mine" : undefined}>
                <td>{i + 1}</td>
                <td>{t.teamName}</td>
                <td className="muted">{t.ownerName}</td>
                <td className="num">
                  {t.wins}-{t.losses}-{t.ties}
                </td>
                <td className="num">{t.pointsFor.toFixed(2)}</td>
                <td className="num">{t.pointsAgainst.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mine && (
        <>
          <h2>Your team</h2>
          <RosterCard team={mine} />
        </>
      )}

      <h2>{mine ? "Other rosters" : "Rosters"}</h2>
      <div className="grid">
        {others.map((t) => (
          <RosterCard key={t.rosterId} team={t} />
        ))}
      </div>

      <h2>Lineup and scoring settings</h2>
      <p>
        <strong>Starting slots:</strong> {scoring.starterSlots.join(", ")} · {scoring.benchSlots} bench
      </p>
      <details>
        <summary>All scoring settings ({Object.keys(league.scoring_settings).length})</summary>
        <div className="table-wrap">
          <table>
            <tbody>
              {Object.entries(league.scoring_settings)
                .filter(([, v]) => v !== 0)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="num">{v}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
