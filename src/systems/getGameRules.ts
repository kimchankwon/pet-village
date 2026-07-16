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
  noteIntervalJitterMs: number;
  poopDelayMs: number;
  poopDelayJitterMs: number;
  poopGap: readonly [minNotes: number, maxNotes: number];
  notesToClear: number;
};

/** Completion rewards rise with Get's difficulty, matching Bump's economy curve. */
export const GET_WIN_REWARDS: Record<GetDifficulty, { coins: number; happiness: number }> = {
  easy: { coins: 6, happiness: 5 },
  normal: { coins: 14, happiness: 9 },
  hard: { coins: 26, happiness: 14 },
};

/** Energy paid at the start of every Get track. */
export const GET_ENERGY_COST: Record<GetDifficulty, number> = {
  easy: 5,
  normal: 8,
  hard: 12,
};

export const GET_PLAYER_SPEED = 360;
export const GET_TAP_DISTANCE = 90;
/** Half-width of the unscaled bowl artwork. */
export const GET_BOWL_BASE_HALF_WIDTH = 36;
/** Actual bowl catch radius: Easy is widest, Normal is medium, Hard is narrowest. */
export const GET_CATCH_HALF_WIDTH: Record<GetDifficulty, number> = {
  easy: 58,
  normal: 42,
  hard: 26,
};

export function getGetBowlScaleX(difficulty: GetDifficulty): number {
  return GET_CATCH_HALF_WIDTH[difficulty] / GET_BOWL_BASE_HALF_WIDTH;
}
export const GET_POOP_HALF_WIDTH = 18;
export const GET_SAFE_MARGIN = 14;

export const GET_NOTE_TEXTURES = [
  'music-note-crotchet',
  'music-note-quaver',
  'music-note-double-quaver',
] as const;

/** Pick one of the three colourful note silhouettes for a falling note. */
export function getGetNoteTexture(random: () => number = Math.random): string {
  const index = Math.min(
    GET_NOTE_TEXTURES.length - 1,
    Math.floor(random() * GET_NOTE_TEXTURES.length),
  );
  return GET_NOTE_TEXTURES[index]!;
}

export function getGetDodgeDistance(difficulty: GetDifficulty): number {
  return GET_CATCH_HALF_WIDTH[difficulty] + GET_POOP_HALF_WIDTH + GET_SAFE_MARGIN + 44;
}

/** Distance the catcher can cover during the same elapsed time used by the track clock. */
export function getGetTravelDistance(elapsedMs: number): number {
  return (GET_PLAYER_SPEED * Math.max(0, elapsedMs)) / 1000;
}

export const GET_DIFFICULTIES: Record<GetDifficulty, GetDifficultyConfig> = {
  easy: {
    label: 'Easy',
    fallSpeed: 150,
    firstArrivalMs: 3400,
    noteIntervalMs: 1080,
    noteIntervalJitterMs: 220,
    poopDelayMs: 720,
    poopDelayJitterMs: 110,
    poopGap: [2, 4],
    notesToClear: 18,
  },
  normal: {
    label: 'Normal',
    fallSpeed: 205,
    firstArrivalMs: 2700,
    noteIntervalMs: 900,
    noteIntervalJitterMs: 180,
    poopDelayMs: 580,
    poopDelayJitterMs: 85,
    poopGap: [1, 3],
    notesToClear: 22,
  },
  hard: {
    label: 'Hard',
    fallSpeed: 270,
    firstArrivalMs: 2200,
    noteIntervalMs: 760,
    noteIntervalJitterMs: 140,
    poopDelayMs: 500,
    poopDelayJitterMs: 65,
    poopGap: [1, 2],
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

function randomBetween(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

function randomPoopGap(
  random: () => number,
  [minNotes, maxNotes]: GetDifficultyConfig['poopGap'],
): number {
  return minNotes + Math.floor(random() * (maxNotes - minNotes + 1));
}

/**
 * Builds a complete Get track in arrival-time order.
 *
 * The schedule carries a known-safe route. Notes are placed within the
 * distance the catcher can travel, and poop aims near the previous catch only
 * after there is enough time to reach `escapeX`. Timing, positions, and poop
 * gaps vary while keeping that safe route intact.
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
  let noteArrivalMs = cfg.firstArrivalMs;
  let notesUntilPoop = randomPoopGap(random, cfg.poopGap);
  const dodgeDistance = getGetDodgeDistance(difficulty);

  for (let noteIndex = 0; noteIndex < cfg.notesToClear; noteIndex++) {
    const arrivalMs = noteArrivalMs;
    const travelMs = Math.max(0, arrivalMs - safeAtMs);
    // Leave 18% movement headroom for reaction time and imperfect input.
    const maxTravel = Math.max(20, getGetTravelDistance(travelMs) * 0.82);
    const noteX = randomBetween(
      random,
      Math.max(options.minX, safeX - maxTravel),
      Math.min(options.maxX, safeX + maxTravel),
    );

    events.push({
      kind: 'note',
      x: noteX,
      arrivalMs,
      spawnMs: arrivalMs - fallMs,
    });
    safeX = noteX;
    safeAtMs = arrivalMs;
    noteArrivalMs +=
      cfg.noteIntervalMs +
      randomBetween(random, -cfg.noteIntervalJitterMs, cfg.noteIntervalJitterMs);

    notesUntilPoop--;
    if (notesUntilPoop > 0) continue;
    notesUntilPoop = randomPoopGap(random, cfg.poopGap);

    const poopX = clamp(
      noteX + randomBetween(random, -GET_POOP_HALF_WIDTH, GET_POOP_HALF_WIDTH),
      options.minX,
      options.maxX,
    );

    const roomLeft = poopX - options.minX;
    const roomRight = options.maxX - poopX;
    const preferredDirection = random() < 0.5 ? -1 : 1;
    const direction =
      preferredDirection < 0
        ? roomLeft >= dodgeDistance
          ? -1
          : 1
        : roomRight >= dodgeDistance
          ? 1
          : -1;
    const escapeX = clamp(
      noteX + direction * dodgeDistance,
      options.minX,
      options.maxX,
    );
    const poopArrivalMs =
      arrivalMs +
      cfg.poopDelayMs +
      randomBetween(random, -cfg.poopDelayJitterMs, cfg.poopDelayJitterMs);
    events.push({
      kind: 'poop',
      x: poopX,
      arrivalMs: poopArrivalMs,
      spawnMs: poopArrivalMs - fallMs,
      escapeX,
    });
    safeX = escapeX;
    safeAtMs = poopArrivalMs;
  }

  return events.sort((a, b) => a.spawnMs - b.spawnMs);
}
