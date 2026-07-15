/**
 * Convert high-res Grok Imagine MINITEEN pixel-art plates into game sprites.
 *
 * Default: downsample to classic 32×42 chibi frames.
 * `--plate`: keep the source plate resolution (transparent bg + crop) so the
 * in-game art matches the Imagine look; Phaser scales it down with nearest
 * neighbour. Mark the villager `useSourcePlate: true` in miniteen.ts.
 *
 * Source plates: scripts/reference/miniteen/<id>.png
 *
 * Usage:
 *   npm run sprite:miniteen                    # all → 32×42
 *   npm run sprite:miniteen -- doa             # one → 32×42
 *   npm run sprite:miniteen -- --plate doa     # one → full plate frames
 *   npm run sprite:miniteen -- doa ocl
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { saveSprite } from './lib/save-sprite.mjs';
import { npcPosesFromIdle } from './lib/pose-animate.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

type RGBA = [number, number, number, number];
const OUT: RGBA = [0, 0, 0, 255];
const W = 32;
const H = 42;
const IDS = [
  'choitcherry','jjongtoram','shuasumi','ocl','tamtam','foxdungee','ppyopuli',
  'doa','kimja','thepalee','bboogyuli','nonver','chandalee',
] as const;
type MiniteenId = (typeof IDS)[number];
const ROOT = path.resolve('public/assets/npc/miniteen');
const REF = path.resolve('scripts/reference/miniteen');

/** CLI: `tsx scripts/imagine-to-miniteen.mts [--plate] [id ...]` — empty ids = all. */
function parseCli(argv: string[]): { plateMode: boolean; ids: MiniteenId[] } {
  const plateMode = argv.includes('--plate') || argv.includes('-p');
  const args = argv.filter((a) => a && !a.startsWith('-'));
  if (!args.length) return { plateMode, ids: [...IDS] };
  const unknown = args.filter((a) => !(IDS as readonly string[]).includes(a));
  if (unknown.length) {
    console.error(
      `Unknown MINITEEN id(s): ${unknown.join(', ')}\n` +
        `Known: ${IDS.join(', ')}`,
    );
    process.exit(1);
  }
  return { plateMode, ids: args as MiniteenId[] };
}

function blank(w = W, h = H) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0);
  return png;
}
function clone(src: InstanceType<typeof PNG>) {
  const out = blank(src.width, src.height);
  src.data.copy(out.data);
  return out;
}
function get(png: InstanceType<typeof PNG>, x: number, y: number): RGBA {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return [0, 0, 0, 0];
  const i = (png.width * y + x) << 2;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!, png.data[i + 3]!];
}
function set(png: InstanceType<typeof PNG>, x: number, y: number, c: RGBA) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = c[3];
}

/** Exterior flood-fill: near-uniform plate color reachable from the border. */
function removeExterior(src: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const out = clone(src);
  const w = src.width, h = src.height;
  const exterior = new Uint8Array(w * h);
  const queue: number[] = [];
  // Sample corner colors as bg anchors
  const corners = [get(src, 2, 2), get(src, w - 3, 2), get(src, 2, h - 3), get(src, w - 3, h - 3)];
  const bgLike = (c: RGBA) => {
    if (c[3] < 20) return true;
    for (const bg of corners) {
      if (Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) < 28) return true;
    }
    // Also pure-ish light grays/whites only if very close to corner avg
    const avg = corners.reduce((s, b) => s + (b[0] + b[1] + b[2]) / 3, 0) / corners.length;
    const lum = (c[0] + c[1] + c[2]) / 3;
    const sat = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
    if (sat < 14 && Math.abs(lum - avg) < 22 && lum > 200) return true;
    return false;
  };
  const enq = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (exterior[i]) return;
    if (!bgLike(get(src, x, y))) return;
    exterior[i] = 1;
    queue.push(i);
  };
  for (let x = 0; x < w; x++) { enq(x, 0); enq(x, h - 1); }
  for (let y = 0; y < h; y++) { enq(0, y); enq(w - 1, y); }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi]!;
    const x = i % w, y = Math.floor(i / w);
    enq(x + 1, y); enq(x - 1, y); enq(x, y + 1); enq(x, y - 1);
  }
  for (let i = 0; i < w * h; i++) {
    if (exterior[i]) out.data.fill(0, i * 4, i * 4 + 4);
  }
  return out;
}

function contentBounds(src: InstanceType<typeof PNG>) {
  let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0, n = 0;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (get(src, x, y)[3] < 20) continue;
      n++;
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
  }
  if (!n) {
    throw new Error(
      'No opaque foreground pixels after background removal — plate may be empty or fully keyed as exterior',
    );
  }
  return {
    x0: Math.max(0, x0 - 1), y0: Math.max(0, y0 - 1),
    x1: Math.min(src.width - 1, x1 + 1), y1: Math.min(src.height - 1, y1 + 1),
  };
}

function quantize(c: RGBA): RGBA {
  if (c[3] < 20) return [0, 0, 0, 0];
  // Dark → pure outline / eye ink
  if (c[0] + c[1] + c[2] < 120) return OUT;
  // Near-white glints stay white (eye highlights, accents)
  if (c[0] > 230 && c[1] > 230 && c[2] > 230) return [255, 255, 255, 255];
  const step = 16;
  return [
    Math.min(255, Math.round(c[0] / step) * step),
    Math.min(255, Math.round(c[1] / step) * step),
    Math.min(255, Math.round(c[2] / step) * step),
    255,
  ];
}

/**
 * Harden soft Imagine anti-alias into flat pixel colours before downsample.
 * Keeps ears/clothes/accessories glued to the body instead of fraying into holes.
 */
function hardenPlate(src: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const out = clone(src);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const c = get(src, x, y);
      if (c[3] < 20) {
        set(out, x, y, [0, 0, 0, 0]);
        continue;
      }
      set(out, x, y, quantize(c));
    }
  }
  return out;
}

function majority(src: InstanceType<typeof PNG>, x0: number, y0: number, x1: number, y1: number): RGBA {
  const votes = new Map<string, { c: RGBA; n: number }>();
  let dark = 0, total = 0, cells = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      cells++;
      const raw = get(src, x, y);
      if (raw[3] < 20) continue;
      total++;
      const lum = (raw[0] + raw[1] + raw[2]) / 3;
      if (lum < 80) dark++;
      const c = quantize(raw);
      const k = c.join(',');
      const cur = votes.get(k);
      if (cur) cur.n++; else votes.set(k, { c, n: 1 });
    }
  }
  // Mostly empty cell → transparent (do not invent body from AA fringe)
  if (cells > 0 && total / cells < 0.28) return [0, 0, 0, 0];
  // Preserve eyes/mouth/brows: enough dark ink → solid black
  if (total > 0 && dark / total >= 0.18) return OUT;
  let best: { c: RGBA; n: number } | null = null;
  for (const v of votes.values()) {
    // Prefer saturated body fills over sparse transparent winners
    const weight = v.n * (v.c[3] > 0 ? 12 : 1) + (v.c[0] + v.c[1] + v.c[2] > 100 ? 1 : 0);
    if (!best || weight > best.n) best = { c: v.c, n: weight };
  }
  return best?.c ?? [0, 0, 0, 0];
}

/**
 * Multi-pass interior hole fill so limbs/ears stay solid on the body.
 * Only fills transparent pixels NOT connected to the canvas edge, so we
 * never dilate the exterior silhouette or bridge separate features.
 */
function fillInteriorHoles(out: InstanceType<typeof PNG>, passes = 3) {
  const ow = out.width, oh = out.height;
  // Mark exterior (transparent flood from the border)
  const exterior = new Uint8Array(ow * oh);
  const queue: number[] = [];
  const enq = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= ow || y >= oh) return;
    const i = y * ow + x;
    if (exterior[i]) return;
    if (get(out, x, y)[3] >= 20) return;
    exterior[i] = 1;
    queue.push(i);
  };
  for (let x = 0; x < ow; x++) {
    enq(x, 0);
    enq(x, oh - 1);
  }
  for (let y = 0; y < oh; y++) {
    enq(0, y);
    enq(ow - 1, y);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi]!;
    const x = i % ow;
    const y = Math.floor(i / ow);
    enq(x + 1, y);
    enq(x - 1, y);
    enq(x, y + 1);
    enq(x, y - 1);
  }

  for (let p = 0; p < passes; p++) {
    const adds: { x: number; y: number; c: RGBA }[] = [];
    for (let y = 1; y < oh - 1; y++) {
      for (let x = 1; x < ow - 1; x++) {
        const i = y * ow + x;
        if (exterior[i] || get(out, x, y)[3] > 0) continue;
        let n = 0; let sr = 0, sg = 0, sb = 0;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]] as const) {
          const c = get(out, x + dx, y + dy);
          if (c[3] > 0 && c[0] + c[1] + c[2] > 100) {
            n++; sr += c[0]; sg += c[1]; sb += c[2];
          }
        }
        // 4-connected strict on first pass; looser later for thin ears
        const need = p === 0 ? 3 : 2;
        if (n >= need) {
          adds.push({ x, y, c: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n), 255] });
        }
      }
    }
    for (const a of adds) set(out, a.x, a.y, a.c);
  }
}

/**
 * Solidify hollow eye rings (common after majority downsample of glossy eyes).
 * Fills enclosed dark rings in the upper face with black + a white glint.
 * Safe for all miniteens: only acts on small dark-ring cavities.
 * (32×42 mode only — plate mode keeps Imagine eyes as-is.)
 */
function solidifyEyes(out: InstanceType<typeof PNG>) {
  const ow = out.width, oh = out.height;
  // Only meaningful on tiny game frames
  if (ow > 64 || oh > 64) return;
  const b = contentBounds(out);
  const faceTop = b.y0 + 1;
  const faceBot = Math.min(b.y1 - 4, b.y0 + Math.floor((b.y1 - b.y0) * 0.55));
  const visited = new Uint8Array(ow * oh);
  const isDark = (c: RGBA) => c[3] > 20 && c[0] + c[1] + c[2] < 90;
  const isEmpty = (c: RGBA) => c[3] < 20;

  for (let y = faceTop; y <= faceBot; y++) {
    for (let x = b.x0 + 2; x <= b.x1 - 2; x++) {
      const i = y * ow + x;
      if (visited[i]) continue;
      if (!isEmpty(get(out, x, y))) continue;
      // Flood empty cavity; require it to be small and mostly ringed by dark ink
      const q = [i];
      visited[i] = 1;
      const cells: number[] = [];
      let darkN = 0, edgeN = 0, openBorder = false;
      while (q.length) {
        const ci = q.pop()!;
        cells.push(ci);
        const cx = ci % ow, cy = Math.floor(ci / ow);
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= ow || ny >= oh) { openBorder = true; continue; }
          const ni = ny * ow + nx;
          const c = get(out, nx, ny);
          if (isEmpty(c)) {
            if (!visited[ni]) { visited[ni] = 1; q.push(ni); }
          } else {
            edgeN++;
            if (isDark(c)) darkN++;
          }
        }
      }
      if (openBorder) continue;
      if (cells.length < 1 || cells.length > 14) continue;
      if (edgeN === 0 || darkN / edgeN < 0.55) continue;
      // Fill cavity black
      for (const ci of cells) {
        const cx = ci % ow, cy = Math.floor(ci / ow);
        set(out, cx, cy, OUT);
      }
      // White glint on the uppermost-leftmost cavity cell (not minX×minY combo)
      const glint = cells.reduce((best, ci) => {
        const x = ci % ow;
        const y = Math.floor(ci / ow);
        const bx = best % ow;
        const by = Math.floor(best / ow);
        return y < by || (y === by && x < bx) ? ci : best;
      });
      set(out, glint % ow, Math.floor(glint / ow), [255, 255, 255, 255]);
    }
  }
}

/**
 * Keep the Imagine plate almost as-is: key exterior, crop to content.
 * Optional max side so walk variants stay manageable in git/browser.
 */
const PLATE_MAX_SIDE = 512;

function toPlateSprite(raw: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const keyed = removeExterior(raw);
  const b = contentBounds(keyed);
  const pad = 6;
  const x0 = Math.max(0, b.x0 - pad);
  const y0 = Math.max(0, b.y0 - pad);
  const x1 = Math.min(keyed.width - 1, b.x1 + pad);
  const y1 = Math.min(keyed.height - 1, b.y1 + pad);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  // Nearest-neighbour shrink only if larger than the cap (preserves chunky pixels)
  const fit = Math.min(1, PLATE_MAX_SIDE / Math.max(cw, ch));
  const tw = Math.max(8, Math.round(cw * fit));
  const th = Math.max(10, Math.round(ch * fit));
  const out = blank(tw, th);
  for (let gy = 0; gy < th; gy++) {
    for (let gx = 0; gx < tw; gx++) {
      const sx = x0 + Math.min(cw - 1, Math.floor((gx / tw) * cw));
      const sy = y0 + Math.min(ch - 1, Math.floor((gy / th) * ch));
      const c = get(keyed, sx, sy);
      if (c[3] > 20) set(out, gx, gy, [c[0], c[1], c[2], 255]);
    }
  }
  return out;
}

function writePng(png: InstanceType<typeof PNG>, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Plate frames are large — skip outline repair (keeps Imagine edges intact).
  fs.writeFileSync(file, PNG.sync.write(png));
}

/**
 * Fit plate content into 32×42 via majority sampling.
 * Content is bottom-aligned so walk feet stay on the canvas.
 */
function toGameSprite(raw: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const keyed = removeExterior(raw);
  const src = hardenPlate(keyed);
  const b = contentBounds(src);
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const maxW = W - 2, maxH = H - 2;
  const scale = Math.min(maxW / cw, maxH / ch);
  const tw = Math.max(8, Math.round(cw * scale));
  const th = Math.max(10, Math.round(ch * scale));
  const ox = Math.floor((W - tw) / 2);
  const oy = H - 1 - th;
  const out = blank();
  for (let gy = 0; gy < th; gy++) {
    for (let gx = 0; gx < tw; gx++) {
      const sx0 = b.x0 + Math.floor((gx / tw) * cw);
      const sx1 = b.x0 + Math.floor(((gx + 1) / tw) * cw);
      const sy0 = b.y0 + Math.floor((gy / th) * ch);
      const sy1 = b.y0 + Math.floor(((gy + 1) / th) * ch);
      const c = majority(src, sx0, sy0, Math.max(sx0 + 1, sx1), Math.max(sy0 + 1, sy1));
      if (c[3] > 0) set(out, ox + gx, oy + gy, c);
    }
  }
  fillInteriorHoles(out, 4);
  solidifyEyes(out);
  return out;
}

const NPC_POSE_NAMES = ['idle', 'walk1', 'walk2', 'happy', 'sad', 'jump'] as const;

/** Prefer Grok Imagine pose plates when present (see scripts/reference/miniteen/poses/). */
function findPosePlate(id: string, pose: string): string | null {
  const candidates = [
    path.join(REF, 'poses', id, `${pose}.png`),
    path.join(REF, `${id}-${pose}.png`),
    // idle may still live at the top-level plate path
    pose === 'idle' ? path.join(REF, `${id}-imagine.png`) : '',
    pose === 'idle' ? path.join(REF, `${id}.png`) : '',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function processOne(id: string, idleSrcPath: string, plateMode: boolean) {
  const convert = plateMode ? toPlateSprite : toGameSprite;
  // Prefer poses/<id>/idle.png (Imagine) then the top-level plate path.
  const idlePath = findPosePlate(id, 'idle') ?? idleSrcPath;
  const idle = convert(PNG.sync.read(fs.readFileSync(idlePath)));
  // Prefer per-pose Imagine plates; fall back to gentle pose-animate from idle
  // (still at plate resolution — never majority-downsample to 32×42 in --plate mode).
  const procedural = npcPosesFromIdle(idle, { ink: OUT, accent: [255, 140, 170, 255] });
  const dir = path.join(ROOT, id);
  const sources: string[] = [];
  for (const pose of NPC_POSE_NAMES) {
    const posePlate = findPosePlate(id, pose);
    let png: InstanceType<typeof PNG>;
    if (posePlate) {
      png = convert(PNG.sync.read(fs.readFileSync(posePlate)));
      sources.push(`${pose}←imagine`);
    } else if (pose === 'idle') {
      png = idle;
      sources.push('idle←plate');
    } else {
      png = procedural[pose]!;
      sources.push(`${pose}←animate`);
    }
    if (!plateMode) {
      solidifyEyes(png);
      saveSprite(png, path.join(dir, `${pose}.png`), { repairOutline: true, outline: OUT });
    } else {
      writePng(png, path.join(dir, `${pose}.png`));
    }
  }
  let n = 0;
  for (let i = 3; i < idle.data.length; i += 4) if (idle.data[i]! > 20) n++;
  console.log(
    `  ${id}: ${idle.width}×${idle.height} · ${n} opaque px` +
      `${plateMode ? ' (source plate)' : ''} · ${sources.join(' ')}`,
  );
}

const { plateMode, ids: selected } = parseCli(process.argv.slice(2));
console.log(
  `MINITEEN Imagine → ${plateMode ? `source plate (max ${PLATE_MAX_SIDE}px)` : '32×42'} ` +
    `(${selected.length}/${IDS.length}: ${selected.join(', ')})`,
);
const fallback = '/tmp/pv-imagine/miniteen';
const plates: { id: string; srcPath: string }[] = [];
const missing: string[] = [];
for (const id of selected) {
  // Prefer poses/<id>/idle.png, then top-level plates, then /tmp fallback.
  const found = [
    path.join(REF, 'poses', id, 'idle.png'),
    path.join(REF, `${id}-imagine.png`),
    path.join(REF, `${id}.png`),
    path.join(fallback, `${id}.png`),
  ].find((p) => fs.existsSync(p));
  if (!found) missing.push(id);
  else plates.push({ id, srcPath: found });
}
if (missing.length) {
  console.error(
    `Missing ${missing.length}/${selected.length} MINITEEN plate(s): ${missing.join(', ')}\n` +
      `Expected under ${REF}/<id>.png or ${REF}/<id>-imagine.png (or ${fallback}/<id>.png)`,
  );
  process.exit(1);
}
for (const { id, srcPath } of plates) {
  console.log(`  plate ${id} ← ${path.relative(process.cwd(), srcPath)}`);
  processOne(id, srcPath, plateMode);
}
if (plateMode) {
  console.log(
    'Note: set useSourcePlate: true on that villager in src/systems/miniteen.ts ' +
      'so Phaser scales the plate to match other NPCs (nearest-neighbour).',
  );
}
console.log('Done.');
