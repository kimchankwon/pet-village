import type { MapSchema } from '@colyseus/schema';
import { NpcState } from '@pet-village/multiplayer-protocol';

type Point = { x: number; y: number };
type NpcDefinition = { id: string; speed: number; waypoints: Point[] };
type Runtime = { definition: NpcDefinition; destination: number; pauseUntil: number };

const TILE = 48;
const PAUSE_MS = 2_000;

function homeWaypoints(tx: number, ty: number, index: number): Point[] {
  const direction = index % 2 === 0 ? 1 : -1;
  return [
    [0, 0],
    [1.6 * direction, 0.25],
    [-1.5 * direction, -0.35],
    [0.4, 1.2],
    [-0.5 * direction, -1.1],
  ].map(([ox, oy]) => ({ x: (tx + ox!) * TILE, y: (ty + oy!) * TILE }));
}

const DEFINITIONS: NpcDefinition[] = [
  {
    id: 'bongbongee',
    speed: 50,
    waypoints: [
      { x: 7.5 * TILE, y: 9.5 * TILE },
      { x: 14 * TILE, y: 7.2 * TILE },
      { x: 18 * TILE, y: 10 * TILE },
      { x: 8.5 * TILE, y: 12 * TILE },
      { x: 14.5 * TILE, y: 11.5 * TILE },
    ],
  },
  { id: 'shuasumi', speed: 40, waypoints: homeWaypoints(8.8, 6.4, 0) },
  { id: 'ocl', speed: 46, waypoints: homeWaypoints(14.2, 5.8, 1) },
  { id: 'tamtam', speed: 52, waypoints: homeWaypoints(18.5, 8.2, 2) },
  { id: 'foxdungee', speed: 58, waypoints: homeWaypoints(19.2, 11.2, 3) },
];

export class TownNpcSimulation {
  private readonly runtimes = new Map<string, Runtime>();

  constructor(private readonly states: MapSchema<NpcState>, now = Date.now()) {
    for (const definition of DEFINITIONS) {
      const start = definition.waypoints[0]!;
      const state = new NpcState();
      Object.assign(state, {
        id: definition.id,
        x: start.x,
        y: start.y,
        facing: 'right',
        moving: true,
        updatedAt: now,
      });
      states.set(definition.id, state);
      this.runtimes.set(definition.id, { definition, destination: 1, pauseUntil: 0 });
    }
  }

  step(deltaMs: number, now = Date.now()) {
    const elapsedSeconds = Math.min(Math.max(deltaMs, 0), 250) / 1_000;
    for (const [id, runtime] of this.runtimes) {
      const state = this.states.get(id);
      if (!state) continue;
      if (now < runtime.pauseUntil) {
        state.moving = false;
        continue;
      }

      const destination = runtime.definition.waypoints[runtime.destination]!;
      const dx = destination.x - state.x;
      const dy = destination.y - state.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 6) {
        state.x = destination.x;
        state.y = destination.y;
        state.moving = false;
        state.updatedAt = now;
        runtime.destination = (runtime.destination + 1) % runtime.definition.waypoints.length;
        runtime.pauseUntil = now + PAUSE_MS;
        continue;
      }

      const distanceMoved = Math.min(runtime.definition.speed * elapsedSeconds, distance);
      state.x += (dx / distance) * distanceMoved;
      state.y += (dy / distance) * distanceMoved;
      state.facing = dx < 0 ? 'left' : 'right';
      state.moving = distanceMoved > 0;
      state.updatedAt = now;
    }
  }
}
