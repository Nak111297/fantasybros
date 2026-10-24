# FantasyBros

Fantasy football league analysis and (soon) trade suggestions, starting with Sleeper.

## What works today

- Enter a Sleeper username to list your NFL leagues for any recent season.
- Each league shows its type (redraft, keeper, dynasty), scoring format (PPR, half, standard),
  superflex, TE premium and IDP, plus standings and every roster split into
  starters, bench, IR and taxi.

All data comes from the public, read-only [Sleeper API](https://docs.sleeper.com); no login or key needed.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests for the league/roster logic
```

### Without internet access to Sleeper

```bash
node scripts/mock-sleeper.mjs                          # fake API on :4010
SLEEPER_API_BASE=http://localhost:4010/v1 npm run dev  # then search for "demo"
```

## Layout

- `src/lib/sleeper/client.ts`: Sleeper API calls (with caching; the 5MB player dump is cached in memory for a day).
- `src/lib/sleeper/league.ts`: pure logic: league type, scoring summary, building teams from rosters.
- `src/app/`: Next.js pages (`/u/[username]`, `/league/[leagueId]`).
