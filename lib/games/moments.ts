import { Moment, MomentPackage, MomentPackageSchema, NormalizedPlay, ShowcaseGame } from "../planning/schemas";

// ---------- scoring context ----------

export interface ScoreContext {
  goals: NormalizedPlay[]; // valid, type "goal", sorted by sortOrder ascending
  homeTeamId: number;
  awayTeamId: number;
  finalHomeScore: number;
  finalAwayScore: number;
}

/** Collects valid goals sorted by sortOrder; the only plays scoreGoal/detectRuns/detectComebackArcs ever see. */
export function buildContext(game: ShowcaseGame): ScoreContext {
  const goals = game.plays
    .filter((p) => p.valid && p.type === "goal")
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    goals,
    homeTeamId: game.homeTeam.id,
    awayTeamId: game.awayTeam.id,
    finalHomeScore: game.finalScore.home,
    finalAwayScore: game.finalScore.away,
  };
}

/**
 * The goal that put the eventual winner ahead for good: the last point at which the winner was
 * NOT strictly ahead (tied or trailing), then the first winner goal after that point. Undefined
 * when the final score is tied (synthetic-only) or there are no goals.
 */
function computeGameWinningEventId(ctx: ScoreContext): number | undefined {
  const { goals, finalHomeScore, finalAwayScore } = ctx;
  if (goals.length === 0 || finalHomeScore === finalAwayScore) return undefined;
  const winnerIsHome = finalHomeScore > finalAwayScore;
  let lastNonAheadIdx = -1;
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i]!;
    const ahead = winnerIsHome ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
    if (!ahead) lastNonAheadIdx = i;
  }
  for (let i = lastNonAheadIdx + 1; i < goals.length; i++) {
    const g = goals[i]!;
    const ahead = winnerIsHome ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
    if (ahead) return g.eventId;
  }
  return undefined;
}

function isGarbageTime(p: NormalizedPlay, ctx: ScoreContext): boolean {
  const postMargin = Math.abs(p.homeScore - p.awayScore);
  const finalMargin = Math.abs(ctx.finalHomeScore - ctx.finalAwayScore);
  return postMargin >= 3 && finalMargin >= 3;
}

/** eventIds of the goal that completes each detected comeback arc, for the +6 "completes a comeback" bonus. */
function comebackCompletionEventIds(ctx: ScoreContext): Set<number> {
  const arcs = detectComebackArcs(ctx.goals, ctx);
  return new Set(arcs.map((a) => a.completingGoal.eventId));
}

/** PRD scoring formula (ADR-004). Only valid goal plays are ever passed in by callers. */
export function scoreGoal(p: NormalizedPlay, ctx: ScoreContext): number {
  let score = 0;

  const isHome = p.teamId === ctx.homeTeamId;
  const scoringLead = isHome ? p.homeScore - p.awayScore : p.awayScore - p.homeScore;
  const finalTenOfThird = p.period === 3 && p.elapsedGameSeconds >= 3000;

  if (p.periodType === "OT") score += 10;

  const gwgId = computeGameWinningEventId(ctx);
  if (gwgId !== undefined && p.eventId === gwgId) score += 7;

  if (finalTenOfThird && scoringLead === 1) score += 7;
  if (finalTenOfThird && scoringLead === 0) score += 6;

  if (comebackCompletionEventIds(ctx).has(p.eventId)) score += 6;

  const priorSameTeam = [...ctx.goals]
    .filter((g) => g.teamId === p.teamId && g.elapsedGameSeconds < p.elapsedGameSeconds)
    .sort((a, b) => b.elapsedGameSeconds - a.elapsedGameSeconds)[0];
  if (priorSameTeam && p.elapsedGameSeconds - priorSameTeam.elapsedGameSeconds <= 180) score += 4;

  if (p.strength === "SH") score += 2;
  if (p.strength === "EN") score -= 3;
  if (isGarbageTime(p, ctx)) score -= 3;

  return score;
}

// ---------- runs ----------

export interface RunCandidate {
  teamId: number;
  members: NormalizedPlay[]; // chronological
  spanSeconds: number;
  score: number;
}

/**
 * Consecutive-goal subsequences per team (a "run" is unanswered goals: no opposing goal breaks the
 * streak). Candidates qualify at 2 goals inside 180s, or 3+ inside 300s. Only maximal candidates
 * survive here (a candidate that is a strict subset of another candidate for the same streak is
 * dropped); overlapping-but-not-subset candidates (e.g. two different 2/3-goal windows sharing one
 * member) both survive and are resolved later during greedy assembly (rule 6).
 */
export function detectRuns(goals: NormalizedPlay[]): RunCandidate[] {
  const sorted = goals.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const streaks: NormalizedPlay[][] = [];
  for (const g of sorted) {
    const last = streaks[streaks.length - 1];
    if (last && last[last.length - 1]!.teamId === g.teamId) {
      last.push(g);
    } else {
      streaks.push([g]);
    }
  }

  const candidates: RunCandidate[] = [];
  for (const streak of streaks) {
    if (streak.length < 2) continue;
    const teamId = streak[0]!.teamId!;

    const windows: NormalizedPlay[][] = [];
    for (let start = 0; start < streak.length; start++) {
      for (let end = start + 1; end < streak.length; end++) {
        const window = streak.slice(start, end + 1);
        const span = window[window.length - 1]!.elapsedGameSeconds - window[0]!.elapsedGameSeconds;
        const count = window.length;
        const qualifies = (count === 2 && span <= 180) || (count >= 3 && span <= 300);
        if (qualifies) windows.push(window);
      }
    }

    const maximal = windows.filter((w, i) => {
      const wIds = new Set(w.map((x) => x.eventId));
      return !windows.some((other, j) => {
        if (i === j) return false;
        const oIds = new Set(other.map((x) => x.eventId));
        if (oIds.size <= wIds.size) return false;
        for (const id of wIds) if (!oIds.has(id)) return false;
        return true; // w is a strict subset of other
      });
    });

    for (const w of maximal) {
      const span = w[w.length - 1]!.elapsedGameSeconds - w[0]!.elapsedGameSeconds;
      const limit = w.length === 2 ? 180 : 300;
      const score = 4 * w.length + (limit - span) / 30;
      candidates.push({ teamId, members: w, spanSeconds: span, score });
    }
  }

  return candidates;
}

// ---------- comeback arcs ----------

export interface ComebackArc {
  teamId: number;
  deficit: number; // positive magnitude
  members: NormalizedPlay[]; // team T's goals from first-after-max-deficit through the completing goal
  completingGoal: NormalizedPlay;
  outcome: "won" | "led" | "fell-short" | "tied";
}

function computeArcOutcome(
  teamId: number,
  completingGoal: NormalizedPlay,
  sorted: NormalizedPlay[],
  ctx: ScoreContext,
): "won" | "led" | "fell-short" | "tied" {
  const isHome = teamId === ctx.homeTeamId;
  const teamFinal = isHome ? ctx.finalHomeScore : ctx.finalAwayScore;
  const oppFinal = isHome ? ctx.finalAwayScore : ctx.finalHomeScore;
  if (teamFinal > oppFinal) return "won";
  if (teamFinal === oppFinal) return "tied"; // reserved for synthetic data
  const startIdx = sorted.findIndex((g) => g.eventId === completingGoal.eventId);
  for (let i = startIdx; i < sorted.length; i++) {
    const g = sorted[i]!;
    const teamLead = isHome ? g.homeScore - g.awayScore : g.awayScore - g.homeScore;
    if (teamLead > 0) return "led";
  }
  return "fell-short";
}

/**
 * For each team, tracks that team's score differential across the whole valid-goal sequence.
 * Whenever the running minimum differential reaches -2 or worse and later recovers to >= 0, that
 * is a comeback arc: members are the team's own goals from the first goal after the (earliest)
 * point of maximum deficit through the recovery (tying or go-ahead) goal. The episode resets at
 * the recovery point so a later, independent deficit can produce a second arc.
 */
export function detectComebackArcs(goals: NormalizedPlay[], ctx: ScoreContext): ComebackArc[] {
  const sorted = goals.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const teamIds = Array.from(new Set(sorted.map((g) => g.teamId).filter((t): t is number => t !== undefined)));

  const arcs: ComebackArc[] = [];
  for (const teamId of teamIds) {
    let diff = 0;
    let episodeMin = 0;
    let episodeMinIdx = -1;
    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i]!;
      diff += g.teamId === teamId ? 1 : -1;
      if (diff < episodeMin) {
        episodeMin = diff;
        episodeMinIdx = i;
      }
      if (episodeMin <= -2 && diff >= 0) {
        const members = sorted.slice(episodeMinIdx + 1, i + 1).filter((x) => x.teamId === teamId);
        const deficit = -episodeMin;
        const outcome = computeArcOutcome(teamId, g, sorted, ctx);
        arcs.push({ teamId, deficit, members, completingGoal: g, outcome });
        episodeMin = diff;
        episodeMinIdx = i;
      }
    }
  }
  return arcs;
}

// ---------- assembly ----------

interface MomentDraft {
  id: string;
  type: Moment["type"];
  score: number;
  headline: string;
  teamAbbrev?: string;
  outcome?: "won" | "led" | "fell-short" | "tied";
  members: NormalizedPlay[];
  childRuns?: { spanSeconds: number; memberEventIds: number[] }[];
  swingProxy: number;
  repElapsed: number;
  representativeEventId?: number;
}

function swingProxy(play: NormalizedPlay): number {
  return 3 - Math.min(2, Math.abs(play.homeScore - play.awayScore));
}

function pickRepresentative(members: NormalizedPlay[], ctx: ScoreContext): NormalizedPlay {
  let best = members[0]!;
  for (let i = 1; i < members.length; i++) {
    const m = members[i]!;
    const bestScore = scoreGoal(best, ctx);
    const mScore = scoreGoal(m, ctx);
    if (mScore > bestScore || (mScore === bestScore && m.elapsedGameSeconds > best.elapsedGameSeconds)) {
      best = m;
    }
  }
  return best;
}

function teamRef(game: ShowcaseGame, teamId: number | undefined) {
  if (teamId === undefined) return undefined;
  if (teamId === game.homeTeam.id) return game.homeTeam;
  if (teamId === game.awayTeam.id) return game.awayTeam;
  return undefined;
}

function compareDrafts(a: MomentDraft, b: MomentDraft): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.swingProxy !== a.swingProxy) return b.swingProxy - a.swingProxy;
  if (b.repElapsed !== a.repElapsed) return b.repElapsed - a.repElapsed;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function buildScoreLine(game: ShowcaseGame): string {
  const homeWon = game.finalScore.home > game.finalScore.away;
  const winner = homeWon ? game.homeTeam : game.awayTeam;
  const loser = homeWon ? game.awayTeam : game.homeTeam;
  const winnerScore = homeWon ? game.finalScore.home : game.finalScore.away;
  const loserScore = homeWon ? game.finalScore.away : game.finalScore.home;
  const ot = game.gameOutcome.lastPeriodType !== "REG";
  const otLabel =
    game.gameOutcome.lastPeriodType === "SO"
      ? "SO"
      : game.gameOutcome.otPeriods && game.gameOutcome.otPeriods >= 2
        ? `${game.gameOutcome.otPeriods}OT`
        : "OT";
  return `${winner.abbrev} ${winnerScore}, ${loser.abbrev} ${loserScore}${ot ? ` (${otLabel})` : ""}`;
}

function trimPackage(pkg: MomentPackage, repMap: Map<string, number | undefined>): MomentPackage {
  let size = JSON.stringify(pkg).length;
  if (size <= 11000) return pkg;

  let next: MomentPackage = {
    ...pkg,
    moments: pkg.moments.map((m) => ({ ...m, assistNames: undefined })),
  };
  size = JSON.stringify(next).length;
  if (size <= 11000) return next;

  next = {
    ...next,
    moments: next.moments.map((m) => {
      const repId = repMap.get(m.id);
      return {
        ...m,
        memberPlays: m.memberPlays.map((mp) => (mp.eventId === repId ? mp : { ...mp, scorerName: undefined })),
      };
    }),
  };
  return next;
}

/** Builds the ranked top-3 moment package for a game, per ADR-004. */
export function buildMomentPackage(game: ShowcaseGame): MomentPackage {
  const ctx = buildContext(game);
  const claimed = new Set<number>();
  const drafts: MomentDraft[] = [];
  const repMap = new Map<string, number | undefined>();

  // 1. OT winner (the game-winning goal, when it was scored in overtime).
  const gwgId = computeGameWinningEventId(ctx);
  const otWinnerGoal = gwgId !== undefined ? ctx.goals.find((g) => g.eventId === gwgId && g.periodType === "OT") : undefined;
  if (otWinnerGoal) {
    claimed.add(otWinnerGoal.eventId);
    const team = teamRef(game, otWinnerGoal.teamId);
    const id = `ot-winner:${otWinnerGoal.eventId}`;
    drafts.push({
      id,
      type: "ot-winner",
      score: scoreGoal(otWinnerGoal, ctx) + 5,
      headline: `${otWinnerGoal.scorerName ?? "Unknown"} wins it at ${otWinnerGoal.clock} of ${otWinnerGoal.periodLabel}`,
      teamAbbrev: team?.abbrev,
      members: [otWinnerGoal],
      swingProxy: swingProxy(otWinnerGoal),
      repElapsed: otWinnerGoal.elapsedGameSeconds,
      representativeEventId: otWinnerGoal.eventId,
    });
    repMap.set(id, otWinnerGoal.eventId);
  }

  // 2. Comeback arcs, highest group score first; a run whose members are wholly inside an arc's
  // span attaches as a childRun instead of standing alone later.
  const allRuns = detectRuns(ctx.goals);
  const arcs = detectComebackArcs(ctx.goals, ctx).sort(
    (a, b) => 6 + scoreGoal(b.completingGoal, ctx) - (6 + scoreGoal(a.completingGoal, ctx)),
  );
  for (const arc of arcs) {
    if (arc.members.length === 0 || arc.members.some((m) => claimed.has(m.eventId))) continue;
    const memberIds = new Set(arc.members.map((m) => m.eventId));
    for (const m of arc.members) claimed.add(m.eventId);

    const sortedMembers = arc.members.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const rep = pickRepresentative(arc.members, ctx);
    const team = teamRef(game, arc.teamId);
    const firstEventId = sortedMembers[0]!.eventId;
    const id = `comeback-arc:${firstEventId}`;
    const childRuns = allRuns
      .filter((r) => r.teamId === arc.teamId && r.members.every((rm) => memberIds.has(rm.eventId)))
      .map((r) => ({
        spanSeconds: r.spanSeconds,
        memberEventIds: r.members.map((m) => m.eventId).sort((a, b) => a - b),
      }));
    const maxMemberScore = Math.max(...arc.members.map((m) => scoreGoal(m, ctx)));

    drafts.push({
      id,
      type: "comeback-arc",
      score: 6 + maxMemberScore,
      headline: `${team?.placeName ?? "Team"} erase a ${arc.deficit}-goal deficit${
        arc.outcome === "fell-short" ? " but fall short" : arc.outcome === "won" ? " and win" : ""
      }`,
      teamAbbrev: team?.abbrev,
      outcome: arc.outcome,
      members: sortedMembers,
      childRuns: childRuns.length ? childRuns : undefined,
      swingProxy: swingProxy(rep),
      repElapsed: rep.elapsedGameSeconds,
      representativeEventId: rep.eventId,
    });
    repMap.set(id, rep.eventId);
  }

  // 3. Remaining runs, claimed greedily by group score; a candidate that loses a member to an
  // earlier moment is shrunk, and dropped once it falls below 2 members.
  const remainingRuns = allRuns.slice();
  for (;;) {
    const processed = remainingRuns
      .map((r) => {
        const freeMembers = r.members.filter((m) => !claimed.has(m.eventId));
        if (freeMembers.length < 2) return undefined;
        const span = freeMembers[freeMembers.length - 1]!.elapsedGameSeconds - freeMembers[0]!.elapsedGameSeconds;
        const limit = freeMembers.length === 2 ? 180 : 300;
        const score = 4 * freeMembers.length + (limit - span) / 30;
        return { original: r, freeMembers, span, score };
      })
      .filter((x): x is NonNullable<typeof x> => x !== undefined);
    if (processed.length === 0) break;
    processed.sort((a, b) => b.score - a.score);
    const top = processed[0]!;

    for (const m of top.freeMembers) claimed.add(m.eventId);
    const sortedMembers = top.freeMembers.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const rep = pickRepresentative(top.freeMembers, ctx);
    const team = teamRef(game, top.original.teamId);
    const firstEventId = sortedMembers[0]!.eventId;
    const id = `scoring-run:${firstEventId}`;
    const mm = Math.floor(top.span / 60);
    const ss = String(top.span % 60).padStart(2, "0");

    drafts.push({
      id,
      type: "scoring-run",
      score: top.score,
      headline: `${team?.placeName ?? "Team"} score ${top.freeMembers.length} in ${mm}:${ss}`,
      teamAbbrev: team?.abbrev,
      members: sortedMembers,
      swingProxy: swingProxy(rep),
      repElapsed: rep.elapsedGameSeconds,
      representativeEventId: rep.eventId,
    });
    repMap.set(id, rep.eventId);

    const consumedIdx = remainingRuns.indexOf(top.original);
    if (consumedIdx >= 0) remainingRuns.splice(consumedIdx, 1);
  }

  // 4. Remaining standalone goals.
  for (const g of ctx.goals) {
    if (claimed.has(g.eventId)) continue;
    claimed.add(g.eventId);
    const team = teamRef(game, g.teamId);
    const id = `goal:${g.eventId}`;
    drafts.push({
      id,
      type: "goal",
      score: scoreGoal(g, ctx),
      headline: `${g.scorerName ?? "Unknown"} scores (${g.strength ?? "EV"})`,
      teamAbbrev: team?.abbrev,
      members: [g],
      swingProxy: swingProxy(g),
      repElapsed: g.elapsedGameSeconds,
      representativeEventId: g.eventId,
    });
    repMap.set(id, g.eventId);
  }

  // 5. Goalie-performance moments: boxscore-derived, never fabricated from a shutout without save
  // counts, no member plays. Never claim/consume plays.
  for (const gl of game.goalies) {
    if (gl.saves < 35) continue;
    const score = 10 + (gl.saves - 35) * 0.5;
    const id = `goalie-performance:${gl.name.replace(/ /g, "-")}`;
    drafts.push({
      id,
      type: "goalie-performance",
      score,
      headline: `${gl.name} stops ${gl.saves} of ${gl.shotsAgainst}`,
      teamAbbrev: gl.teamAbbrev,
      members: [],
      swingProxy: 0,
      repElapsed: -Infinity,
      representativeEventId: undefined,
    });
    repMap.set(id, undefined);
  }

  drafts.sort(compareDrafts);
  const top3 = drafts.slice(0, 3);

  const moments: Moment[] = top3.map((d, i) => {
    const assistNames = d.members.flatMap((m) => m.assistNames ?? []);
    return {
      id: d.id,
      type: d.type,
      rank: i + 1,
      score: d.score,
      headline: d.headline,
      teamAbbrev: d.teamAbbrev,
      outcome: d.outcome,
      memberPlays: d.members.map((m) => ({
        eventId: m.eventId,
        periodLabel: m.periodLabel,
        clock: m.clock,
        scorerName: m.scorerName,
        scoreAfter: `${game.homeTeam.abbrev} ${m.homeScore}, ${game.awayTeam.abbrev} ${m.awayScore}`,
      })),
      childRuns: d.childRuns,
      assistNames: assistNames.length ? assistNames : undefined,
    };
  });

  const pkg: MomentPackage = {
    gameId: game.gameId,
    scoreLine: buildScoreLine(game),
    gameOutcome: game.gameOutcome,
    moments,
  };

  return MomentPackageSchema.parse(trimPackage(pkg, repMap));
}
