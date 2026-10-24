import Link from "next/link";
import { notFound } from "next/navigation";
import { keeperCost } from "@/lib/engine/keeper";
import { DEFAULT_SETTINGS, TradeEngine, type TradeMode, type TradeSuggestion } from "@/lib/engine/trades";
import type { LeagueSnapshot } from "@/lib/engine/types";
import { buildModel } from "@/lib/engine/valuation";
import { FANTASYCALC_ATTRIBUTION } from "@/lib/fantasycalc";
import { loadSleeperSnapshot } from "@/lib/sleeper/adapter";
import { SleeperNotFoundError } from "@/lib/sleeper/client";

export const maxDuration = 60;

const STRATEGIES = {
  "win-now": { label: "Win now", lambda: 0.05 },
  balanced: { label: "Balanced", lambda: 0.1 },
  rebuild: { label: "Rebuild", lambda: 0.2 },
} as const;
type Strategy = keyof typeof STRATEGIES;

const MODES: Record<TradeMode, string> = {
  "win-win": "Win-win only",
  fair: "Fair (10%+ chance)",
  aggressive: "Aggressive",
};

const fmt = (n: number) => n.toFixed(1);
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;

function names(snap: LeagueSnapshot, ids: string[]) {
  return ids.map((id) => snap.players[id]?.name ?? id).join(" + ");
}

function TradeCard({ t, snap, keeper, label }: { t: TradeSuggestion; snap: LeagueSnapshot; keeper: boolean; label?: string }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      {label && <div className="tag strong" style={{ display: "inline-block", marginBottom: 6 }}>{label}</div>}
      <div className="muted">with {t.opponentName}</div>
      <div style={{ margin: "6px 0" }}>
        <strong>Give</strong> {names(snap, t.give)} · <strong>Get</strong> {names(snap, t.get)}
      </div>
      {(t.user.drops.length > 0 || t.user.adds.length > 0) && (
        <div className="muted" style={{ fontSize: 13 }}>
          {t.user.drops.length > 0 && <>You drop {names(snap, t.user.drops)}. </>}
          {t.user.adds.length > 0 && <>Pick up {names(snap, t.user.adds)} off waivers.</>}
        </div>
      )}
      <div className="tags">
        <span className="tag strong">You {signed(t.user.delta)} ppg</span>
        {keeper && Math.abs(t.user.keeperDelta) >= 0.5 && <span className="tag">Keeper {t.user.keeperDelta >= 0 ? "+" : "−"}${Math.abs(t.user.keeperDelta).toFixed(0)}</span>}
        <span className="tag">Them {signed(t.opponent.delta)} ppg</span>
        {keeper && Math.abs(t.opponent.keeperDelta) >= 0.5 && (
          <span className="tag">Their keeper {t.opponent.keeperDelta >= 0 ? "+" : "−"}${Math.abs(t.opponent.keeperDelta).toFixed(0)}</span>
        )}
        <span className="tag strong">{Math.round(t.pAccept * 100)}% likely accepted</span>
        {t.netGain < t.user.total - 0.05 && (
          <span className="tag">You overpay in value: {signed(t.netGain - t.user.total)} ppg</span>
        )}
      </div>
      <p style={{ margin: "8px 0 0" }}>{t.explanation.yourSide}.</p>
      <p className="muted" style={{ margin: "2px 0 0" }}>Them: {t.explanation.theirSide}.</p>
      {t.flags.map((f) => (
        <p key={f} className="injury" style={{ margin: "4px 0 0", marginLeft: 0 }}>{f}</p>
      ))}
    </div>
  );
}

export default async function TradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ user?: string; team?: string; mode?: string; strategy?: string; keepers?: string; idp?: string }>;
}) {
  const { leagueId } = await params;
  const q = await searchParams;
  const mode = (q.mode && q.mode in MODES ? q.mode : "win-win") as TradeMode;
  const strategy = (q.strategy && q.strategy in STRATEGIES ? q.strategy : "balanced") as Strategy;

  const keepersParam = q.keepers === "super" ? true : q.keepers === "none" ? false : undefined;
  const snap = await loadSleeperSnapshot(leagueId, q.user, { keepers: keepersParam }).catch((e) => {
    if (e instanceof SleeperNotFoundError) notFound();
    throw e;
  });
  const team = snap.teams.find((t) => (q.team ? t.id === q.team : t.isUser));
  const keeper = !!snap.keeper;

  const engine = new TradeEngine(buildModel(snap), {
    ...DEFAULT_SETTINGS,
    mode,
    lambda: STRATEGIES[strategy].lambda,
    includeIdp: q.idp === "on",
  });
  const started = Date.now();
  const suggestions = team && snap.weeks.length ? engine.suggest(team.id) : [];
  const elapsed = Date.now() - started;

  const profile = team ? engine.profiles.find((p) => p.team.id === team.id)! : null;
  const model = engine.model;
  const keepers = team && keeper ? engine.keepers(team) : null;

  return (
    <>
      <Link href={`/league/${leagueId}${q.user ? `?user=${q.user}` : ""}`}>← {snap.name}</Link>
      <h1>Trade ideas</h1>
      <p className="muted">
        Weeks {snap.weeks[0] ?? "-"}–{snap.weeks[snap.weeks.length - 1] ?? "-"} · scored with this league&apos;s
        rules, replacement level from its real free agents
        {keeper ? " · keeper value under Super League rules" : ""}
      </p>

      <form className="search" method="get">
        {q.user && <input type="hidden" name="user" value={q.user} />}
        <select name="team" defaultValue={team?.id ?? ""}>
          <option value="" disabled>
            Pick your team
          </option>
          {snap.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.ownerName})
            </option>
          ))}
        </select>
        <select name="mode" defaultValue={mode}>
          {Object.entries(MODES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {snap.slots.some((s) => ["DL", "LB", "DB", "IDP_FLEX"].includes(s)) && (
          <select name="idp" defaultValue={q.idp === "on" ? "on" : "off"}>
            <option value="off">Offense only</option>
            <option value="on">Include IDP in trades</option>
          </select>
        )}
        <select name="keepers" defaultValue={keeper ? "super" : "none"}>
          <option value="super">Keepers: Super League rules</option>
          <option value="none">No keepers</option>
        </select>
        {keeper && (
          <select name="strategy" defaultValue={strategy}>
            {Object.entries(STRATEGIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        )}
        <button type="submit">Find trades</button>
      </form>

      {!team ? (
        <p>Pick your team above to see trade ideas.</p>
      ) : snap.tradeDeadlinePassed ? (
        <p>The trade deadline has passed in this league.</p>
      ) : snap.weeks.length === 0 ? (
        <p>The fantasy season is over, so there&apos;s nothing to trade for.</p>
      ) : (
        <>
          <h2>Top {suggestions.length} trades</h2>
          {suggestions.length === 0 && (
            <p className="muted">
              Nothing clears the bar in this mode. Try &quot;Fair&quot; or &quot;Aggressive&quot;.
            </p>
          )}
          {suggestions.map((t, i) => (
            <div key={i}>
              <TradeCard t={t} snap={snap} keeper={keeper} label={`#${i + 1}`} />
              {t.sweetened && (
                <div style={{ marginLeft: 16 }}>
                  <TradeCard t={t.sweetened} snap={snap} keeper={keeper} label="Sweetened to get it done" />
                </div>
              )}
              {t.askMore && (
                <div style={{ marginLeft: 16 }}>
                  <TradeCard t={t.askMore} snap={snap} keeper={keeper} label="You can ask for more" />
                </div>
              )}
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>Searched in {(elapsed / 1000).toFixed(1)}s.</p>

          {profile && (
            <>
              <h2>Your team</h2>
              <p>
                Best lineup: <strong>{fmt(profile.strength)} ppg</strong> for the rest of the season.{" "}
                {Object.entries(profile.need)
                  .filter(([, z]) => (z ?? 0) > 0.5)
                  .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                  .map(([pos, z]) => `${pos} (need ${fmt(z!)})`)
                  .join(", ") || "No glaring weak spots."}
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th className="num">ROS ppg</th>
                      <th className="num">Over repl.</th>
                      <th className="num">If traded</th>
                      {keeper && <th className="num">Keep cost</th>}
                      {keeper && <th className="num">Keeper surplus</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {[...team.playerIds, ...team.irPlayerIds]
                      .map((id) => snap.players[id])
                      .sort((a, b) => model.ppg[b.id] - model.ppg[a.id])
                      .map((p) => (
                        <tr key={p.id} className={keepers?.keepers.includes(p.id) ? "mine" : undefined}>
                          <td>
                            <span className="pos">{p.position}</span>
                            {p.name}
                            {p.injuryStatus && <span className="injury">{p.injuryStatus}</span>}
                          </td>
                          <td className="num">{fmt(model.ppg[p.id])}</td>
                          <td className="num">{signed(model.tv[p.id])}</td>
                          <td className="num">
                            {profile.removalCost[p.id] !== undefined ? signed(-profile.removalCost[p.id]) : "IR"}
                          </td>
                          {keeper && <td className="num">${keeperCost(snap.keeper!.price[p.id], p.position)}</td>}
                          {keeper && <td className="num">${engine.keeperSurplusOf(p.id).toFixed(0)}</td>}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: 13 }}>
                &quot;If traded&quot; is how many ppg your lineup loses without that player.
                {keeper &&
                  ` Highlighted rows are your best keeper set (${engine.keeperSlots(team.id)?.slots} slots at your projected finish).`}
              </p>
            </>
          )}
        </>
      )}

      {keeper && (
        <p className="muted" style={{ fontSize: 12, marginTop: 32 }}>
          Next-season keeper values use dynasty market values.{" "}
          <a href={FANTASYCALC_ATTRIBUTION.href}>{FANTASYCALC_ATTRIBUTION.label}</a>.
        </p>
      )}
    </>
  );
}
