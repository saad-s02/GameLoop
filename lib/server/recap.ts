import { loadShowcaseGame } from "../data/load";
import { buildMomentPackage } from "../games/moments";
import {
  GameMemory,
  GameMemorySchema,
  MomentPackage,
  MomentPackageSchema,
  SessionContext,
  SessionContextSchema,
} from "../planning/schemas";

/** Showcase game B: the pinned OT winner used for the warmup ping and, incidentally, this module's tests. */
const WARMUP_GAME_ID = "2025030313";

export interface ResolvedSession {
  session: SessionContext | null;
  /** True when a sessionContext value was present but failed schema, expiry, or plannedGameId checks. */
  dropped: boolean;
}

/**
 * Re-validates an unknown sessionContext payload against SessionContextSchema, plus expiry and
 * `plannedGameId === gameId`. Invalid or stale memory is dropped (never fatal): the caller emits a
 * fallback_used trace event and proceeds with a general (non-personalized) recap.
 */
export function resolveSessionContext(raw: unknown, gameId: string): ResolvedSession {
  if (raw === undefined || raw === null) return { session: null, dropped: false };

  const parsed = SessionContextSchema.safeParse(raw);
  if (!parsed.success) return { session: null, dropped: true };

  const session = parsed.data;
  if (session.plannedGameId !== gameId) return { session: null, dropped: true };

  const expiresAtMs = Date.parse(session.expiresAt);
  if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) return { session: null, dropped: true };

  return { session, dropped: false };
}

/**
 * Deterministic, code-built GameMemory used in demo mode and as the fallback when the narrative
 * model call fails. Built entirely from the package's own code-built headlines and scoreLine, so
 * `scoreLine` matches verbatim by construction.
 */
export function buildDeterministicRecap(pkg: MomentPackage, session: SessionContext | null): GameMemory {
  const top = pkg.moments[0]!;
  const headline = `${pkg.scoreLine}: ${top.headline}`.slice(0, 160);
  const momentBlurbs = pkg.moments.map((m) => ({ momentId: m.id, text: m.headline.slice(0, 300) }));
  const reflection = "A night worth remembering at Harbourview Arena, built from the real play-by-play. (Deterministic summary; the narrative model was unavailable.)".slice(0, 300);
  const copyText = `${pkg.scoreLine} -- ${pkg.moments.map((m) => m.headline).join(" ")}`.slice(0, 600);

  const memory: GameMemory = { headline, scoreLine: pkg.scoreLine, momentBlurbs, reflection, copyText };
  if (session) {
    memory.yourNight = `Your saved plan had you seated in ${session.seatSection ?? "your section"}, with a group of ${
      session.party.adults + session.party.children
    }. (Deterministic summary; the narrative model was unavailable.)`.slice(0, 400);
  }
  return GameMemorySchema.parse(memory);
}

/** A minimal one-moment package (showcase game B's pinned OT winner) for the /api/warmup ping. */
export function buildWarmupMomentPackage(): MomentPackage {
  const game = loadShowcaseGame(WARMUP_GAME_ID);
  const full = buildMomentPackage(game);
  const otWinner = full.moments.find((m) => m.type === "ot-winner") ?? full.moments[0]!;
  return MomentPackageSchema.parse({
    gameId: full.gameId,
    scoreLine: full.scoreLine,
    gameOutcome: full.gameOutcome,
    moments: [{ ...otWinner, rank: 1 }],
  });
}
