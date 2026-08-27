import type { RemoteNpc } from './multiplayerBridge';

type Point = { x: number; y: number };

export const NPC_ARRIVE_PX = 6;

export function partitionTownNpcSnapshot(rows: RemoteNpc[]) {
  return {
    bongbongee: rows.find((row) => row.id === 'bongbongee') ?? null,
    miniteens: rows.filter((row) => row.id !== 'bongbongee'),
  };
}

export function shouldAdvanceNpcRenderPose(conversing: boolean, now: number, emoteUntil: number) {
  return !conversing && now >= emoteUntil;
}

/** Frame-rate walk toward a destination point. No pose lerp. */
export function stepToward(
  current: Point,
  target: Point,
  speedPxPerSec: number,
  dtSec: number,
  arrivePx = NPC_ARRIVE_PX,
): { x: number; y: number; facing: 'left' | 'right'; arrived: boolean; moving: boolean } {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dist = Math.hypot(dx, dy);
  const facing: 'left' | 'right' = dx < 0 ? 'left' : 'right';
  if (dist <= arrivePx) {
    return { x: target.x, y: target.y, facing, arrived: true, moving: false };
  }
  const step = Math.min(Math.max(speedPxPerSec, 0) * Math.max(dtSec, 0), dist);
  return {
    x: current.x + (dx / dist) * step,
    y: current.y + (dy / dist) * step,
    facing,
    arrived: false,
    moving: step > 0,
  };
}

export function advanceNpcRenderPose(current: Point, target: Point, alpha: number): Point {
  if (Math.hypot(target.x - current.x, target.y - current.y) < 1) return { ...target };
  const amount = Math.min(Math.max(alpha, 0), 1);
  return {
    x: current.x + (target.x - current.x) * amount,
    y: current.y + (target.y - current.y) * amount,
  };
}
