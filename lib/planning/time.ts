export const PUCK_DROP_CLOCK = "19:30";

/** "HH:MM" -> minutes since midnight. Throws on malformed input. */
export function clockToMinutesOfDay(clock: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  if (!m) throw new Error(`bad clock string: ${clock}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Normalized minutes: puck drop = 0, pre-game negative. */
export function toNormalizedMinutes(clock: string, puckDrop: string = PUCK_DROP_CLOCK): number {
  return clockToMinutesOfDay(clock) - clockToMinutesOfDay(puckDrop);
}

/** Inverse, for building display clocks from normalized arithmetic. */
export function normalizedMinutesToClock(minutes: number, puckDrop: string = PUCK_DROP_CLOCK): string {
  const total = clockToMinutesOfDay(puckDrop) + minutes;
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** "MM:SS" (game clock) -> seconds. */
export function mmssToSeconds(t: string): number {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  if (!m) throw new Error(`bad mm:ss string: ${t}`);
  return Number(m[1]) * 60 + Number(m[2]);
}
