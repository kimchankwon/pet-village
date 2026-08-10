/**
 * Authoritative Town villager roster — shared by the Colyseus server and the
 * browser's offline fallback so solo play and multiplayer agree on who is out.
 */

export type TownNpcPoint = { x: number; y: number };

const TILE = 48;

function homeWaypoints(tx: number, ty: number, index: number): TownNpcPoint[] {
  const direction = index % 2 === 0 ? 1 : -1;
  return [
    [0, 0],
    [1.6 * direction, 0.25],
    [-1.5 * direction, -0.35],
    [0.4, 1.2],
    [-0.5 * direction, -1.1],
  ].map(([ox, oy]) => ({ x: (tx + ox!) * TILE, y: (ty + oy!) * TILE }));
}

/** Bongbongee lives in Town permanently and walks the whole ice plaza. */
export const BONGBONGEE_TOWN = {
  id: 'bongbongee',
  speed: 50,
  waypoints: [
    { x: 10 * TILE, y: 12.5 * TILE },
    { x: 20 * TILE, y: 9.5 * TILE },
    { x: 26 * TILE, y: 13 * TILE },
    { x: 11 * TILE, y: 16 * TILE },
    { x: 20 * TILE, y: 15.5 * TILE },
  ] as TownNpcPoint[],
} as const;

/**
 * MINITEEN who take turns living in Town. Shore + Green reserves are omitted
 * so a villager is only ever in one place.
 */
export const TOWN_RESIDENT_DEFS = [
  { id: 'shuasumi', speed: 40, waypoints: homeWaypoints(11.5, 8.5, 0) },
  { id: 'ocl', speed: 46, waypoints: homeWaypoints(20, 8, 1) },
  { id: 'tamtam', speed: 52, waypoints: homeWaypoints(26.5, 11, 2) },
  { id: 'foxdungee', speed: 58, waypoints: homeWaypoints(27.5, 15, 3) },
  { id: 'ppyopuli', speed: 42, waypoints: homeWaypoints(10, 16.5, 4) },
  { id: 'doa', speed: 56, waypoints: homeWaypoints(18.5, 16.8, 5) },
  { id: 'kimja', speed: 38, waypoints: homeWaypoints(5, 16.5, 6) },
  { id: 'bboogyuli', speed: 48, waypoints: homeWaypoints(22, 18.2, 7) },
  { id: 'nonver', speed: 44, waypoints: homeWaypoints(28, 8, 8) },
] as const;

/** How many residents are out at once. */
export const TOWN_RESIDENT_COUNT = 4;

/**
 * How often the roster moves along. One villager leaves and one arrives each
 * shift so the square is never emptied at once.
 */
export const TOWN_ROSTER_SHIFT_MS = 90_000;

/**
 * Who is in Town at `now`. Clock-derived so every client and server process
 * agrees without being told, and a room restart does not reshuffle.
 */
export function townRosterAt(now: number): string[] {
  const start = Math.floor(Math.max(now, 0) / TOWN_ROSTER_SHIFT_MS) % TOWN_RESIDENT_DEFS.length;
  return Array.from(
    { length: TOWN_RESIDENT_COUNT },
    (_unused, offset) => TOWN_RESIDENT_DEFS[(start + offset) % TOWN_RESIDENT_DEFS.length]!.id,
  );
}
