import { keeperSlotsFor, keeperSurplus, keeperValue } from "./keeper";
import type { EnginePlayer, EngineTeam, KeeperLimit, Position } from "./types";
import { lineupFor, profileTeams, strength, type LeagueModel, type TeamProfile } from "./valuation";

export type TradeMode = "win-win" | "fair" | "aggressive";

export interface TradeSettings {
  mode: TradeMode;
  /** ppg per keeper $: 0.05 win now, 0.10 balanced, 0.20 rebuild. */
  lambda: number;
  minGain: number;
  sFit: number;
  sVal: number;
  c0: number;
  c1: number;
  pMin: number;
  includeKickersAndDefense: boolean;
  untradeable: string[];
  limit: number;
}

export const DEFAULT_SETTINGS: TradeSettings = {
  mode: "win-win",
  lambda: 0.1,
  minGain: 0.5,
  sFit: 2.0,
  sVal: 4.0,
  c0: 0,
  c1: 1.5,
  pMin: 0.1,
  includeKickersAndDefense: false,
  untradeable: [],
  limit: 10,
};

export interface SideResult {
  before: number;
  after: number;
  /** ΔS in ppg. */
  delta: number;
  /** ΔK in keeper $ (0 outside keeper leagues). */
  keeperDelta: number;
  /** delta + λ·keeperDelta. */
  total: number;
  drops: string[];
  adds: string[];
}

export interface TradeEval {
  opponentId: string;
  give: string[];
  get: string[];
  user: SideResult;
  opponent: SideResult;
  /** ΔV_O: market value the opponent receives minus what they give. */
  valueToOpponent: number;
  pAccept: number;
  score: number;
}

export interface TradeSuggestion extends TradeEval {
  opponentName: string;
  explanation: { yourSide: string; theirSide: string };
  flags: string[];
  /** Same idea with one of your players added, when the base offer is under 50%. */
  sweetened?: TradeSuggestion;
  /** Same idea asking for one more of their players, when the base offer is a lock. */
  askMore?: TradeSuggestion;
}

const OFFENSE: Position[] = ["QB", "RB", "WR", "TE"];

interface KeeperState {
  ks: Record<string, number>;
  slots: Record<string, { slots: number; limits: KeeperLimit[] }>;
}

export class TradeEngine {
  readonly profiles: TeamProfile[];
  private readonly byTeam: Map<string, TeamProfile>;
  private readonly keeper: KeeperState | null;
  private readonly baseK = new Map<string, number>();
  private readonly faByPos: Map<Position, EnginePlayer[]>;

  constructor(
    readonly model: LeagueModel,
    readonly settings: TradeSettings = DEFAULT_SETTINGS,
  ) {
    this.profiles = profileTeams(model);
    this.byTeam = new Map(this.profiles.map((p) => [p.team.id, p]));

    // Top free agents per position, the only ones worth testing as pickups.
    this.faByPos = new Map();
    for (const pos of model.positions) {
      this.faByPos.set(
        pos,
        model.snap.freeAgentIds
          .map((id) => model.snap.players[id])
          .filter((p) => p?.position === pos)
          .sort((a, b) => model.ppg[b.id] - model.ppg[a.id])
          .slice(0, 2),
      );
    }

    this.keeper = this.buildKeeperState();
    for (const t of model.snap.teams) this.baseK.set(t.id, this.keeperTotal(t, t.playerIds));
  }

  private buildKeeperState(): KeeperState | null {
    const ctx = this.model.snap.keeper;
    if (!ctx) return null;
    const ks: Record<string, number> = {};
    for (const p of Object.values(this.model.snap.players)) ks[p.id] = keeperSurplus(ctx, p.id, p.position);
    // Keeper slots follow projected final standing: current wins plus expected
    // wins over the rest of the regular season from lineup strength rank.
    const n = this.profiles.length;
    const ranked = [...this.profiles].sort((a, b) => b.strength - a.strength);
    const projected = this.profiles.map((p) => {
      const winProb = n > 1 ? (n - 1 - ranked.indexOf(p)) / (n - 1) : 0.5;
      return { id: p.team.id, wins: p.team.wins + p.team.ties / 2 + winProb * this.model.snap.regularWeeksLeft, pf: p.team.pointsFor };
    });
    projected.sort((a, b) => b.wins - a.wins || b.pf - a.pf);
    const slots: KeeperState["slots"] = {};
    projected.forEach((t, i) => (slots[t.id] = keeperSlotsFor(ctx.rules, i + 1)));
    return { ks, slots };
  }

  keeperSurplusOf(id: string): number {
    return this.keeper?.ks[id] ?? 0;
  }

  keeperSlots(teamId: string) {
    return this.keeper?.slots[teamId];
  }

  keepers(team: EngineTeam, ids = team.playerIds) {
    if (!this.keeper) return { value: 0, keepers: [] as string[] };
    const { slots, limits } = this.keeper.slots[team.id];
    const pool = [...ids, ...team.irPlayerIds].map((id) => ({
      id,
      position: this.model.snap.players[id]?.position ?? "QB",
      ks: this.keeper!.ks[id] ?? 0,
    }));
    return keeperValue(pool, slots, limits);
  }

  private keeperTotal(team: EngineTeam, ids: string[]): number {
    return this.keepers(team, ids).value;
  }

  private profile(teamId: string): TeamProfile {
    return this.byTeam.get(teamId)!;
  }

  /**
   * Make a roster legal: drop the least useful bench player when over, add the
   * best free agent when short. Pickups are tested only at the positions that
   * just left, which is where the hole is, to keep the search fast.
   */
  private legalize(ids: string[], protect: string[], left: string[]): { ids: string[]; drops: string[]; adds: string[] } {
    const max = this.model.snap.rosterMax;
    let roster = [...ids];
    const drops: string[] = [];
    const adds: string[] = [];
    while (roster.length > max) {
      const starters = new Set(lineupFor(this.model, roster).map((e) => e.playerId));
      const pool = roster.filter((id) => !starters.has(id) && !protect.includes(id));
      const candidates = pool.length ? pool : roster.filter((id) => !protect.includes(id));
      if (!candidates.length) break;
      const drop = candidates.reduce((a, b) => (this.model.tv[a] <= this.model.tv[b] ? a : b));
      roster = roster.filter((id) => id !== drop);
      drops.push(drop);
    }
    const positions = [...new Set(left.map((id) => this.model.snap.players[id]?.position))];
    while (roster.length < max) {
      const base = strength(this.model, roster);
      let best: { id: string; gain: number } | null = null;
      for (const pos of positions) {
        const fa = this.faByPos.get(pos)?.find((p) => !roster.includes(p.id));
        if (!fa) continue;
        const gain = strength(this.model, [...roster, fa.id]) - base;
        if (gain > (best?.gain ?? 0)) best = { id: fa.id, gain };
      }
      if (!best) break;
      roster.push(best.id);
      adds.push(best.id);
    }
    return { ids: roster, drops, adds };
  }

  private side(team: EngineTeam, out: string[], inc: string[]): SideResult {
    const before = this.profile(team.id).strength;
    const next = this.legalize(
      [...team.playerIds.filter((id) => !out.includes(id)), ...inc],
      inc,
      out,
    );
    const after = strength(this.model, next.ids);
    const keeperDelta = this.keeper ? this.keeperTotal(team, next.ids) - this.baseK.get(team.id)! : 0;
    const delta = after - before;
    return {
      before,
      after,
      delta,
      keeperDelta,
      total: delta + this.settings.lambda * keeperDelta,
      drops: next.drops,
      adds: next.adds,
    };
  }

  acceptance(opponentTotal: number, valueToOpponent: number): number {
    const { sFit, sVal, c0, c1 } = this.settings;
    const z = opponentTotal / sFit + valueToOpponent / sVal;
    return 1 / (1 + Math.exp(-(c0 + c1 * z)));
  }

  evaluate(user: EngineTeam, opp: EngineTeam, give: string[], get: string[]): TradeEval {
    const u = this.side(user, give, get);
    const o = this.side(opp, get, give);
    const sum = (ids: string[]) => ids.reduce((s, id) => s + this.model.tv[id], 0);
    const valueToOpponent = sum(give) - sum(get);
    const pAccept = this.acceptance(o.total, valueToOpponent);
    return {
      opponentId: opp.id,
      give,
      get,
      user: u,
      opponent: o,
      valueToOpponent,
      pAccept,
      score: u.total * pAccept,
    };
  }

  private passesMode(t: TradeEval): boolean {
    if (t.user.total < this.settings.minGain) return false;
    switch (this.settings.mode) {
      case "win-win":
        return t.opponent.total > 0 && t.user.total > 0;
      case "fair":
        return t.pAccept >= this.settings.pMin;
      default:
        return true;
    }
  }

  private searchable(team: EngineTeam): string[] {
    const skip = new Set(this.settings.untradeable);
    return team.playerIds.filter((id) => {
      const p = this.model.snap.players[id];
      if (!p || skip.has(id)) return false;
      if (!this.settings.includeKickersAndDefense && (p.position === "K" || p.position === "DEF")) return false;
      return this.model.positions.has(p.position);
    });
  }

  /** Low-value pieces aren't worth a 1-for-1 on their own. */
  private lowValue(team: EngineTeam, id: string): boolean {
    return this.model.tv[id] <= 0 && Math.abs(this.profile(team.id).removalCost[id] ?? 0) < 0.1;
  }

  /** Every 1-for-1, 2-for-1 and 1-for-2 with each opponent, filtered and ranked. */
  suggest(userTeamId: string): TradeSuggestion[] {
    const snap = this.model.snap;
    if (snap.tradeDeadlinePassed) return [];
    const user = snap.teams.find((t) => t.id === userTeamId);
    if (!user) return [];
    const userProfile = this.profile(user.id);
    const uBase = userProfile.strength;
    const uBaseK = this.baseK.get(user.id)!;
    const lambda = this.settings.lambda;
    const mine = this.searchable(user);

    // Upper bound on ΔU for receiving a package without giving anything.
    const bound = (get: string[]) => {
      const ids = [...user.playerIds, ...get];
      const kGain = this.keeper ? this.keeperTotal(user, ids) - uBaseK : 0;
      return strength(this.model, ids) - uBase + lambda * kGain;
    };

    const all: TradeEval[] = [];
    for (const opp of snap.teams) {
      if (opp.id === user.id) continue;
      const theirs = this.searchable(opp);
      const oppProfile = this.profile(opp.id);

      // Opponents with nothing that fills a hole of ours only get 1-for-1s.
      const fitsNeed = [...this.model.positions].some(
        (pos) =>
          (userProfile.need[pos] ?? 0) > 0 &&
          theirs.some((id) => snap.players[id].position === pos && (oppProfile.surplus[id] ?? 0) > 0),
      );

      const singleBound = new Map(theirs.map((h) => [h, bound([h])]));
      const worthGetting = theirs.filter((h) => singleBound.get(h)! >= this.settings.minGain);

      // 1-for-1
      for (const h of worthGetting) {
        if (this.lowValue(opp, h)) continue;
        for (const g of mine) {
          if (this.lowValue(user, g)) continue;
          all.push(this.evaluate(user, opp, [g], [h]));
        }
      }
      if (!fitsNeed) continue;

      // 2-for-1: consolidate two of ours into one of theirs.
      for (const h of worthGetting) {
        for (let i = 0; i < mine.length; i++) {
          for (let j = i + 1; j < mine.length; j++) {
            all.push(this.evaluate(user, opp, [mine[i], mine[j]], [h]));
          }
        }
      }

      // 1-for-2: one of ours for two of theirs.
      for (let i = 0; i < theirs.length; i++) {
        for (let j = i + 1; j < theirs.length; j++) {
          const pair = [theirs[i], theirs[j]];
          if (bound(pair) < this.settings.minGain) continue;
          for (const g of mine) all.push(this.evaluate(user, opp, [g], pair));
        }
      }
    }

    const candidates = all.filter((t) => t.user.total >= this.settings.minGain);
    candidates.sort(compareTrades(this.model.tv));

    // Sweeteners for promising trades the other side would probably reject.
    // A sweetened offer rides along with its base trade, or replaces it when
    // only the sweetened version passes the mode filter.
    const pool: (TradeEval & { sweet?: TradeEval })[] = [];
    for (const t of candidates.slice(0, 300)) {
      const sweet = t.pAccept < 0.5 && t.user.total > 0 ? this.sweeten(user, t) : null;
      const sweetOk = sweet && this.passesMode(sweet) ? sweet : undefined;
      if (this.passesMode(t)) pool.push({ ...t, sweet: sweetOk });
      else if (sweetOk) pool.push(sweetOk);
    }
    pool.sort(compareTrades(this.model.tv));

    const picked = diversify(dropDominated(pool), this.settings.limit);
    return picked.map((t) => {
      const suggestion = this.describe(user, t);
      if (t.sweet) suggestion.sweetened = this.describe(user, t.sweet);
      if (t.pAccept > 0.85) {
        const more = this.askForMore(user, t);
        if (more) suggestion.askMore = this.describe(user, more);
      }
      return suggestion;
    });
  }

  /** Add the cheapest of our players that lifts acceptance to 50%. */
  private sweeten(user: EngineTeam, t: TradeEval): TradeEval | null {
    if (t.give.length >= 3) return null;
    const opp = this.model.snap.teams.find((x) => x.id === t.opponentId)!;
    const removal = this.profile(user.id).removalCost;
    const lambda = this.settings.lambda;
    const options = this.searchable(user)
      .filter((id) => !t.give.includes(id))
      .map((id) => ({ id, cost: (removal[id] ?? 0) + lambda * Math.max(0, this.keeperSurplusOf(id)) }))
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 8);
    for (const { id } of options) {
      const s = this.evaluate(user, opp, [...t.give, id], t.get);
      if (s.pAccept >= 0.5 && s.user.total >= this.settings.minGain) return s;
    }
    return null;
  }

  /** When they'd almost surely accept, see if one more of their bench players still clears 50%. */
  private askForMore(user: EngineTeam, t: TradeEval): TradeEval | null {
    if (t.get.length >= 3) return null;
    const opp = this.model.snap.teams.find((x) => x.id === t.opponentId)!;
    const starters = new Set(lineupFor(this.model, opp.playerIds).map((e) => e.playerId));
    const bench = this.searchable(opp)
      .filter((id) => !t.get.includes(id) && !starters.has(id))
      .sort((a, b) => this.model.tv[b] - this.model.tv[a])
      .slice(0, 6);
    for (const id of bench) {
      const m = this.evaluate(user, opp, t.give, [...t.get, id]);
      if (m.pAccept > 0.5 && m.user.total > t.user.total) return m;
    }
    return null;
  }

  describe(user: EngineTeam, t: TradeEval): TradeSuggestion {
    const snap = this.model.snap;
    const opp = snap.teams.find((x) => x.id === t.opponentId)!;
    const fmt = (n: number) => n.toFixed(1);

    // Your side: the slot that improves the most.
    const before = lineupFor(this.model, user.playerIds);
    const afterIds = [...user.playerIds.filter((id) => !t.give.includes(id)), ...t.get, ...t.user.adds].filter(
      (id) => !t.user.drops.includes(id),
    );
    const after = lineupFor(this.model, afterIds);
    let yourSide = `Your lineup goes from ${fmt(t.user.before)} to ${fmt(t.user.after)} ppg`;
    let bestGain = 0;
    for (const a of after) {
      const b = before.find((x) => x.label === a.label);
      if (b && a.ppg - b.ppg > bestGain) {
        bestGain = a.ppg - b.ppg;
        yourSide = `Your ${a.label} goes from ${fmt(b.ppg)} to ${fmt(a.ppg)} ppg`;
      }
    }
    if (t.user.keeperDelta) {
      yourSide += `; keeper value ${t.user.keeperDelta > 0 ? "+" : "−"}$${Math.abs(t.user.keeperDelta).toFixed(0)}`;
    }

    // Their side, in their terms: their need at what they receive, and depth at what they give.
    const oppProfile = this.profile(opp.id);
    const gets = [...new Set(t.give.map((id) => snap.players[id].position))];
    const gives = [...new Set(t.get.map((id) => snap.players[id].position))];
    const needPos = gets.sort((a, b) => (oppProfile.need[b] ?? 0) - (oppProfile.need[a] ?? 0))[0];
    const parts: string[] = [];
    if (needPos && (oppProfile.need[needPos] ?? 0) > 0) {
      parts.push(`${needPos} is a weak spot for them (need ${fmt(oppProfile.need[needPos]!)})`);
    }
    for (const pos of gives) {
      const startable = opp.playerIds.filter(
        (id) => snap.players[id]?.position === pos && this.model.ppg[id] > (this.model.repl[pos] ?? 0),
      ).length;
      if (startable >= 3) parts.push(`they have ${startable} startable ${pos}s`);
    }
    parts.push(`their lineup ${t.opponent.delta >= 0 ? "+" : "−"}${fmt(Math.abs(t.opponent.delta))} ppg`);
    const theirSide = parts.join("; ");

    const flags: string[] = [];
    const involved = [...t.give, ...t.get].map((id) => snap.players[id]);
    const hurt = involved.filter((p) => p.injuryStatus);
    if (hurt.length) flags.push(`Depends on injured player: ${hurt.map((p) => `${p.name} (${p.injuryStatus})`).join(", ")}`);
    if (involved.some((p) => !OFFENSE.includes(p.position) && p.position !== "K" && p.position !== "DEF")) {
      flags.push("Hinges on an IDP player; IDP projections are less certain");
    }

    const { opponentId, give, get, user: u, opponent, valueToOpponent, pAccept, score } = t;
    return { opponentId, give, get, user: u, opponent, valueToOpponent, pAccept, score, opponentName: opp.name, explanation: { yourSide, theirSide }, flags };
  }
}

function compareTrades(tv: Record<string, number>) {
  const given = (t: TradeEval) => t.give.reduce((s, id) => s + tv[id], 0);
  return (a: TradeEval, b: TradeEval) =>
    b.score - a.score ||
    given(a) - given(b) ||
    a.give.length + a.get.length - (b.give.length + b.get.length);
}

/** Drop a trade when another with the same opponent beats it on both gain and acceptance. */
function dropDominated<T extends TradeEval>(trades: T[]): T[] {
  return trades.filter(
    (t) =>
      !trades.some(
        (o) =>
          o !== t &&
          o.opponentId === t.opponentId &&
          o.user.total >= t.user.total &&
          o.pAccept >= t.pAccept &&
          (o.user.total > t.user.total || o.pAccept > t.pAccept),
      ),
  );
}

/** Keep the list varied: at most 3 per opponent and 2 sending the same player. */
function diversify<T extends TradeEval>(trades: T[], limit: number): T[] {
  const perOpp = new Map<string, number>();
  const perGive = new Map<string, number>();
  const out: T[] = [];
  for (const t of trades) {
    if ((perOpp.get(t.opponentId) ?? 0) >= 3) continue;
    if (t.give.some((id) => (perGive.get(id) ?? 0) >= 2)) continue;
    out.push(t);
    perOpp.set(t.opponentId, (perOpp.get(t.opponentId) ?? 0) + 1);
    t.give.forEach((id) => perGive.set(id, (perGive.get(id) ?? 0) + 1));
    if (out.length >= limit) break;
  }
  return out;
}
