export default function Home() {
  return (
    <>
      <h1>Connect your Sleeper leagues</h1>
      <p className="muted">
        Enter your Sleeper username to pull your leagues, rosters and scoring settings. No login
        needed: Sleeper&apos;s API is public and read only.
      </p>
      <form className="search" action="/u" method="get">
        <input name="username" placeholder="Sleeper username" required autoFocus />
        <button type="submit">Find my leagues</button>
      </form>
    </>
  );
}
