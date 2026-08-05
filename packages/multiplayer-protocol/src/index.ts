import { MapSchema, Schema, defineTypes } from '@colyseus/schema';

export const PROTOCOL_VERSION = 12 as const;
export const TICKET_ISSUER = 'pet-village-convex';
export const TICKET_AUDIENCE = 'pet-village-multiplayer';
export const ROOM_NAME = 'town_default';
export const SLED_RUN_ROOM = 'sled_run';
/** Expanded ice-town hub (32×22 tiles × 48px). */
export const TOWN_BOUNDS = { width: 32 * 48, height: 22 * 48 } as const;
export const WORLD_SCENES = [
  'town',
  'shore',
  'west-green',
  'east-green',
  'daniels-shop',
  'cafe-cinnamon',
] as const;
export type WorldScene = (typeof WORLD_SCENES)[number];
export const WORLD_SCENE_BOUNDS: Record<WorldScene, { readonly width: number; readonly height: number }> = {
  town: TOWN_BOUNDS,
  shore: { width: 24 * 48, height: 16 * 48 },
  'west-green': { width: 24 * 48, height: 16 * 48 },
  'east-green': { width: 24 * 48, height: 16 * 48 },
  'daniels-shop': { width: 12 * 48, height: 13 * 48 },
  'cafe-cinnamon': { width: 12 * 48, height: 13 * 48 },
};
type WorldSpawn = { readonly x: number; readonly y: number };
export const WORLD_SCENE_NAMED_SPAWNS = {
  town: {
    // Plaza south of the ice fountain (tile 16, 14.5).
    default: { x: 16 * 48, y: 14.5 * 48 },
    house: { x: 16 * 48, y: 7.2 * 48 },
    west: { x: 1.6 * 48, y: 10.5 * 48 },
    east: { x: 30.4 * 48, y: 10.5 * 48 },
    shop: { x: 26 * 48, y: 7.6 * 48 },
    cafe: { x: 6 * 48, y: 7.6 * 48 },
    shore: { x: 16 * 48, y: 20.5 * 48 },
  },
  shore: {
    default: { x: 12 * 48, y: 2.2 * 48 },
    fishing: { x: 12 * 48, y: 8.5 * 48 },
    town: { x: 12 * 48, y: 2.2 * 48 },
  },
  'west-green': {
    default: { x: 22 * 48, y: 7.5 * 48 },
    town: { x: 22 * 48, y: 7.5 * 48 },
    skiprope: { x: 5 * 48, y: 4.5 * 48 },
    bump: { x: 12 * 48, y: 4.5 * 48 },
    'sled-run': { x: 19 * 48, y: 4.5 * 48 },
  },
  'east-green': {
    default: { x: 2 * 48, y: 7.5 * 48 },
    town: { x: 2 * 48, y: 7.5 * 48 },
    arcade: { x: 7 * 48, y: 4.5 * 48 },
    get: { x: 16 * 48, y: 4.5 * 48 },
    expedition: { x: 21 * 48, y: 4.5 * 48 },
  },
  'daniels-shop': { default: { x: 288, y: 498 } },
  'cafe-cinnamon': { default: { x: 288, y: 498 } },
} as const satisfies Record<WorldScene, Record<string, WorldSpawn>>;

export function worldSceneSpawn(scene: WorldScene, name = 'default'): WorldSpawn {
  const spawns = WORLD_SCENE_NAMED_SPAWNS[scene] as Record<string, WorldSpawn>;
  return Object.prototype.hasOwnProperty.call(spawns, name) && spawns[name] ? spawns[name] : spawns.default;
}

export const WORLD_SCENE_SPAWNS: Record<WorldScene, readonly WorldSpawn[]> = {
  town: Object.values(WORLD_SCENE_NAMED_SPAWNS.town),
  shore: Object.values(WORLD_SCENE_NAMED_SPAWNS.shore),
  'west-green': Object.values(WORLD_SCENE_NAMED_SPAWNS['west-green']),
  'east-green': Object.values(WORLD_SCENE_NAMED_SPAWNS['east-green']),
  'daniels-shop': Object.values(WORLD_SCENE_NAMED_SPAWNS['daniels-shop']),
  'cafe-cinnamon': Object.values(WORLD_SCENE_NAMED_SPAWNS['cafe-cinnamon']),
};
export const MOVE_RATE_HZ = 10;
export const HEARTBEAT_MS = 2_000;
export const MAX_SPEED = 220;
export const MOVE_SLACK = 48;
export const WAVE_RADIUS = 300;
export const WAVE_COOLDOWN_MS = 1_000;
/** A chat message is one line over someone's head, not a paragraph. */
export const CHAT_MAX_LENGTH = 120;
/** The server's floor between two messages from the same player. */
export const CHAT_COOLDOWN_MS = 600;
/** Player penguin facing — cardinals + diagonals (dance-harvested plates). */
export const FACINGS = ['up', 'down', 'side', 'ne', 'nw', 'se', 'sw'] as const;
export type Facing = (typeof FACINGS)[number];
export function isFacing(value: unknown): value is Facing {
  return typeof value === 'string' && (FACINGS as readonly string[]).includes(value);
}
export const GAME_ACTIVITIES = [
  'fishing',
  'get',
  'bump',
  'skip-rope',
  'paper-toss',
  'sled-run',
  'expedition',
] as const;
export type GameActivity = (typeof GAME_ACTIVITIES)[number];
export type MovePayload = {scene:WorldScene;x:number;y:number;petX:number;petY:number;facing:Facing;moving:boolean;seq:number};
export type ActivityPose = Omit<MovePayload, 'scene' | 'seq'>;
export type ActivityPayload = { active: boolean; scene: WorldScene; pose?: ActivityPose };
export type PositionCorrection = { scene: WorldScene; x: number; y: number; petX: number; petY: number; recoverScene?: boolean };
export type ProfileRefreshPayload = { ticket: string; requestId?: string };
export type ProfileRefreshResult = { ok: boolean; requestId?: string; retryAfterMs?: number };
export type WavePayload = { targetSessionId: string };
/** Continuous dance emote — peers loop the GIF while true. */
export type DancePayload = { dancing: boolean };
export type ChatPayload = { text: string };
export type TownPositionClaim = { x: number; y: number; facing: Facing };
export type EquippedAccessoriesClaim = {
  headLeft?: string;
  headRight?: string;
  body?: string;
  extra?: string;
};
export type AdmissionClaims = {
  sub: string;
  displayName: string;
  petName: string;
  petSpecies: string;
  penguinColor: string;
  equippedAccessories?: EquippedAccessoriesClaim;
  townPosition?: TownPositionClaim;
  protocolVersion: number;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string | string[];
};
export type AdmissionProfile = {
  identity: string;
  displayName: string;
  petName: string;
  petSpecies: string;
  penguinColor: string;
  equippedAccessories?: EquippedAccessoriesClaim;
  townPosition?: TownPositionClaim;
};

export function isGameActivity(value: unknown): value is GameActivity {
  return typeof value === 'string' && (GAME_ACTIVITIES as readonly string[]).includes(value);
}

export function isWorldScene(value: unknown): value is WorldScene {
  return typeof value === 'string' && (WORLD_SCENES as readonly string[]).includes(value);
}

/**
 * Control, separator and bidi-override characters, which a paste can carry in.
 * A chat bubble is one line of text drawn over a penguin's head: a newline would
 * grow it into the scene, and a direction override could dress a message up as
 * someone else's. Both become an ordinary space.
 */
const CHAT_UNSAFE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x1f], [0x7f, 0x9f], [0x2028, 0x2029],
  [0x200e, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069],
  // Invisible on their own and meaningless in a sentence: a soft hyphen,
  // zero-width space, the word joiner and its invisible operators, and a BOM.
  [0x00ad, 0x00ad], [0x200b, 0x200b], [0x2060, 0x2064], [0xfeff, 0xfeff],
];

/**
 * Invisible too, but they do a job between two other characters: a family emoji
 * is several emoji glued with a zero-width joiner, and a variation selector is
 * what makes ❤️ red. They stay, so {@link hasVisibleCharacter} is what stops a
 * message made of nothing but glue.
 */
const CHAT_INVISIBLE_JOINER_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x200c, 0x200d], [0xfe00, 0xfe0f],
];

function inRanges(character: string, ranges: ReadonlyArray<readonly [number, number]>) {
  const codePoint = character.codePointAt(0) ?? 0;
  return ranges.some(([from, to]) => codePoint >= from && codePoint <= to);
}

function isChatUnsafe(character: string) {
  return inRanges(character, CHAT_UNSAFE_RANGES);
}

/** Whether a message would draw anything at all, or is only spaces and glue. */
function hasVisibleCharacter(value: string) {
  return Array.from(value).some(
    (character) => character !== ' ' && !inRanges(character, CHAT_INVISIBLE_JOINER_RANGES),
  );
}

/** Whether one typed character may go into a message (a space may). */
export function isChatCharacter(character: string) {
  return Array.from(character).length === 1 && !isChatUnsafe(character);
}

/**
 * What a chat message is allowed to be: printable, single-line, collapsed,
 * trimmed and capped. Returns null when there is nothing left to say, so
 * whitespace alone cannot post an empty bubble.
 */
export function sanitizeChatText(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > CHAT_MAX_LENGTH * 8) return null;
  const flattened = Array.from(value, (character) => (isChatUnsafe(character) ? ' ' : character))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!hasVisibleCharacter(flattened)) return null;
  // Capped by character, not by code unit, so the cut cannot land inside an emoji.
  return Array.from(flattened).slice(0, CHAT_MAX_LENGTH).join('');
}

function moveFields(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const p = value as Partial<MovePayload>;
  return [p.x,p.y,p.petX,p.petY,p.seq].every(Number.isFinite) && Number.isInteger(p.seq) && (p.seq ?? 0) >= 0 &&
    isFacing(p.facing) && typeof p.moving === 'boolean'
    ? p
    : null;
}

export function isMovePayload(value: unknown): value is MovePayload {
  const p = moveFields(value);
  if (!p || !isWorldScene(p.scene)) return false;
  const bounds = WORLD_SCENE_BOUNDS[p.scene];
  return [p.x, p.petX].every((x) => (x ?? -1) >= 0 && (x ?? Infinity) <= bounds.width) &&
    [p.y, p.petY].every((y) => (y ?? -1) >= 0 && (y ?? Infinity) <= bounds.height);
}

/** Normalize v3/v4 Town movement, which did not carry a scene identifier. */
export function normalizeMovePayload(value: unknown, legacyScene: WorldScene = 'town'): MovePayload | null {
  if (isMovePayload(value)) return value;
  const p = moveFields(value);
  if (!p || (p.scene !== undefined && !isWorldScene(p.scene))) return null;
  const normalized = { ...p, scene: legacyScene };
  return isMovePayload(normalized) ? normalized : null;
}

export const SLED_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type SledDifficulty = (typeof SLED_DIFFICULTIES)[number];
export type SledPhase = 'lobby' | 'countdown' | 'racing' | 'finished';
export type SledEffect = '' | 'obstacle' | 'ice';
export type SledCourseItemKind = 'stump' | 'rock' | 'ice';
export type SledCourseItem = {
  id: string;
  kind: SledCourseItemKind;
  x: number;
  progress: number;
  radius: number;
};
export type SledInputPayload = { steering: -1 | 0 | 1; seq: number };
/**
 * A collision the racer's own client saw. Collisions are decided there, against
 * the lane the player is actually steering, because the server's copy of that
 * lane is a round trip old — it would bump a sled that dodged and miss one that
 * did not. The server keeps the verdict for everyone else to watch.
 */
export type SledHitPayload = { itemId: string };
/**
 * A claim the server would not stand behind, sent back to the client that made
 * it. Either it failed its checks on arrival, or the racer's own steering history
 * later showed they were never near the item. The client drops the effect it
 * applied so the two sides do not drift apart for the rest of the run.
 */
export type SledHitRejectedPayload = { itemId: string };
export const SLED_MAX_PLAYERS = 4;
export const SLED_COUNTDOWN_MS = 3_000;
/**
 * The race simulation's tick. A tick integrates a whole step at whatever steering
 * it holds when it runs, so this is also how precisely the server can place a
 * sled — the client's reconciliation reads it as the width of a fair disagreement.
 */
export const SLED_TICK_MS = 50;
export const SLED_RACER_RADIUS = 24;
export const SLED_PROGRESS_TO_PIXELS = 0.56;
export const SLED_EFFECTS = {
  obstacle: { multiplier: 0.52, durationMs: 1_250 },
  ice: { multiplier: 1.45, durationMs: 1_500 },
} as const;

export type SledDifficultyConfig = {
  courseLength: number;
  trackHalfWidth: number;
  obstacleCount: number;
  iceCount: number;
  baseSpeed: number;
  steeringSpeed: number;
  spawnClearance: number;
  finishClearance: number;
};

const SLED_CONFIG: Record<SledDifficulty, SledDifficultyConfig> = {
  easy: {
    courseLength: 6_400, trackHalfWidth: 270, obstacleCount: 12, iceCount: 6,
    baseSpeed: 330, steeringSpeed: 245, spawnClearance: 520, finishClearance: 420,
  },
  medium: {
    courseLength: 7_200, trackHalfWidth: 250, obstacleCount: 20, iceCount: 8,
    baseSpeed: 380, steeringSpeed: 260, spawnClearance: 520, finishClearance: 420,
  },
  hard: {
    courseLength: 8_000, trackHalfWidth: 230, obstacleCount: 28, iceCount: 10,
    baseSpeed: 430, steeringSpeed: 275, spawnClearance: 520, finishClearance: 420,
  },
};

export function isSledDifficulty(value: unknown): value is SledDifficulty {
  return typeof value === 'string' && (SLED_DIFFICULTIES as readonly string[]).includes(value);
}

export function sledDifficultyConfig(difficulty: SledDifficulty): SledDifficultyConfig {
  return SLED_CONFIG[difficulty];
}

function seededRandom(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSledCourse(seed: string, difficulty: SledDifficulty): SledCourseItem[] {
  const config = sledDifficultyConfig(difficulty);
  const random = seededRandom(`${seed}:${difficulty}`);
  const kinds: SledCourseItemKind[] = [
    ...Array.from({ length: config.obstacleCount }, (_, index) => index % 2 === 0 ? 'stump' as const : 'rock' as const),
    ...Array.from({ length: config.iceCount }, () => 'ice' as const),
  ];
  for (let index = kinds.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [kinds[index], kinds[target]] = [kinds[target]!, kinds[index]!];
  }
  const usableLength = config.courseLength - config.spawnClearance - config.finishClearance;
  const step = usableLength / kinds.length;
  return kinds.map((kind, index) => {
    const radius = kind === 'ice' ? 44 : kind === 'stump' ? 30 : 28;
    const maxX = config.trackHalfWidth - radius;
    return {
      id: `${kind}-${index}`,
      kind,
      x: Math.round((random() * 2 - 1) * maxX),
      progress: Math.round(config.spawnClearance + step * (index + 0.5)),
      radius,
    };
  });
}

/**
 * How far out of step with the server a reported collision may be. The client is
 * ahead of the server's copy of it by a round trip, and the report takes another
 * half trip to arrive, so the window has to cover a bad connection — it is a
 * sanity check on a claim, not a second collision test.
 */
export const SLED_HIT_TOLERANCE_MS = 600;

/**
 * Whether a racer could plausibly have hit this item, judged from the server's
 * own (older) copy of where they are. Rejects claims for items the sled is
 * nowhere near — an ice boost picked out of a different part of the course.
 */
export function isSledHitPlausible(
  item: SledCourseItem,
  racer: { progress: number; x: number },
  config: SledDifficultyConfig,
): boolean {
  const seconds = SLED_HIT_TOLERANCE_MS / 1_000;
  const fastest = config.baseSpeed * SLED_EFFECTS.ice.multiplier;
  const alongTrack = item.radius + SLED_RACER_RADIUS + fastest * seconds;
  const acrossTrack = item.radius + SLED_RACER_RADIUS + config.steeringSpeed * seconds;
  return (
    Math.abs(item.progress - racer.progress) <= alongTrack &&
    Math.abs(item.x - racer.x) <= acrossTrack
  );
}

/**
 * Where the server had a racer's lane at one point on the hill. The server writes
 * one of these per tick from the steering it has accepted, so the trail is the
 * racer's own input history laid out along the track rather than along the clock —
 * which is what a course item has to be judged against.
 */
export type SledLaneSample = { progress: number; x: number };

/** Half the span of track over which a sled and an item are touching. */
function crossingHalfWidth(item: { radius: number }): number {
  return item.radius + SLED_RACER_RADIUS;
}

/** The widest thing `generateSledCourse` puts on a hill, for sizing the trail. */
const SLED_WIDEST_ITEM_RADIUS = 44;

/**
 * How far along the track the client's copy of the racer may be from the
 * server's. The client leads by a round trip and its report costs another half
 * one, so a crossing the client saw sits somewhere inside this much of track.
 */
function lagDistance(config: SledDifficultyConfig): number {
  return config.baseSpeed * SLED_EFFECTS.ice.multiplier * (SLED_HIT_TOLERANCE_MS / 1_000);
}

/**
 * How far past an item a racer has to be before their lane trail can settle what
 * happened there: the whole span the crossing could have fallen in, plus the
 * crossing itself.
 */
export function sledLaneJudgementReach(item: { radius: number }, config: SledDifficultyConfig): number {
  return lagDistance(config) + crossingHalfWidth(item);
}

/**
 * How much lane the server keeps behind a racer. An item is judged once the sled
 * is a reach past it, and the window reaches back that far again, so the trail
 * has to hold two reaches — sized off the widest item on any course.
 */
export function sledLaneTrailSpan(config: SledDifficultyConfig): number {
  const slack = config.baseSpeed * SLED_EFFECTS.ice.multiplier * 0.25;
  return 2 * sledLaneJudgementReach({ radius: SLED_WIDEST_ITEM_RADIUS }, config) + slack;
}

/**
 * The stretch of the racer's lane that could contain the crossing, provided the
 * trail covers the whole of it. An incomplete trail — a racer who joined mid-race
 * or whose samples have been pruned — yields nothing, and nothing is judged.
 */
function laneWindow(
  item: SledCourseItem,
  trail: readonly SledLaneSample[],
  config: SledDifficultyConfig,
): SledLaneSample[] {
  const reach = sledLaneJudgementReach(item, config);
  const from = item.progress - reach;
  const to = item.progress + reach;
  if (trail.length < 2 || trail[0]!.progress > from || trail[trail.length - 1]!.progress < to) return [];
  return trail.filter((sample) => sample.progress >= from && sample.progress <= to);
}

function overlaps(sample: SledLaneSample, item: SledCourseItem): boolean {
  return Math.abs(sample.x - item.x) <= crossingHalfWidth(item);
}

/**
 * Whether the racer's own steering left them no way past this item — the check
 * that keeps the race from being the client's to decide. A client that simply
 * never reports the rocks it hits still gets slowed by the ones its own accepted
 * steering drove straight through.
 *
 * A dodge is any stretch of the racer's lane, long enough to have been the
 * crossing, that is clear of the item. Finding one settles it in the racer's
 * favour: the server cannot say when in the window the crossing really happened,
 * so it does not get to say the sled was somewhere it might not have been.
 */
export function isSledHitUnavoidable(
  item: SledCourseItem,
  trail: readonly SledLaneSample[],
  config: SledDifficultyConfig,
): boolean {
  const window = laneWindow(item, trail, config);
  if (!window.length) return false;
  const crossing = 2 * crossingHalfWidth(item);
  let clearFrom: number | undefined;
  for (const sample of window) {
    if (overlaps(sample, item)) {
      clearFrom = undefined;
      continue;
    }
    if (clearFrom === undefined) clearFrom = sample.progress;
    if (sample.progress - clearFrom >= crossing) return false;
  }
  return true;
}

/**
 * Whether a reported collision is one the racer's own steering rules out: at no
 * point in the whole window did their lane come near this item. This is what
 * stops a client picking an ice boost out of a part of the course it never
 * visited — the arrival-time check only knows roughly where the racer is, while
 * the trail knows the lane they held at the item itself.
 */
export function isSledClaimContradicted(
  item: SledCourseItem,
  trail: readonly SledLaneSample[],
  config: SledDifficultyConfig,
): boolean {
  const window = laneWindow(item, trail, config);
  if (!window.length) return false;
  return !window.some((sample) => overlaps(sample, item));
}

export class PlayerState extends Schema {
  declare userId: string;
  declare displayName: string;
  declare petName: string;
  declare petSpecies: string;
  declare penguinColor: string;
  declare x: number;
  declare y: number;
  declare petX: number;
  declare petY: number;
  declare facing: Facing;
  declare moving: boolean;
  declare active: boolean;
  declare seq: number;
  declare updatedAt: number;
  declare waveId: string;
  declare waveTarget: string;
  declare activity: string;
  declare scene: WorldScene;
  declare accessoryHeadLeft: string;
  declare accessoryHeadRight: string;
  declare accessoryBody: string;
  declare accessoryExtra: string;
  /** Stamped `${sentAt}:${uuid}` — how peers spot a message they have not shown. */
  declare chatId: string;
  declare chatText: string;
  /** True while the player is looping the Club Penguin dance emote. */
  declare dancing: boolean;

  constructor() {
    super();
    this.userId = '';
    this.displayName = 'Player';
    this.petName = 'Pet';
    this.petSpecies = '';
    this.penguinColor = 'blue';
    this.x = 0;
    this.y = 0;
    this.petX = 0;
    this.petY = 0;
    this.facing = 'down';
    this.moving = false;
    this.active = false;
    this.seq = 0;
    this.updatedAt = 0;
    this.waveId = '';
    this.waveTarget = '';
    this.activity = '';
    this.scene = 'town';
    this.accessoryHeadLeft = '';
    this.accessoryHeadRight = '';
    this.accessoryBody = '';
    this.accessoryExtra = '';
    this.chatId = '';
    this.chatText = '';
    this.dancing = false;
  }
}
// Field order is the wire format: new fields are appended so clients on an older
// protocol keep decoding the ones they know.
defineTypes(PlayerState, {userId:'string',displayName:'string',petName:'string',petSpecies:'string',penguinColor:'string',x:'number',y:'number',petX:'number',petY:'number',facing:'string',moving:'boolean',active:'boolean',seq:'number',updatedAt:'number',waveId:'string',waveTarget:'string',activity:'string',scene:'string',accessoryHeadLeft:'string',accessoryHeadRight:'string',accessoryBody:'string',accessoryExtra:'string',chatId:'string',chatText:'string',dancing:'boolean'});

export class NpcState extends Schema {
  declare id: string;
  declare x: number;
  declare y: number;
  declare facing: 'left' | 'right';
  declare moving: boolean;
  declare updatedAt: number;

  constructor() {
    super();
    this.id = '';
    this.x = 0;
    this.y = 0;
    this.facing = 'right';
    this.moving = false;
    this.updatedAt = 0;
  }
}
defineTypes(NpcState, {id:'string',x:'number',y:'number',facing:'string',moving:'boolean',updatedAt:'number'});

export class SledPlayerState extends Schema {
  declare userId: string;
  declare displayName: string;
  declare penguinColor: string;
  declare x: number;
  declare progress: number;
  declare speed: number;
  declare steering: number;
  declare inputSeq: number;
  declare effect: SledEffect;
  declare effectUntil: number;
  declare finishedAt: number;
  declare rank: number;

  constructor() {
    super();
    this.userId = '';
    this.displayName = 'Player';
    this.penguinColor = 'blue';
    this.x = 0;
    this.progress = 0;
    this.speed = 0;
    this.steering = 0;
    this.inputSeq = 0;
    this.effect = '';
    this.effectUntil = 0;
    this.finishedAt = 0;
    this.rank = 0;
  }
}
defineTypes(SledPlayerState, {
  userId:'string',displayName:'string',penguinColor:'string',x:'number',progress:'number',speed:'number',
  steering:'number',inputSeq:'number',effect:'string',effectUntil:'number',finishedAt:'number',rank:'number',
});

export class TownState extends Schema {
  declare players: MapSchema<PlayerState>;
  declare npcs: MapSchema<NpcState>;

  constructor() {
    super();
    this.players = new MapSchema<PlayerState>();
    this.npcs = new MapSchema<NpcState>();
  }
}
defineTypes(TownState, {players:{map:PlayerState},npcs:{map:NpcState}});

export class SledRunState extends Schema {
  declare racers: MapSchema<SledPlayerState>;
  declare phase: SledPhase;
  declare leader: string;
  declare difficulty: SledDifficulty;
  declare seed: string;
  declare countdownAt: number;
  declare startedAt: number;
  declare serverTime: number;
  declare round: number;

  constructor() {
    super();
    this.racers = new MapSchema<SledPlayerState>();
    this.phase = 'lobby';
    this.leader = '';
    this.difficulty = 'easy';
    this.seed = '';
    this.countdownAt = 0;
    this.startedAt = 0;
    this.serverTime = 0;
    this.round = 0;
  }
}
defineTypes(SledRunState, {
  racers:{map:SledPlayerState},phase:'string',leader:'string',difficulty:'string',seed:'string',
  countdownAt:'number',startedAt:'number',serverTime:'number',round:'number',
});
