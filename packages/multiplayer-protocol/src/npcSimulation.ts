import {
  BONGBONGEE_TOWN,
  TOWN_RESIDENT_COUNT,
  TOWN_RESIDENT_DEFS,
  TOWN_ROSTER_SHIFT_MS,
  townRosterAt,
  type TownNpcPoint,
} from './townNpcs.js';

export { TOWN_RESIDENT_COUNT, TOWN_ROSTER_SHIFT_MS, townRosterAt };

export type NpcSnapshot = {
  id: string;
  x: number;
  y: number;
  facing: 'left' | 'right';
  moving: boolean;
  updatedAt: number;
  destination: number;
  pauseUntil: number;
};

type NpcDefinition = { id: string; speed: number; waypoints: readonly TownNpcPoint[] };
type Runtime = { definition: NpcDefinition; destination: number; pauseUntil: number };

const PAUSE_MS = 2_000;

const BONGBONGEE: NpcDefinition = BONGBONGEE_TOWN;
const TOWN_RESIDENTS: readonly NpcDefinition[] = TOWN_RESIDENT_DEFS;

export class TownNpcSimulation {
  private readonly runtimes = new Map<string, Runtime>();

  constructor(private readonly states: Map<string, NpcSnapshot>, now = Date.now()) {
    if (states.size === 0) {
      this.admit(BONGBONGEE, now);
      this.setRoster(now);
      return;
    }
    const defs = new Map<string, NpcDefinition>([
      [BONGBONGEE.id, BONGBONGEE],
      ...TOWN_RESIDENTS.map((def) => [def.id, def] as const),
    ]);
    for (const [id, state] of states) {
      const definition = defs.get(id);
      if (!definition) continue;
      this.runtimes.set(id, {
        definition,
        destination: state.destination,
        pauseUntil: state.pauseUntil,
      });
    }
    this.setRoster(now);
  }

  private admit(definition: NpcDefinition, now: number) {
    const start = definition.waypoints[0]!;
    const state: NpcSnapshot = {
      id: definition.id,
      x: start.x,
      y: start.y,
      facing: 'right',
      moving: true,
      updatedAt: now,
      destination: 1,
      pauseUntil: 0,
    };
    this.states.set(definition.id, state);
    this.runtimes.set(definition.id, { definition, destination: 1, pauseUntil: 0 });
  }

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
        state.destination = runtime.destination;
        state.pauseUntil = runtime.pauseUntil;
        continue;
      }

      const distanceMoved = Math.min(runtime.definition.speed * elapsedSeconds, distance);
      state.x += (dx / distance) * distanceMoved;
      state.y += (dy / distance) * distanceMoved;
      state.facing = dx < 0 ? 'left' : 'right';
      state.moving = distanceMoved > 0;
      state.updatedAt = now;
      state.destination = runtime.destination;
      state.pauseUntil = runtime.pauseUntil;
    }
  }
}
