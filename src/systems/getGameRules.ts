export type GetDifficulty = 'easy' | 'normal' | 'hard';

export type GetEvent = {
  kind: 'note' | 'poop';
  x: number;
  /** Time when the object reaches the bowl line. */
  arrivalMs: number;
  /** Time when the object enters at the top of the playfield. */
  spawnMs: number;
  /** A tested, reachable safe position after this poop passes. */
  escapeX?: number;
};

export type GetDifficultyConfig = {
  label: string;
  fallSpeed: number;
  firstArrivalMs: number;
  noteIntervalMs: number;
  poopDelayMs: number;
  poopEvery: number;
  notesToClear: number;
};

export const GET_PLAYER_SPEED = 360;
export const GET_TAP_DISTANCE = 90;
export const GET_CATCH_HALF_WIDTH = 36;
export const GET_POOP_HALF_WIDTH = 18;
export const GET_SAFE_MARGIN = 14;
export const GET_DODGE_DISTANCE =
  GET_CATCH_HALF_WIDTH + GET_POOP_HALF_WIDTH + GET_SAFE_MARGIN + 44;

export const GET_DIFFICULTIES: Record<GetDifficulty, GetDifficultyConfig> = {
  easy: {
    label: 'Easy',
    fallSpeed: 150,
    firstArrivalMs: 3400,
    noteIntervalMs: 1080,
    poopDelayMs: 720,
    poopEvery: 3,
    notesToClear: 18,
  },
  normal: {
    label: 'Normal',
    fallSpeed: 205,
    firstArrivalMs: 2700,
    noteIntervalMs: 900,
    poopDelayMs: 580,
    poopEvery: 2,
    notesToClear: 22,
  },
  hard: {
    label: 'Hard',
    fallSpeed: 270,
    firstArrivalMs: 2200,
    noteIntervalMs: 760,
    poopDelayMs: 500,
    poopEvery: 1,
    notesToClear: 26,
  },
};

type BuildOptions = {
  minX: number;
  maxX: number;
  spawnY: number;
  catchY: number;
  random?: () => number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Builds a complete Get track in arrival-time order.
 *
 * The schedule carries a known-safe route. Notes are placed within the
 * distance the catcher can travel, and poop always lands where the previous
 * note was caught only after there is enough time to reach `escapeX`.
 */
export function buildGetTrack(
  difficulty: GetDifficulty,
  options: BuildOptions,
): GetEvent[] {
  const cfg = GET_DIFFICULTIES[difficulty];
  const random = options.random ?? Math.random;
  const fallMs = ((options.catchY - options.spawnY) / cfg.fallSpeed) * 1000;
  const events: GetEvent[] = [];

  let safeX = (options.minX + options.maxX) / 2;
  let safeAtMs = 0;

  for (let noteIndex = 0; noteIndex < cfg.notesToClear; noteIndex++) {
    const arrivalMs = cfg.firstArrivalMs + noteIndex * cfg.noteIntervalMs;
    const travelMs = Math.max(0, arrivalMs - safeAtMs);
    // Leave 18% movement headroom for reaction time and imperfect input.
    const maxTravel = Math.max(20, (GET_PLAYER_SPEED * travelMs * 0.82) / 1000);
    const centeredRandom = random() * 2 - 1;
    const noteX = clamp(safeX + centeredRandom * maxTravel, options.minX, options.maxX);

    events.push({
      kind: 'note',
      x: noteX,
      arrivalMs,
      spawnMs: arrivalMs - fallMs,
    });
    safeX = noteX;
    safeAtMs = arrivalMs;

    if ((noteIndex + 1) % cfg.poopEvery !== 0) continue;

    const roomLeft = noteX - options.minX;
    const roomRight = options.maxX - noteX;
    const preferredDirection = random() < 0.5 ? -1 : 1;
    const direction =
      preferredDirection < 0
        ? roomLeft >= GET_DODGE_DISTANCE
          ? -1
          : 1
        : roomRight >= GET_DODGE_DISTANCE
          ? 1
          : -1;
    const escapeX = clamp(
      noteX + direction * GET_DODGE_DISTANCE,
      options.minX,
      options.maxX,
    );
    const poopArrivalMs = arrivalMs + cfg.poopDelayMs;
    events.push({
      kind: 'poop',
      x: noteX,
      arrivalMs: poopArrivalMs,
      spawnMs: poopArrivalMs - fallMs,
      escapeX,
    });
    safeX = escapeX;
    safeAtMs = poopArrivalMs;
  }

  return events.sort((a, b) => a.spawnMs - b.spawnMs);
}
