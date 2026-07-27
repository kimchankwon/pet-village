import type { RemoteNpc } from './multiplayerBridge';

type Point = { x: number; y: number };

export function partitionTownNpcSnapshot(rows: RemoteNpc[]) {
  return {
    bongbongee: rows.find((row) => row.id === 'bongbongee') ?? null,
    miniteens: rows.filter((row) => row.id !== 'bongbongee'),
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
