export type CameraZoomKind = 'hub' | 'game';

export interface CameraZoomPolicy {
  initial: number;
  controls: boolean;
}

/** Fixed arenas always use 1x; hub scenes alone restore user zoom memory. */
export function zoomPolicy(kind: CameraZoomKind, remembered: number | null): CameraZoomPolicy {
  if (kind === 'game') return { initial: 1, controls: false };
  return { initial: remembered ?? 1.25, controls: true };
}
