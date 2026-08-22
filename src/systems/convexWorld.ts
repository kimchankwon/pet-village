import type { PositionCorrection } from '@pet-village/multiplayer-protocol';
import type { SledDifficulty } from '@pet-village/multiplayer-protocol';

export type MoveArgs = {
  sessionId: string;
  scene: string;
  x: number;
  y: number;
  petX: number;
  petY: number;
  facing: string;
  moving: boolean;
  seq: number;
};

export type ConvexWorldClient = {
  join: (penguinColor: string) => Promise<{ sessionId: string; userId: string }>;
  leave: (sessionId: string) => Promise<unknown>;
  move: (args: MoveArgs) => Promise<{ correction?: PositionCorrection } | null>;
  setActive: (args: {
    sessionId: string;
    active: boolean;
    scene?: string;
    pose?: { x: number; y: number; petX: number; petY: number; facing: string; moving: boolean };
  }) => Promise<{ correction?: PositionCorrection } | null>;
  setActivity: (sessionId: string, activity: string) => Promise<unknown>;
  refreshProfile: (sessionId: string, penguinColor: string) => Promise<{ ok: boolean; retryAfterMs?: number }>;
  wave: (sessionId: string, targetSessionId: string) => Promise<unknown>;
  emote: (sessionId: string, emote: string) => Promise<unknown>;
  petEmote: (sessionId: string, expression: string) => Promise<unknown>;
  chat: (sessionId: string, text: string) => Promise<unknown>;
  sledJoin: (args: { penguinColor: string; displayName?: string }) => Promise<{ sessionId: string }>;
  sledLeave: (sessionId: string) => Promise<unknown>;
  sledDifficulty: (sessionId: string, difficulty: SledDifficulty) => Promise<unknown>;
  sledStart: (sessionId: string) => Promise<unknown>;
  sledInput: (sessionId: string, steering: number, seq: number) => Promise<unknown>;
  sledHit: (sessionId: string, itemId: string) => Promise<{ rejected: string[] }>;
};

let client: ConvexWorldClient | null = null;

export function setConvexWorldClient(next: ConvexWorldClient | null) {
  client = next;
}

export function convexWorld() {
  if (!client) throw new Error('Convex village client is unavailable');
  return client;
}

export function hasConvexWorldClient() {
  return client !== null;
}
