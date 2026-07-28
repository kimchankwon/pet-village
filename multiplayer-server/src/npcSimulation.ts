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

/** Bongbongee lives in Town permanently and walks the whole square. */
const BONGBONGEE: NpcDefinition = {
  id: 'bongbongee',
  speed: 50,
  waypoints: [
    { x: 7.5 * TILE, y: 9.5 * TILE },
    { x: 14 * TILE, y: 7.2 * TILE },
    { x: 18 * TILE, y: 10 * TILE },
    { x: 8.5 * TILE, y: 12 * TILE },
    { x: 14.5 * TILE, y: 11.5 * TILE },
  ],
};

/**
 * The MINITEEN who take turns living in Town, each on the home patch the client
 * draws them at (see `src/systems/miniteen.ts`). The four reserved for the Shore
 * and the two Greens are not in here: a villager is only ever in one place.
 */
const TOWN_RESIDENTS: NpcDefinition[] = [
  { id: 'shuasumi', speed: 40, waypoints: homeWaypoints(8.8, 6.4, 0) },
  { id: 'ocl', speed: 46, waypoints: homeWaypoints(14.2, 5.8, 1) },
  { id: 'tamtam', speed: 52, waypoints: homeWaypoints(18.5, 8.2, 2) },
  { id: 'foxdungee', speed: 58, waypoints: homeWaypoints(19.2, 11.2, 3) },
  { id: 'ppyopuli', speed: 42, waypoints: homeWaypoints(7.5, 12.2, 4) },
  { id: 'doa', speed: 56, waypoints: homeWaypoints(13.5, 12.4, 5) },
  { id: 'kimja', speed: 38, waypoints: homeWaypoints(3.5, 12.5, 6) },
  { id: 'bboogyuli', speed: 48, waypoints: homeWaypoints(15.2, 14, 7) },
  { id: 'nonver', speed: 44, waypoints: homeWaypoints(19.5, 5.6, 8) },
];

/** How many of them are out at once. */
export const TOWN_RESIDENT_COUNT = 4;
/**
 * How often the roster moves along. One villager leaves and one arrives each
 * time, rather than the whole square changing at once, so Town looks like a
 * place people come and go from — and everybody's shift comes round often
 * enough that a single visit sees new faces.
 */
export const TOWN_ROSTER_SHIFT_MS = 90_000;

/**
 * Who is in Town at `now`. Derived from the clock alone, never from a random
 * draw, so every client — and a second server process — agrees without being
 * told, and a room that restarts does not reshuffle the village.
 */
export function townRosterAt(now: number): string[] {
  const start = Math.floor(Math.max(now, 0) / TOWN_ROSTER_SHIFT_MS) % TOWN_RESIDENTS.length;
  return Array.from(
    { length: TOWN_RESIDENT_COUNT },
    (_unused, offset) => TOWN_RESIDENTS[(start + offset) % TOWN_RESIDENTS.length]!.id,
  );
}

export class TownNpcSimulation {
  private readonly runtimes = new Map<string, Runtime>();

  constructor(private readonly states: MapSchema<NpcState>, now = Date.now()) {
    this.admit(BONGBONGEE, now);
    this.setRoster(now);
  }

  /** Put a villager on their home patch and start them walking. */
  private admit(definition: NpcDefinition, now: number) {
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
    this.states.set(definition.id, state);
    this.runtimes.set(definition.id, { definition, destination: 1, pauseUntil: 0 });
  }

  /** Swap the roster over to whoever this moment calls for. */
  private setRoster(now: number) {
    const roster = new Set(townRosterAt(now));
    for (const id of this.runtimes.keys()) {
      if (id === BONGBONGEE.id || roster.has(id)) continue;
      this.runtimes.delete(id);
      this.states.delete(id);
    }
    for (const definition of TOWN_RESIDENTS) {
      if (!roster.has(definition.id) || this.runtimes.has(definition.id)) continue;
      this.admit(definition, now);
    }
  }

  step(deltaMs: number, now = Date.now()) {
    this.setRoster(now);
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
