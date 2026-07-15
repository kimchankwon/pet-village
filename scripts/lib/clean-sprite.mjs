/**
 * Remove stray pixels outside a character silhouette:
 *  1) Drop small disconnected opaque islands (orphans)
 *  2) Peel non-outline colored halo pixels that sit on the exterior edge
 *     (Imagine AA freckles outside the black outline)
 *  3) Optionally re-run external outline repair
 */
import { createRequire } from 'node:module';
import { repairExternalOutline } from './pixel-outline.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const NEIGH4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const NEIGH8 = [
  ...NEIGH4,
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function isOpaque(image, x, y, alphaThreshold = 20) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
  return image.data[(image.width * y + x) * 4 + 3] >= alphaThreshold;
}

function isDarkOutline(image, x, y, outline, tolerance = 40) {
  if (!isOpaque(image, x, y)) return false;
  const i = (image.width * y + x) * 4;
  return (
    Math.abs(image.data[i] - outline[0]) <= tolerance &&
    Math.abs(image.data[i + 1] - outline[1]) <= tolerance &&
    Math.abs(image.data[i + 2] - outline[2]) <= tolerance
  );
}

function isNearOutlineLuma(image, x, y, maxLuma = 90) {
  if (!isOpaque(image, x, y)) return false;
  const i = (image.width * y + x) * 4;
  return image.data[i] + image.data[i + 1] + image.data[i + 2] < maxLuma;
}

/**
 * Keep only the largest 8-connected opaque component.
 * Small detached dots / pose-animate debris are erased.
 */
export function keepLargestComponent(image, { alphaThreshold = 20, minKeepRatio = 0.02 } = {}) {
  const w = image.width;
  const h = image.height;
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  for (let start = 0; start < w * h; start++) {
    if (image.data[start * 4 + 3] < alphaThreshold || label[start] !== -1) continue;
    const id = sizes.length;
    sizes.push(0);
    const q = [start];
    label[start] = id;
    for (let qi = 0; qi < q.length; qi++) {
      const idx = q[qi];
      sizes[id]++;
      const x = idx % w;
      const y = (idx / w) | 0;
      for (const [dx, dy] of NEIGH8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nidx = ny * w + nx;
        if (label[nidx] !== -1) continue;
        if (image.data[nidx * 4 + 3] < alphaThreshold) continue;
        label[nidx] = id;
        q.push(nidx);
      }
    }
  }
  if (!sizes.length) return { removed: 0, components: 0 };

  const biggest = sizes.indexOf(Math.max(...sizes));
  const largest = sizes[biggest];
  // Keep largest always. Also keep substantial secondary masses (stacked
  // characters). Drop freckles, floating feet debris, detached hair stubs.
  const sizeFloor = Math.max(15, Math.floor(largest * (minKeepRatio ?? 0.08)));
  const keep = new Set([biggest]);
  for (let id = 0; id < sizes.length; id++) {
    if (id === biggest) continue;
    if (sizes[id] >= sizeFloor) keep.add(id);
  }

  let removed = 0;
  for (let i = 0; i < w * h; i++) {
    if (label[i] === -1) continue;
    if (keep.has(label[i])) continue;
    image.data.fill(0, i * 4, i * 4 + 4);
    removed++;
  }
  return { removed, components: sizes.length, kept: keep.size };
}

/**
 * Transparent pixels reachable from the canvas border.
 */
function exteriorMask(image, alphaThreshold = 20) {
  const w = image.width;
  const h = image.height;
  const exterior = new Uint8Array(w * h);
  const q = [];
  const enq = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (exterior[idx]) return;
    if (image.data[idx * 4 + 3] >= alphaThreshold) return;
    exterior[idx] = 1;
    q.push(idx);
  };
  for (let x = 0; x < w; x++) {
    enq(x, 0);
    enq(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enq(0, y);
    enq(w - 1, y);
  }
  for (let qi = 0; qi < q.length; qi++) {
    const idx = q[qi];
    const x = idx % w;
    const y = (idx / w) | 0;
    enq(x + 1, y);
    enq(x - 1, y);
    enq(x, y + 1);
    enq(x, y - 1);
  }
  return exterior;
}

/**
 * Sample dominant non-outline body fill (mode of interior opaque colors).
 */
function sampleDominantBody(image, outline, alphaThreshold = 20) {
  const votes = new Map();
  for (let y = 1; y < image.height - 1; y++) {
    for (let x = 1; x < image.width - 1; x++) {
      if (!isOpaque(image, x, y, alphaThreshold)) continue;
      if (isDarkOutline(image, x, y, outline, 35)) continue;
      // Prefer interior (not exterior-touching) for sampling
      let edge = false;
      for (const [dx, dy] of NEIGH4) {
        if (!isOpaque(image, x + dx, y + dy, alphaThreshold)) {
          edge = true;
          break;
        }
      }
      if (edge) continue;
      const i = (image.width * y + x) * 4;
      const k = `${image.data[i] >> 3},${image.data[i + 1] >> 3},${image.data[i + 2] >> 3}`;
      const cur = votes.get(k) || {
        c: [image.data[i], image.data[i + 1], image.data[i + 2], 255],
        n: 0,
      };
      cur.n++;
      votes.set(k, cur);
    }
  }
  let best = null;
  for (const v of votes.values()) if (!best || v.n > best.n) best = v;
  return best?.c ?? null;
}

function isNearWhite(r, g, b) {
  return r >= 230 && g >= 230 && b >= 230;
}

/**
 * Sample up to `maxColors` dominant non-outline body fills (mode clusters).
 * Skips pure white eye/highlight clusters unless white is the majority fill
 * (white puffle / pale characters).
 */
function sampleDominantBodies(image, outline, alphaThreshold = 20, maxColors = 2) {
  const votes = new Map();
  let totalNonOutline = 0;
  let whiteCount = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!isOpaque(image, x, y, alphaThreshold)) continue;
      if (isDarkOutline(image, x, y, outline, 35)) continue;
      totalNonOutline++;
      const i = (image.width * y + x) * 4;
      if (isNearWhite(image.data[i], image.data[i + 1], image.data[i + 2])) {
        whiteCount++;
      }
      let edge = false;
      for (const [dx, dy] of NEIGH4) {
        if (!isOpaque(image, x + dx, y + dy, alphaThreshold)) {
          edge = true;
          break;
        }
      }
      const k = `${image.data[i] >> 3},${image.data[i + 1] >> 3},${image.data[i + 2] >> 3}`;
      const cur = votes.get(k) || {
        c: [image.data[i], image.data[i + 1], image.data[i + 2], 255],
        n: 0,
        interior: 0,
      };
      cur.n++;
      if (!edge) cur.interior++;
      votes.set(k, cur);
    }
  }
  const whiteIsBody = totalNonOutline > 0 && whiteCount / totalNonOutline >= 0.35;
  const ranked = [...votes.values()]
    .filter((v) => whiteIsBody || !isNearWhite(v.c[0], v.c[1], v.c[2]))
    .sort((a, b) => {
      if (b.interior !== a.interior) return b.interior - a.interior;
      return b.n - a.n;
    });
  // Keep colors that are a meaningful share of the fill (≥3% or top interior)
  const minN = Math.max(3, Math.floor(totalNonOutline * 0.03));
  const picked = ranked.filter((v, idx) => idx === 0 || v.n >= minN).slice(0, maxColors);
  return picked.map((v) => v.c);
}

function matchesAnyBody(image, x, y, bodies, maxDist = 48) {
  if (!bodies?.length) return false;
  const i = (image.width * y + x) * 4;
  for (const body of bodies) {
    const dist = Math.hypot(
      image.data[i] - body[0],
      image.data[i + 1] - body[1],
      image.data[i + 2] - body[2],
    );
    if (dist < maxDist) return true;
  }
  return false;
}

/**
 * Count coarse color buckets for rare-color freckle detection.
 */
function colorHistogram(image, outline, alphaThreshold = 20) {
  const counts = new Map();
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!isOpaque(image, x, y, alphaThreshold)) continue;
      if (isDarkOutline(image, x, y, outline, 35)) continue;
      const i = (image.width * y + x) * 4;
      const k = `${image.data[i] >> 3},${image.data[i + 1] >> 3},${image.data[i + 2] >> 3}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Peel non-outline freckles on the exterior rim (Imagine AA debris).
 * Keeps outline + dominant body fill colors. Removes grey/cyan/odd halo
 * pixels even when they have several opaque neighbors. Rare colors on the
 * rim are always peeled (true freckles), even if RGB-close to a body sample.
 */
export function peelExteriorHalo(image, { outline = [0, 0, 0, 255], alphaThreshold = 20, maxPasses = 8 } = {}) {
  const bodies = sampleDominantBodies(image, outline, alphaThreshold, 2);
  let removed = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    const exterior = exteriorMask(image, alphaThreshold);
    const hist = colorHistogram(image, outline, alphaThreshold);
    const doomed = [];
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (!isOpaque(image, x, y, alphaThreshold)) continue;
        // Keep outline rim (true black / near-black)
        if (isDarkOutline(image, x, y, outline, 35) || isNearOutlineLuma(image, x, y, 70)) {
          continue;
        }
        let touchesExt = false;
        for (const [dx, dy] of NEIGH4) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
            touchesExt = true;
            break;
          }
          if (exterior[ny * image.width + nx]) {
            touchesExt = true;
            break;
          }
        }
        if (!touchesExt) continue;

        const i = (image.width * y + x) * 4;
        const bucket = `${image.data[i] >> 3},${image.data[i + 1] >> 3},${image.data[i + 2] >> 3}`;
        const bucketCount = hist.get(bucket) || 0;
        // Rare exterior colors are freckles (cyan AA, grey dots, etc.)
        if (bucketCount <= 4) {
          doomed.push(i);
          continue;
        }

        // Keep dominant body fill on the rim (solid silhouette edge)
        if (matchesAnyBody(image, x, y, bodies, 40)) {
          let opaqueN = 0;
          for (const [dx, dy] of NEIGH8) {
            if (isOpaque(image, x + dx, y + dy, alphaThreshold)) opaqueN++;
          }
          if (opaqueN >= 3) continue;
        }

        // Non-body exterior pixel → peel
        doomed.push(i);
      }
    }
    if (!doomed.length) break;
    for (const i of doomed) {
      image.data.fill(0, i, i + 4);
      removed++;
    }
  }
  return { removed };
}

/**
 * Remove exterior outline-only freckles that do not wrap any body fill
 * (stray black dots outside the character).
 */
export function pruneOutlineDebris(image, { outline = [0, 0, 0, 255], alphaThreshold = 20, maxPasses = 6 } = {}) {
  let removed = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    const exterior = exteriorMask(image, alphaThreshold);
    const doomed = [];
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (!isOpaque(image, x, y, alphaThreshold)) continue;
        if (!isDarkOutline(image, x, y, outline, 40) && !isNearOutlineLuma(image, x, y, 90)) {
          continue;
        }
        let touchesExt = false;
        for (const [dx, dy] of NEIGH4) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
            touchesExt = true;
            break;
          }
          if (exterior[ny * image.width + nx]) {
            touchesExt = true;
            break;
          }
        }
        if (!touchesExt) continue;

        // Keep outline that wraps body or sits on a solid rim
        let bodyN = 0;
        let opaqueN = 0;
        for (const [dx, dy] of NEIGH8) {
          if (!isOpaque(image, x + dx, y + dy, alphaThreshold)) continue;
          opaqueN++;
          if (
            !isDarkOutline(image, x + dx, y + dy, outline, 40) &&
            !isNearOutlineLuma(image, x + dx, y + dy, 90)
          ) {
            bodyN++;
          }
        }
        // Dangling outline freckle: no body nearby and weakly connected
        if (bodyN === 0 && opaqueN <= 2) {
          doomed.push((y * image.width + x) * 4);
        }
      }
    }
    if (!doomed.length) break;
    for (const i of doomed) {
      image.data.fill(0, i, i + 4);
      removed++;
    }
  }
  return { removed };
}

/**
 * Full cleanup pipeline for a PNG sprite buffer/object.
 * Mutates and returns the image.
 */
export function cleanSpriteExterior(image, options = {}) {
  const outline = options.outline ?? [0, 0, 0, 255];
  const alphaThreshold = options.alphaThreshold ?? 20;
  const repairOutline = options.repairOutline !== false;

  // Zero soft AA crumbs (alpha 1–threshold) so they don't read as freckles
  let softRemoved = 0;
  for (let i = 3; i < image.data.length; i += 4) {
    const a = image.data[i];
    if (a > 0 && a < alphaThreshold) {
      image.data.fill(0, i - 3, i + 1);
      softRemoved++;
    }
  }

  const a = keepLargestComponent(image, {
    alphaThreshold,
    minKeepRatio: options.minKeepRatio ?? 0.02,
  });
  const b = peelExteriorHalo(image, { outline, alphaThreshold });
  const c = pruneOutlineDebris(image, { outline, alphaThreshold });

  let result = image;
  if (repairOutline) {
    result = repairExternalOutline(image, {
      outline,
      tolerance: options.tolerance ?? 0,
      alphaThreshold: options.alphaThresholdRepair ?? 128,
    });
    // Copy repaired data back if a new buffer was returned
    if (result !== image && result.data) {
      image.data = Buffer.from(result.data);
      result = image;
    }
    // After outline rebuild, drop any new outline-only freckles
    const d = pruneOutlineDebris(image, { outline, alphaThreshold });
    c.removed += d.removed;
  }

  return {
    image: result,
    orphansRemoved: a.removed,
    haloRemoved: b.removed + c.removed + softRemoved,
    components: a.components,
  };
}

/**
 * Load → clean → write a PNG file in place.
 */
export function cleanSpriteFile(file, options = {}) {
  const fs = require('node:fs');
  const buf = fs.readFileSync(file);
  const png = PNG.sync.read(buf);
  // Ensure Buffer data
  if (!(png.data instanceof Buffer)) png.data = Buffer.from(png.data);
  const stats = cleanSpriteExterior(png, options);
  fs.writeFileSync(file, PNG.sync.write(png));
  return stats;
}
