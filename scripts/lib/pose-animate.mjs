/**
 * Pose animation helpers for chibi pixel sprites.
 *
 * Prefer non-destructive body motion. Face changes are careful overlays so
 * Imagine / hand-authored idle faces are not wiped into dots.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

/** @typedef {[number, number, number, number]} RGBA */

export function clonePng(src) {
  const out = new PNG({ width: src.width, height: src.height });
  src.data.copy(out.data);
  return out;
}

export function getPx(png, x, y) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return [0, 0, 0, 0];
  const i = (png.width * y + x) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

export function setPx(png, x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = c[0];
  png.data[i + 1] = c[1];
  png.data[i + 2] = c[2];
  png.data[i + 3] = c[3];
}

function isOpaque(c) {
  return c[3] >= 20;
}
function isDark(c) {
  return isOpaque(c) && c[0] + c[1] + c[2] < 120;
}
function isNearWhite(c) {
  return isOpaque(c) && c[0] > 215 && c[1] > 215 && c[2] > 215;
}
function isSilhouetteEdge(png, x, y) {
  if (!isOpaque(getPx(png, x, y))) return false;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    if (!isOpaque(getPx(png, x + dx, y + dy))) return true;
  }
  return false;
}

export function contentBounds(png) {
  let x0 = png.width,
    y0 = png.height,
    x1 = 0,
    y1 = 0,
    n = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (!isOpaque(getPx(png, x, y))) continue;
      n++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (!n) return { x0: 0, y0: 0, x1: png.width - 1, y1: png.height - 1, cx: png.width / 2, cy: png.height / 2 };
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

export function sampleBodyColor(png) {
  const b = contentBounds(png);
  const votes = new Map();
  let whiteN = 0;
  let whiteC = [255, 255, 255, 255];
  for (let y = Math.floor(b.y0 + (b.y1 - b.y0) * 0.35); y <= Math.floor(b.y0 + (b.y1 - b.y0) * 0.75); y++) {
    for (let x = Math.floor(b.x0 + (b.x1 - b.x0) * 0.3); x <= Math.floor(b.x0 + (b.x1 - b.x0) * 0.7); x++) {
      const c = getPx(png, x, y);
      if (!isOpaque(c) || isDark(c)) continue;
      if (isNearWhite(c) || (c[0] > 200 && c[1] > 200 && c[2] > 200)) {
        whiteN++;
        whiteC = c;
        continue;
      }
      const k = `${c[0] >> 3},${c[1] >> 3},${c[2] >> 3}`;
      const cur = votes.get(k) || { c, n: 0 };
      cur.n++;
      votes.set(k, cur);
    }
  }
  // White rabbits / rice puffs: majority fill is white
  let colorN = 0;
  for (const v of votes.values()) colorN += v.n;
  if (whiteN > colorN && whiteN > 8) return whiteC;
  let best = null;
  for (const v of votes.values()) if (!best || v.n > best.n) best = v;
  return best?.c ?? whiteC;
}

export function shiftSprite(src, dx, dy) {
  const out = new PNG({ width: src.width, height: src.height });
  out.data.fill(0);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const c = getPx(src, x, y);
      if (isOpaque(c)) setPx(out, x + dx, y + dy, c);
    }
  }
  return out;
}

/**
 * Estimate eye/mouth rows. Prefers detecting white eye patches (puffles) and
 * dark smile curves in the lower face; falls back to proportional anchors.
 */
function faceLayout(png) {
  const b = contentBounds(png);
  const h = b.y1 - b.y0 + 1;
  const w = b.x1 - b.x0 + 1;
  const cx = Math.round(b.cx);

  // Detect white eye patches in upper 60% of body
  let eyeSumY = 0,
    eyeN = 0;
  const eyeXs = [];
  for (let y = b.y0; y <= b.y0 + Math.floor(h * 0.62); y++) {
    for (let x = b.x0 + 2; x <= b.x1 - 2; x++) {
      const c = getPx(png, x, y);
      if (!isNearWhite(c)) continue;
      if (isSilhouetteEdge(png, x, y)) continue;
      eyeSumY += y;
      eyeN++;
      eyeXs.push(x);
    }
  }

  let eyeY = Math.round(b.y0 + h * 0.38);
  let eyeDx = Math.max(2, Math.round(w * 0.15));
  if (eyeN >= 4) {
    eyeY = Math.round(eyeSumY / eyeN);
    eyeXs.sort((a, b) => a - b);
    const left = eyeXs.filter((x) => x < cx);
    const right = eyeXs.filter((x) => x >= cx);
    if (left.length && right.length) {
      const lx = left.reduce((s, v) => s + v, 0) / left.length;
      const rx = right.reduce((s, v) => s + v, 0) / right.length;
      eyeDx = Math.max(2, Math.round((rx - lx) / 2));
    }
  }

  // Detect dark smile in lower half (below eyes)
  let mouthSumY = 0,
    mouthN = 0;
  for (let y = Math.max(eyeY + 2, b.y0 + Math.floor(h * 0.45)); y <= b.y1 - 2; y++) {
    for (let x = Math.round(cx - w * 0.28); x <= Math.round(cx + w * 0.28); x++) {
      const c = getPx(png, x, y);
      if (!isDark(c) || isSilhouetteEdge(png, x, y)) continue;
      mouthSumY += y;
      mouthN++;
    }
  }
  const mouthY =
    mouthN >= 3 ? Math.round(mouthSumY / mouthN) : Math.round(b.y0 + h * 0.62);

  return { b, eyeY, mouthY, cx, eyeDx, h, w };
}

function putOnBody(png, x, y, c) {
  const px = Math.round(x);
  const py = Math.round(y);
  // Allow stamping on body or just inside silhouette
  if (!isOpaque(getPx(png, px, py)) && !isOpaque(getPx(png, px, py + 1)) && !isOpaque(getPx(png, px, py - 1))) {
    return;
  }
  setPx(png, px, py, c);
}

/** Paint over the mouth area with body color (interior only). */
function clearMouthBand(png, layout, body, halfW = 6) {
  const { cx, mouthY, b } = layout;
  for (let y = mouthY - 2; y <= mouthY + 4; y++) {
    for (let x = Math.round(cx - halfW); x <= Math.round(cx + halfW); x++) {
      if (x <= b.x0 + 1 || x >= b.x1 - 1) continue;
      const c = getPx(png, x, y);
      if (!isOpaque(c) || isSilhouetteEdge(png, x, y)) continue;
      // Wipe smile ink and accidental white/light mouth fills
      const lum = (c[0] + c[1] + c[2]) / 3;
      if (isDark(c) || isNearWhite(c) || lum > 200) setPx(png, x, y, body);
    }
  }
}

/**
 * Sleep: turn white eye patches into closed lids; flatten mouth slightly.
 */
export function sleepPose(idle, opts = {}) {
  const body = sampleBodyColor(idle);
  const ink = opts.ink ?? [0, 0, 0, 255];
  const out = clonePng(idle);
  const layout = faceLayout(out);
  const { b, eyeY, mouthY, cx, eyeDx } = layout;

  // 1) Find and fill white eye clusters in upper face with body color
  for (let y = b.y0 + 1; y <= Math.min(b.y1 - 2, eyeY + 5); y++) {
    for (let x = b.x0 + 2; x <= b.x1 - 2; x++) {
      const c = getPx(out, x, y);
      if (!isNearWhite(c)) continue;
      if (isSilhouetteEdge(out, x, y)) continue;
      setPx(out, x, y, body);
    }
  }

  // 2) Soften existing open-eye dark ink in eye band (not silhouette)
  for (let y = eyeY - 3; y <= eyeY + 3; y++) {
    for (let x = b.x0 + 2; x <= b.x1 - 2; x++) {
      const c = getPx(out, x, y);
      if (!isDark(c) || isSilhouetteEdge(out, x, y)) continue;
      // keep thick outline; only interior face dots
      setPx(out, x, y, body);
    }
  }

  // 3) Closed lids
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDx;
    for (let dx = -2; dx <= 2; dx++) putOnBody(out, ex + dx, eyeY + 1, ink);
    putOnBody(out, ex - 2, eyeY, ink);
    putOnBody(out, ex + 2, eyeY, ink);
  }

  // 4) Flatten smile → soft closed line (wider wipe for big puffle grins)
  clearMouthBand(out, layout, body, 8);
  for (let dx = -2; dx <= 2; dx++) putOnBody(out, cx + dx, mouthY + 1, ink);

  return out;
}

/**
 * Happy: hop up + cheerful mouth (keep original eyes — many idles already cute).
 */
export function happyPose(idle, opts = {}) {
  const body = sampleBodyColor(idle);
  const ink = opts.ink ?? [0, 0, 0, 255];
  const accent = opts.accent ?? [255, 140, 170, 255];
  const out = shiftSprite(idle, 0, -1);
  const layout = faceLayout(out);
  const { cx, eyeY, mouthY, eyeDx } = layout;

  // Cheerful ^ lids drawn on top (reads even over open eyes)
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDx;
    putOnBody(out, ex - 1, eyeY + 1, ink);
    putOnBody(out, ex, eyeY, ink);
    putOnBody(out, ex + 1, eyeY + 1, ink);
  }

  // Bigger smile
  clearMouthBand(out, layout, body);
  putOnBody(out, cx - 2, mouthY, ink);
  putOnBody(out, cx - 1, mouthY + 1, ink);
  putOnBody(out, cx, mouthY + 1, ink);
  putOnBody(out, cx + 1, mouthY + 1, ink);
  putOnBody(out, cx + 2, mouthY, ink);
  putOnBody(out, cx, mouthY, accent);
  putOnBody(out, cx - eyeDx - 2, mouthY - 1, accent);
  putOnBody(out, cx + eyeDx + 2, mouthY - 1, accent);

  return out;
}

/**
 * Sad: slump + downturned brows/mouth (preserve body art).
 */
export function sadPose(idle, opts = {}) {
  const body = sampleBodyColor(idle);
  const ink = opts.ink ?? [0, 0, 0, 255];
  const out = shiftSprite(idle, 0, 1);
  const layout = faceLayout(out);
  const { cx, eyeY, mouthY, eyeDx } = layout;

  // Downturned brow ticks over eyes
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDx;
    putOnBody(out, ex - 1, eyeY - 1, ink);
    putOnBody(out, ex, eyeY, ink);
    putOnBody(out, ex + 1, eyeY + (s > 0 ? -1 : 0), ink);
  }

  clearMouthBand(out, layout, body, 7);
  putOnBody(out, cx - 2, mouthY + 1, ink);
  putOnBody(out, cx - 1, mouthY, ink);
  putOnBody(out, cx, mouthY, ink);
  putOnBody(out, cx + 1, mouthY, ink);
  putOnBody(out, cx + 2, mouthY + 1, ink);

  return out;
}

/**
 * Walk: gentle foot shuffle only.
 *
 * Important: do NOT shift the whole sprite — bottom-aligned characters lose
 * feet when dy>0 or when legs are pushed past the canvas edge. Keep every
 * foot pixel on-canvas (clamp destinations).
 */
export function walkPose(idle, phase) {
  const out = clonePng(idle);
  const b = contentBounds(out);
  // Only the very bottom tip of the legs (avoid eating the whole lower body)
  const band = Math.max(2, Math.min(3, Math.round((b.y1 - b.y0) * 0.09)));
  const footTop = b.y1 - band + 1;
  // phase 1: left forward; phase 2: right forward
  const stride = phase === 1 ? 1 : -1;

  const feet = [];
  for (let y = footTop; y <= b.y1; y++) {
    for (let x = 0; x < out.width; x++) {
      const c = getPx(out, x, y);
      if (!isOpaque(c)) continue;
      feet.push({ x, y, c });
      setPx(out, x, y, [0, 0, 0, 0]);
    }
  }

  for (const p of feet) {
    const left = p.x < b.cx;
    let nx = p.x + (left ? stride : -stride);
    let ny = p.y;
    // Slight lift on the forward foot only
    const forward = (left && stride > 0) || (!left && stride < 0);
    if (forward) ny = p.y - 1;
    // Never drop pixels off the canvas
    nx = Math.max(0, Math.min(out.width - 1, nx));
    ny = Math.max(0, Math.min(out.height - 1, ny));
    // Prefer empty target; if occupied by body, keep original x
    if (isOpaque(getPx(out, nx, ny)) && !isOpaque(getPx(out, p.x, ny))) {
      nx = p.x;
    }
    setPx(out, nx, ny, p.c);
  }
  return out;
}

export function jumpPose(idle, opts = {}) {
  // Airborne with a happy face — only shift up if there is headroom
  const happy = happyPose(idle, opts);
  const b = contentBounds(happy);
  const dy = b.y0 >= 2 ? -2 : b.y0 >= 1 ? -1 : 0;
  return shiftSprite(happy, 0, dy);
}

export function bobPose(idle) {
  // Avoid shifting down when the sprite already sits on the bottom row
  // (that used to clip feet off bottom-aligned assets).
  const b = contentBounds(idle);
  if (b.y1 >= idle.height - 1) return clonePng(idle);
  return shiftSprite(idle, 0, 1);
}

export function petPosesFromIdle(idle, opts = {}) {
  return {
    neutral1: clonePng(idle),
    neutral2: bobPose(idle),
    walk1: walkPose(idle, 1),
    walk2: walkPose(idle, 2),
    happy: happyPose(idle, opts),
    sad: sadPose(idle, opts),
    sleep: sleepPose(idle, opts),
    jump: jumpPose(idle, opts),
  };
}

export function npcPosesFromIdle(idle, opts = {}) {
  return {
    idle: clonePng(idle),
    walk1: walkPose(idle, 1),
    walk2: walkPose(idle, 2),
    happy: happyPose(idle, opts),
    sad: sadPose(idle, opts),
    jump: jumpPose(idle, opts),
  };
}
