import Link from "next/link";
import { notFound } from "next/navigation";
import { getNflState, getUser, getUserLeagues, SleeperNotFoundError } from "@/lib/sleeper/client";
import { leagueType, summarizeScoring } from "@/lib/sleeper/league";

export default async function UserLeagues({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { username } = await params;
  const { season: seasonParam } = await searchParams;

  const user = await getUser(decodeURIComponent(username)).catch((e) => {
    if (e instanceof SleeperNotFoundError) notFound();
    throw e;
  });
  const currentSeason = (await getNflState()).league_season;
  const season = seasonParam ?? currentSeason;
  const leagues = await getUserLeagues(user.user_id, season);
  const thisYear = Number(currentSeason);
  const seasons = Array.from({ length: 5 }, (_, i) => String(thisYear - i));

  return (
    <>
      <h1>{user.display_name}&apos;s leagues</h1>
      <form className="search" method="get">
        <select name="season" defaultValue={season}>
          {seasons.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button type="submit">Change season</button>
      </form>

      {leagues.length === 0 ? (
        <p className="muted">No NFL leagues found for {season}.</p>
      ) : (
        <div className="grid" style={{ marginTop: 16 }}>
          {leagues.map((league) => {
            const scoring = summarizeScoring(league);
            return (
              <Link
                key={league.league_id}
                href={`/league/${league.league_id}?user=${user.user_id}`}
                className="card"
                style={{ color: "inherit" }}
              >
                <strong>{league.name}</strong>
                <div className="muted">
                  {league.total_rosters} teams · {league.status.replace("_", " ")}
                </div>
                <div className="tags">
                  <span className="tag strong">{leagueType(league)}</span>
                  <span className="tag">{scoring.format}</span>
                  {scoring.superflex && <span className="tag">Superflex</span>}
                  {scoring.tePremium > 0 && <span className="tag">TE+{scoring.tePremium}</span>}
                  {scoring.idp && <span className="tag">IDP</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
