export interface HorizontalRange {
  min: number;
  max: number;
}

/** Range for an object's centre while keeping its full width and margin onscreen. */
export function basketHorizontalRange(viewportWidth: number, basketWidth: number, margin: number): HorizontalRange {
  const inset = basketWidth / 2 + margin;
  return { min: inset, max: Math.max(inset, viewportWidth - inset) };
}

/** Clamp a configured basket range to the visible viewport. */
export function clampBasketX(
  configuredMin: number,
  configuredMax: number,
  viewportWidth: number,
  basketWidth: number,
  margin: number,
): number {
  const visible = basketHorizontalRange(viewportWidth, basketWidth, margin);
  const min = Math.max(configuredMin, visible.min);
  const max = Math.min(configuredMax, visible.max);
  return Math.max(min, max);
}
