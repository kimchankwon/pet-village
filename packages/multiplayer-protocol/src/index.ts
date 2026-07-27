import { MapSchema, Schema, defineTypes } from '@colyseus/schema';

export const PROTOCOL_VERSION = 2 as const;
export const TICKET_ISSUER = 'pet-village-convex';
export const TICKET_AUDIENCE = 'pet-village-multiplayer';
export const ROOM_NAME = 'town_default';
export const TOWN_BOUNDS = { width: 22 * 48, height: 16 * 48 } as const;
export const MOVE_RATE_HZ = 10;
export const HEARTBEAT_MS = 2_000;
export const MAX_SPEED = 220;
export const MOVE_SLACK = 48;
export const WAVE_RADIUS = 300;
export const WAVE_COOLDOWN_MS = 1_000;
export type Facing = 'up' | 'down' | 'side';
export type MovePayload = {x:number;y:number;petX:number;petY:number;facing:Facing;moving:boolean;seq:number};
export type ActivityPayload = { active: boolean };
export type PositionCorrection = { x: number; y: number; petX: number; petY: number };
export type WavePayload = { targetSessionId: string };
export type AdmissionClaims = {sub:string;displayName:string;petName:string;petSpecies:string;penguinColor:string;protocolVersion:number;jti:string;iat:number;exp:number;iss:string;aud:string|string[]};

export function isMovePayload(value: unknown): value is MovePayload {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<MovePayload>;
  return [p.x,p.y,p.petX,p.petY,p.seq].every(Number.isFinite) && Number.isInteger(p.seq) && (p.seq ?? 0) >= 0 &&
    (p.facing === 'up' || p.facing === 'down' || p.facing === 'side') && typeof p.moving === 'boolean' &&
    [p.x, p.petX].every((x) => (x ?? -1) >= 0 && (x ?? Infinity) <= TOWN_BOUNDS.width) &&
    [p.y, p.petY].every((y) => (y ?? -1) >= 0 && (y ?? Infinity) <= TOWN_BOUNDS.height);
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
  }
}
defineTypes(PlayerState, {userId:'string',displayName:'string',petName:'string',petSpecies:'string',penguinColor:'string',x:'number',y:'number',petX:'number',petY:'number',facing:'string',moving:'boolean',active:'boolean',seq:'number',updatedAt:'number',waveId:'string',waveTarget:'string'});

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
