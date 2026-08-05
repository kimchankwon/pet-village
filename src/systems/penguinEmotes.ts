/**
 * Club Penguin moves available from the N key menu (and the Moves chip).
 *
 * Dance / wave / sit are harvested from the existing dance sheet art family so
 * they share scale and colour with the walk plates. Breakdance and hip hop come
 * from Tenor GIFs processed into the same 220×214 dance-style cells.
 */

export const PENGUIN_EMOTES = ['dance', 'wave', 'breakdance', 'sit', 'hiphop'] as const;
export type PenguinEmote = (typeof PENGUIN_EMOTES)[number];

export function isPenguinEmote(value: unknown): value is PenguinEmote {
  return typeof value === 'string' && (PENGUIN_EMOTES as readonly string[]).includes(value);
}

export type PenguinEmoteConfig = {
  id: PenguinEmote;
  /** Menu / chip label. */
  label: string;
  /** Local Phaser texture key (recoloured in pixelart). */
  localTextureKey: string;
  /** Boot plate sheet key. */
  plateSheetKey: string;
  frameCount: number;
  /** ms per frame. */
  frameMs: number;
  /** Loop until cancelled (sit/dance/breakdance/hiphop). Wave is one-shot. */
  loop: boolean;
  /**
   * Cells use dance-style registration (body does not fill the full height).
   * Draw with configureDancePenguin so size matches the idle plant.
   */
  danceScale: boolean;
};

/**
 * Frame / timing contracts for each move. Sheet builders and runtime share these
 * numbers so a re-export cannot silently desync playback.
 */
export const PENGUIN_EMOTE_CONFIG: Record<PenguinEmote, PenguinEmoteConfig> = {
  dance: {
    id: 'dance',
    label: 'Dance',
    localTextureKey: 'penguin-dance',
    plateSheetKey: 'penguin-plate-dance-sheet',
    frameCount: 76,
    frameMs: 100,
    loop: true,
    danceScale: true,
  },
  wave: {
    id: 'wave',
    label: 'Wave',
    localTextureKey: 'penguin-wave',
    plateSheetKey: 'penguin-plate-wave-sheet',
    // First flipper-raise gesture only (dance f40–f41), repeated slowly.
    frameCount: 8,
    frameMs: 160,
    loop: false,
    danceScale: true,
  },
  breakdance: {
    id: 'breakdance',
    label: 'Breakdance',
    localTextureKey: 'penguin-breakdance',
    plateSheetKey: 'penguin-plate-breakdance-sheet',
    frameCount: 22,
    frameMs: 80,
    loop: true,
    danceScale: true,
  },
  sit: {
    id: 'sit',
    label: 'Sit',
    localTextureKey: 'penguin-sit',
    plateSheetKey: 'penguin-plate-sit-sheet',
    // Two identical cells — Phaser is happier with a multi-frame sheet than a 1×1.
    frameCount: 2,
    frameMs: 200,
    loop: true,
    danceScale: true,
  },
  hiphop: {
    id: 'hiphop',
    label: 'Hip hop',
    localTextureKey: 'penguin-hiphop',
    plateSheetKey: 'penguin-plate-hiphop-sheet',
    frameCount: 43,
    frameMs: 40,
    loop: true,
    danceScale: true,
  },
};

/** Menu order (N / Moves chip). */
export const PENGUIN_EMOTE_MENU: readonly PenguinEmote[] = [
  'dance',
  'wave',
  'breakdance',
  'sit',
  'hiphop',
];

/**
 * Wave one-shot: only the first flipper-raise pair from the dance medley
 * (f40–f41), repeated four times. Later dance frames go into a sit / other-side
 * wave and are deliberately excluded.
 */
export const WAVE_FROM_DANCE_FRAMES = [40, 41, 40, 41, 40, 41, 40, 41] as const;

/**
 * Dance sheet index for sit — f34 is the seated plant with feet forward
 * (f35 is a standing pose and looked like “sit does nothing”).
 */
export const SIT_FROM_DANCE_FRAME = 34;

export function remotePenguinEmoteTextureKey(emote: PenguinEmote, color: string) {
  const safe = color && color.length > 0 ? color : 'blue';
  return `penguin-remote-${safe}-${emote}`;
}

/**
 * Frame index for an emote after `elapsedMs`. One-shots return null when done;
 * loops always return a valid index.
 */
export function emoteAnimationFrame(
  emote: PenguinEmote,
  elapsedMs: number,
): number | null {
  const cfg = PENGUIN_EMOTE_CONFIG[emote];
  if (elapsedMs < 0) return 0;
  const index = Math.floor(elapsedMs / cfg.frameMs);
  if (cfg.loop) return index % cfg.frameCount;
  if (index < 0 || index >= cfg.frameCount) return null;
  return index;
}

/** True when this Phaser texture is a dance-scale emote sheet. */
export function isPenguinEmoteTexture(key: string): boolean {
  if (key === 'penguin-wave' || key === 'penguin-dance') return true;
  if (key === 'penguin-breakdance' || key === 'penguin-sit' || key === 'penguin-hiphop') return true;
  return /penguin-remote-[^-]+-(dance|wave|breakdance|sit|hiphop)$/.test(key);
}
