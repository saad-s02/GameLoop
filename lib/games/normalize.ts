import { GoalieLine, NormalizedPlay, NormalizedPlaySchema, ShowcaseGame, ShowcaseGameSchema } from "../planning/schemas";
import { mmssToSeconds } from "../planning/time";

// ---------- raw NHL payload shapes (narrow: only the fields this module reads) ----------

interface RawNameDefault {
  default: string;
}

interface RawTeamRef {
  id: number;
  abbrev: string;
  placeName: RawNameDefault;
  commonName: RawNameDefault;
}

interface RawRosterSpot {
  teamId: number;
  playerId: number;
  firstName: RawNameDefault;
  lastName: RawNameDefault;
}

interface RawPeriodDescriptor {
  number: number;
  // NHL raw JSON typing note: imported via resolveJsonModule, so literal string unions widen
  // to `string`. Runtime validity is enforced by NormalizedPlaySchema.parse below.
  periodType: string;
  otPeriods?: number;
}

interface RawPlayDetails {
  eventOwnerTeamId?: number;
  scoringPlayerId?: number;
  assist1PlayerId?: number;
  assist2PlayerId?: number;
  awayScore?: number;
  homeScore?: number;
}

interface RawPlay {
  eventId: number;
  periodDescriptor: RawPeriodDescriptor;
  timeInPeriod: string;
  timeRemaining: string;
  situationCode?: string;
  typeDescKey: string;
  sortOrder: number;
  details?: RawPlayDetails;
}

interface RawGameOutcome {
  lastPeriodType: "REG" | "OT" | "SO";
  otPeriods?: number;
}

/** Fields normalizePlayByPlay reads. buildShowcaseGame needs a few more (see RawPlayByPlay below). */
interface RawPlayByPlayCore {
  regPeriods: number;
  homeTeam: RawTeamRef;
  awayTeam: RawTeamRef;
  rosterSpots: RawRosterSpot[];
  plays: RawPlay[];
}

export interface RawPlayByPlay extends RawPlayByPlayCore {
  id: number;
  gameDate: string;
  gameOutcome?: RawGameOutcome;
}

interface RawGoalieStat {
  name: RawNameDefault;
  saves: number;
  shotsAgainst: number;
  goalsAgainst: number;
  toi: string;
  starter?: boolean;
}

export interface RawBoxscore {
  awayTeam: { abbrev: string };
  homeTeam: { abbrev: string };
  playerByGameStats: {
    awayTeam: { goalies: RawGoalieStat[] };
    homeTeam: { goalies: RawGoalieStat[] };
  };
}

export interface BuildShowcaseGameOpts {
  endpoint: string;
  fetchedAt: string;
  rawBytes: { playByPlay: number; boxscore: number };
}

// ---------- strength decode (research/01 F5) ----------

const TYPE_MAP: Record<string, NormalizedPlay["type"] | undefined> = {
  goal: "goal",
  "shot-on-goal": "shot",
  penalty: "penalty",
  "period-start": "period-start",
  "period-end": "period-end",
  "shootout-attempt": "shootout-attempt",
};

/**
 * situationCode digits are [awayGoalieIn, awaySkaters, homeSkaters, homeGoalieIn].
 * EN if the opponent goalie digit is 0; else PP if own skaters > opponent skaters;
 * SH if fewer; EV if equal. extraAttacker is true when the scoring team's own goalie
 * digit is 0 and it is not EN.
 */
export function decodeStrength(code: string, scorerIsHome: boolean) {
  const awayGoalieIn = code[0] !== "0",
    awaySkaters = Number(code[1]);
  const homeSkaters = Number(code[2]),
    homeGoalieIn = code[3] !== "0";
  const my = scorerIsHome ? homeSkaters : awaySkaters;
  const opp = scorerIsHome ? awaySkaters : homeSkaters;
  const oppGoalieIn = scorerIsHome ? awayGoalieIn : homeGoalieIn;
  const myGoalieIn = scorerIsHome ? homeGoalieIn : awayGoalieIn;
  if (!oppGoalieIn) return { strength: "EN" as const, extraAttacker: false };
  if (my > opp) return { strength: "PP" as const, extraAttacker: !myGoalieIn };
  if (my < opp) return { strength: "SH" as const, extraAttacker: !myGoalieIn };
  return { strength: "EV" as const, extraAttacker: !myGoalieIn };
}

function periodLabelFor(number: number, regPeriods: number): string {
  if (number <= regPeriods) {
    const labels = ["1st", "2nd", "3rd"];
    return labels[number - 1] ?? `${number}th`;
  }
  const ot = number - regPeriods;
  return ot === 1 ? "OT" : `${ot}OT`;
}

// ---------- normalizer ----------

export function normalizePlayByPlay(raw: RawPlayByPlayCore): NormalizedPlay[] {
  const rosterNames = new Map<number, string>();
  for (const spot of raw.rosterSpots) {
    rosterNames.set(spot.playerId, `${spot.firstName.default} ${spot.lastName.default}`);
  }

  const teamAbbrevFor = (teamId: number | undefined): string | undefined => {
    if (teamId === raw.homeTeam.id) return raw.homeTeam.abbrev;
    if (teamId === raw.awayTeam.id) return raw.awayTeam.abbrev;
    return undefined;
  };

  const sorted = [...raw.plays].sort((a, b) => a.sortOrder - b.sortOrder);
  const running = { home: 0, away: 0 };
  const out: NormalizedPlay[] = [];

  for (const play of sorted) {
    const details = play.details;

    if (play.typeDescKey === "goal" && details) {
      if (typeof details.homeScore === "number") running.home = details.homeScore;
      if (typeof details.awayScore === "number") running.away = details.awayScore;
    }

    const mappedType = TYPE_MAP[play.typeDescKey];
    if (!mappedType) continue;

    const periodNumber = play.periodDescriptor.number;
    const teamId = details?.eventOwnerTeamId;
    const teamAbbrev = teamAbbrevFor(teamId);

    const normalized: NormalizedPlay = {
      eventId: play.eventId,
      sortOrder: play.sortOrder,
      type: mappedType,
      period: periodNumber,
      periodType: play.periodDescriptor.periodType as NormalizedPlay["periodType"],
      periodLabel: periodLabelFor(periodNumber, raw.regPeriods),
      clock: play.timeInPeriod,
      elapsedGameSeconds: (periodNumber - 1) * 1200 + mmssToSeconds(play.timeInPeriod),
      remainingPeriodSeconds: mmssToSeconds(play.timeRemaining),
      homeScore: running.home,
      awayScore: running.away,
      valid: true,
    };

    if (teamId !== undefined) normalized.teamId = teamId;
    if (teamAbbrev !== undefined) normalized.teamAbbrev = teamAbbrev;

    if (mappedType === "goal" && details) {
      const scorerId = details.scoringPlayerId;
      if (scorerId !== undefined) {
        normalized.scorerId = scorerId;
        const scorerName = rosterNames.get(scorerId);
        if (scorerName !== undefined) normalized.scorerName = scorerName;
      }

      const assistNames = [details.assist1PlayerId, details.assist2PlayerId]
        .filter((id): id is number => typeof id === "number")
        .map((id) => rosterNames.get(id))
        .filter((name): name is string => typeof name === "string");
      if (assistNames.length > 0) normalized.assistNames = assistNames;

      if (play.situationCode && teamId !== undefined) {
        const scorerIsHome = teamId === raw.homeTeam.id;
        const { strength, extraAttacker } = decodeStrength(play.situationCode, scorerIsHome);
        normalized.strength = strength;
        normalized.extraAttacker = extraAttacker;
      }
    }

    out.push(NormalizedPlaySchema.parse(normalized));
  }

  return out;
}

// ---------- showcase game builder ----------

export function buildShowcaseGame(rawPbp: RawPlayByPlay, rawBox: RawBoxscore, opts: BuildShowcaseGameOpts): ShowcaseGame {
  const plays = normalizePlayByPlay(rawPbp);
  const goals = plays.filter((p) => p.type === "goal");
  const lastGoal = goals[goals.length - 1];
  const finalScore = lastGoal ? { home: lastGoal.homeScore, away: lastGoal.awayScore } : { home: 0, away: 0 };

  const gameOutcome: ShowcaseGame["gameOutcome"] = {
    lastPeriodType: rawPbp.gameOutcome?.lastPeriodType ?? "REG",
  };
  if (rawPbp.gameOutcome?.otPeriods !== undefined) gameOutcome.otPeriods = rawPbp.gameOutcome.otPeriods;

  const teamRef = (t: RawTeamRef) => ({
    id: t.id,
    abbrev: t.abbrev,
    placeName: t.placeName.default,
    commonName: t.commonName.default,
  });

  const goalieLine = (g: RawGoalieStat, teamAbbrev: string): GoalieLine => ({
    name: g.name.default,
    teamAbbrev,
    saves: g.saves,
    shotsAgainst: g.shotsAgainst,
    goalsAgainst: g.goalsAgainst,
    toi: g.toi,
    starter: Boolean(g.starter),
  });

  const goalies: GoalieLine[] = [
    ...rawBox.playerByGameStats.awayTeam.goalies.map((g) => goalieLine(g, rawBox.awayTeam.abbrev)),
    ...rawBox.playerByGameStats.homeTeam.goalies.map((g) => goalieLine(g, rawBox.homeTeam.abbrev)),
  ];

  const game: ShowcaseGame = {
    gameId: String(rawPbp.id),
    source: "snapshot",
    sourceMeta: opts,
    eventDate: rawPbp.gameDate,
    homeTeam: teamRef(rawPbp.homeTeam),
    awayTeam: teamRef(rawPbp.awayTeam),
    finalScore,
    gameOutcome,
    regPeriods: rawPbp.regPeriods,
    venueId: "harbourview-arena",
    doorsOpenAt: "17:45",
    warmupStartAt: "18:40",
    puckDropAt: "19:30",
    eventOpsSource: "simulated",
    plays,
    goalies,
  };

  return ShowcaseGameSchema.parse(game);
}
