import Link from "next/link";

// Shortcuts to the leagues we use most.
const MY_LEAGUES = [
  {
    name: "Super League",
    platform: "Sleeper",
    trades: "/league/1389486419981914112/trades?user=768647637271511040",
    league: "/league/1389486419981914112?user=768647637271511040",
  },
];

export default function Home() {
  return (
    <>
      <h1>My leagues</h1>
      <div className="grid" style={{ marginTop: 12 }}>
        {MY_LEAGUES.map((l) => (
          <div key={l.trades} className="card">
            <strong>{l.name}</strong>
            <div className="muted">{l.platform}</div>
            <Link href={l.trades} className="button-link">
              Trade ideas →
            </Link>{" "}
            <Link href={l.league} style={{ marginLeft: 12 }}>
              Standings and rosters
            </Link>
          </div>
        ))}
      </div>

      <h2>Find another Sleeper league</h2>
      <p className="muted">
        Enter a Sleeper username to pull its leagues, rosters and scoring settings. No login
        needed: Sleeper&apos;s API is public and read only.
      </p>
      <form className="search" action="/u" method="get">
        <input name="username" placeholder="Sleeper username" required />
        <button type="submit">Find leagues</button>
      </form>
    </>
  );
}
