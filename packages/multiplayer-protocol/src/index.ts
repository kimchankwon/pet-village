import { MapSchema, Schema, defineTypes } from '@colyseus/schema';

export const PROTOCOL_VERSION = 7 as const;
export const TICKET_ISSUER = 'pet-village-convex';
export const TICKET_AUDIENCE = 'pet-village-multiplayer';
export const ROOM_NAME = 'town_default';
export const SLED_RUN_ROOM = 'sled_run';
export const TOWN_BOUNDS = { width: 22 * 48, height: 16 * 48 } as const;
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
  shore: { width: 18 * 48, height: 12 * 48 },
  'west-green': { width: 16 * 48, height: 12 * 48 },
  'east-green': { width: 16 * 48, height: 12 * 48 },
  'daniels-shop': { width: 12 * 48, height: 13 * 48 },
  'cafe-cinnamon': { width: 12 * 48, height: 13 * 48 },
};
type WorldSpawn = { readonly x: number; readonly y: number };
export const WORLD_SCENE_NAMED_SPAWNS = {
  town: {
    default: { x: 528, y: 508.8 },
    house: { x: 528, y: 266.4 },
    west: { x: 76.8, y: 432 },
    east: { x: 979.2, y: 432 },
    shop: { x: 825.6, y: 283.2 },
    cafe: { x: 230.4, y: 283.2 },
    shore: { x: 504, y: 662.4 },
  },
  shore: {
    default: { x: 432, y: 105.6 },
    fishing: { x: 432, y: 290.4 },
  },
  'west-green': {
    default: { x: 691.2, y: 288 },
    skiprope: { x: 211.2, y: 225.6 },
    bump: { x: 508.8, y: 225.6 },
    'sled-run': { x: 638.4, y: 225.6 },
  },
  'east-green': {
    default: { x: 76.8, y: 288 },
    arcade: { x: 249.6, y: 225.6 },
    get: { x: 518.4, y: 225.6 },
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
export type Facing = 'up' | 'down' | 'side';
export const GAME_ACTIVITIES = ['fishing', 'get', 'bump', 'skip-rope', 'paper-toss', 'sled-run'] as const;
export type GameActivity = (typeof GAME_ACTIVITIES)[number];
export type MovePayload = {scene:WorldScene;x:number;y:number;petX:number;petY:number;facing:Facing;moving:boolean;seq:number};
export type ActivityPose = Omit<MovePayload, 'scene' | 'seq'>;
export type ActivityPayload = { active: boolean; scene: WorldScene; pose?: ActivityPose };
export type PositionCorrection = { scene: WorldScene; x: number; y: number; petX: number; petY: number; recoverScene?: boolean };
export type ProfileRefreshPayload = { ticket: string; requestId?: string };
export type ProfileRefreshResult = { ok: boolean; requestId?: string; retryAfterMs?: number };
export type WavePayload = { targetSessionId: string };
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
];

function isChatUnsafe(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  return CHAT_UNSAFE_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
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
  // Capped by character, not by code unit, so the cut cannot land inside an emoji.
  return flattened.length === 0 ? null : Array.from(flattened).slice(0, CHAT_MAX_LENGTH).join('');
}

function moveFields(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const p = value as Partial<MovePayload>;
  return [p.x,p.y,p.petX,p.petY,p.seq].every(Number.isFinite) && Number.isInteger(p.seq) && (p.seq ?? 0) >= 0 &&
    (p.facing === 'up' || p.facing === 'down' || p.facing === 'side') && typeof p.moving === 'boolean'
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
  }
}
// Field order is the wire format: new fields are appended so clients on an older
// protocol keep decoding the ones they know.
defineTypes(PlayerState, {userId:'string',displayName:'string',petName:'string',petSpecies:'string',penguinColor:'string',x:'number',y:'number',petX:'number',petY:'number',facing:'string',moving:'boolean',active:'boolean',seq:'number',updatedAt:'number',waveId:'string',waveTarget:'string',activity:'string',scene:'string',accessoryHeadLeft:'string',accessoryHeadRight:'string',accessoryBody:'string',accessoryExtra:'string',chatId:'string',chatText:'string'});

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
