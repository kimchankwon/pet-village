import { isPortraitDesign, joystickAnchor } from '../game/viewport';

export const HUD_PAD = 10;
export const HUD_PANEL_W = 190;
export const HUD_PANEL_H = 128;
export const JOYSTICK_RADIUS = 54;
export const PROMPT_BOTTOM_OFFSET = 76;
const PROMPT_GAP = 8;

export type Rect = { x: number; y: number; w: number; h: number };

export function hudOrigin(camW: number, camH: number, touch: boolean): { x: number; y: number } {
  if (!touch || isPortraitDesign(camW, camH)) {
    return { x: HUD_PAD, y: camH - HUD_PANEL_H - HUD_PAD };
  }
  const anchor = joystickAnchor(camW, camH, JOYSTICK_RADIUS);
  return { x: HUD_PAD, y: anchor.cy - JOYSTICK_RADIUS - HUD_PANEL_H - HUD_PAD };
}

export function hudRightEdge(): number {
  return HUD_PAD + HUD_PANEL_W;
}

export function bottomLeftObstacles(camW: number, camH: number, touch: boolean): Rect[] {
  const hud = hudOrigin(camW, camH, touch);
  const rects: Rect[] = [{ x: hud.x, y: hud.y, w: HUD_PANEL_W, h: HUD_PANEL_H }];
  if (touch) {
    const stick = joystickAnchor(camW, camH, JOYSTICK_RADIUS);
    rects.push({
      x: stick.cx - JOYSTICK_RADIUS,
      y: stick.cy - JOYSTICK_RADIUS,
      w: JOYSTICK_RADIUS * 2,
      h: JOYSTICK_RADIUS * 2,
    });
  }
  return rects;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function promptCenterY(
  camW: number,
  camH: number,
  touch: boolean,
  promptW: number,
  promptH: number,
): number {
  const obstacles = bottomLeftObstacles(camW, camH, touch);
  const x = camW / 2 - promptW / 2;
  let centerY = camH - PROMPT_BOTTOM_OFFSET;
  for (let moved = true; moved; ) {
    moved = false;
    const rect = { x, y: centerY - promptH / 2, w: promptW, h: promptH };
    for (const obstacle of obstacles) {
      if (!overlaps(rect, obstacle)) continue;
      centerY = obstacle.y - PROMPT_GAP - promptH / 2;
      moved = true;
      break;
    }
  }
  return centerY;
}
