# FantasyBros

Fantasy football league analysis and (soon) trade suggestions, starting with Sleeper.

## What works today

- Enter a Sleeper username to list your NFL leagues for any recent season.
- Each league shows its type (redraft, keeper, dynasty), scoring format (PPR, half, standard),
  superflex, TE premium and IDP, plus standings and every roster split into
  starters, bench, IR and taxi.

- **Trade ideas** (`/league/<id>/trades`): pick your team and get the top 10 trades, ranked by
  how many points per week your best lineup gains times the chance the other manager accepts.
  Values use each league's own scoring and lineup slots, with replacement level set by that
  league's real free agents. Keeper leagues also count next season's keeper value
  (Super League rules), and offers under 50% get a "sweetened" version.
  The design is in the project's "Trade Suggestion Engine: Design" doc.

All data comes from the public, read-only [Sleeper API](https://docs.sleeper.com); no login or key needed.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests for the league/roster logic
```

### Without internet access to Sleeper

```bash
node scripts/mock-sleeper.mjs   # fake Sleeper + FantasyCalc on :4010
SLEEPER_API_BASE=http://localhost:4010/v1 \
SLEEPER_PROJECTIONS_BASE=http://localhost:4010 \
FANTASYCALC_API_BASE=http://localhost:4010 npm run dev   # then search for "demo"
```

## Layout

- `src/lib/sleeper/client.ts`: Sleeper API calls (with caching; the 5MB player dump is cached in memory for a day).
- `src/lib/sleeper/league.ts`: pure logic: league type, scoring summary, building teams from rosters.
- `src/lib/sleeper/adapter.ts`: turns Sleeper data (rosters, weekly projections, free agents, draft prices) into the engine's league snapshot.
- `src/lib/engine/`: platform-neutral engine: scoring, lineup solver, valuation, keeper rules, trade search.
- `src/app/`: Next.js pages (`/u/[username]`, `/league/[leagueId]`).
