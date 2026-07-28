import { MapSchema, Schema, defineTypes } from '@colyseus/schema';

export const PROTOCOL_VERSION = 4 as const;
export const TICKET_ISSUER = 'pet-village-convex';
export const TICKET_AUDIENCE = 'pet-village-multiplayer';
export const ROOM_NAME = 'town_default';
export const SLED_RUN_ROOM = 'sled_run';
export const TOWN_BOUNDS = { width: 22 * 48, height: 16 * 48 } as const;
export const MOVE_RATE_HZ = 10;
export const HEARTBEAT_MS = 2_000;
export const MAX_SPEED = 220;
export const MOVE_SLACK = 48;
export const WAVE_RADIUS = 300;
export const WAVE_COOLDOWN_MS = 1_000;
export type Facing = 'up' | 'down' | 'side';
export const GAME_ACTIVITIES = ['fishing', 'get', 'bump', 'skip-rope', 'paper-toss', 'sled-run'] as const;
export type GameActivity = (typeof GAME_ACTIVITIES)[number];
export type MovePayload = {x:number;y:number;petX:number;petY:number;facing:Facing;moving:boolean;seq:number};
export type ActivityPayload = { active: boolean };
export type PositionCorrection = { x: number; y: number; petX: number; petY: number };
export type WavePayload = { targetSessionId: string };
export type AdmissionClaims = {sub:string;displayName:string;petName:string;petSpecies:string;penguinColor:string;protocolVersion:number;jti:string;iat:number;exp:number;iss:string;aud:string|string[]};

export function isGameActivity(value: unknown): value is GameActivity {
  return typeof value === 'string' && (GAME_ACTIVITIES as readonly string[]).includes(value);
}

export function isMovePayload(value: unknown): value is MovePayload {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<MovePayload>;
  return [p.x,p.y,p.petX,p.petY,p.seq].every(Number.isFinite) && Number.isInteger(p.seq) && (p.seq ?? 0) >= 0 &&
    (p.facing === 'up' || p.facing === 'down' || p.facing === 'side') && typeof p.moving === 'boolean' &&
    [p.x, p.petX].every((x) => (x ?? -1) >= 0 && (x ?? Infinity) <= TOWN_BOUNDS.width) &&
    [p.y, p.petY].every((y) => (y ?? -1) >= 0 && (y ?? Infinity) <= TOWN_BOUNDS.height);
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
  }
}
defineTypes(PlayerState, {userId:'string',displayName:'string',petName:'string',petSpecies:'string',penguinColor:'string',x:'number',y:'number',petX:'number',petY:'number',facing:'string',moving:'boolean',active:'boolean',seq:'number',updatedAt:'number',waveId:'string',waveTarget:'string',activity:'string'});

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
