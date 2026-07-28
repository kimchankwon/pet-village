/**
 * Derive raised-flipper wave poses from a finished penguin plate.
 *
 * The Imagine pipeline only produces walk plates (`down/up/side-{0,1,2}`), so
 * the wave frames are built by rotating the *real* plate art: find the viewer's
 * left flipper, keep its shoulder stub, and swing the rest up. Everything here is
 * plain RGBA maths on `{ width, height, data }` so it can be unit tested without
 * pngjs or a canvas.
 *
 * Pixel classes (the penguin plates are flat-shaded, so thresholds suffice):
 *   't' transparent · 'o' outline/near-black · 'B' recolourable body blue · 'x' other
 */

const ALPHA_THRESHOLD = 20;

export function pixelAt(image, x, y) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return [0, 0, 0, 0];
  const i = (image.width * y + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

export function writePixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (image.width * y + x) * 4;
  image.data[i] = color[0];
  image.data[i + 1] = color[1];
  image.data[i + 2] = color[2];
  image.data[i + 3] = color[3];
}

export function classifyPenguinPixel([r, g, b, a]) {
  if (a < ALPHA_THRESHOLD) return 't';
  if (r + g + b < 160) return 'o';
  if (b > 90 && b >= g - 5 && b > r + 10) return 'B';
  return 'x';
}

/**
 * Per row: the leftmost opaque pixel plus every outline run that separates two
 * filled runs — one of those is the outline the flipper shares with the body.
 */
export function scanFlipperRows(image, searchWidth = Math.floor(image.width * 0.45)) {
  const rows = [];
  for (let y = 0; y < image.height; y++) {
    const kinds = [];
    for (let x = 0; x < searchWidth; x++) kinds.push(classifyPenguinPixel(pixelAt(image, x, y)));
    const first = kinds.findIndex((kind) => kind !== 't');
    if (first < 0) {
      rows.push(null);
      continue;
    }
    const runs = [];
    let x = first;
    while (x < searchWidth) {
      if (kinds[x] !== 'o') {
        x += 1;
        continue;
      }
      let end = x;
      while (end + 1 < searchWidth && kinds[end + 1] === 'o') end += 1;
      const before = kinds[x - 1];
      const after = kinds[end + 1];
      if ((before === 'B' || before === 'x') && after === 'B') runs.push({ start: x, end });
      x = end + 1;
    }
    rows.push({ y, first, runs });
  }
  return rows;
}

/**
 * The flipper band is the longest vertical run of rows whose shared-outline
 * column drifts smoothly. Following the nearest run per row keeps the walk from
 * jumping onto the flipper's own outer edge (a 1px staircase) or onto the belly.
 */
export function findFlipperBand(image, options = {}) {
  const maxLeft = options.maxLeft ?? image.width * 0.2;
  const maxDrift = options.maxDrift ?? 24;
  const scan = options.scan ?? scanFlipperRows(image);

  const walk = (startY) => {
    const band = [];
    let sep = -1;
    for (let y = startY; y < image.height; y++) {
      const row = scan[y];
      if (!row || !row.runs.length || row.first >= maxLeft) break;
      const pick = sep < 0
        ? row.runs[row.runs.length - 1]
        : row.runs.reduce((a, b) => (Math.abs(b.start - sep) < Math.abs(a.start - sep) ? b : a));
      if (sep >= 0 && Math.abs(pick.start - sep) > maxDrift) break;
      sep = pick.start;
      band.push({ y, first: row.first, sep: pick.start, sepEnd: pick.end });
    }
    return band;
  };

  let rows = [];
  for (let y = 0; y < image.height; y++) {
    if (!scan[y] || !scan[y].runs.length) continue;
    const band = walk(y);
    if (band.length > rows.length) rows = band;
  }
  if (!rows.length) return null;

  // Pivot on the flipper's top-*outer* corner. The flipper is ~145px long with
  // only ~30px of plate to its left, so swinging it about the shoulder (the
  // top-inner pixel) either runs off the plate edge or folds the flipper back
  // over the body, where it vanishes into the same blue. Pivoting on the outer
  // corner lifts it into the empty plate beside the head instead.
  const pivot = { x: rows[0].first, y: rows[0].y };

  const pixels = [];
  for (const row of rows) {
    for (let x = row.first; x < row.sep; x++) {
      const color = pixelAt(image, x, row.y);
      if (color[3] < ALPHA_THRESHOLD) continue;
      pixels.push({ x, y: row.y, color, outline: classifyPenguinPixel(color) === 'o' });
    }
  }
  return { rows, pivot, pixels };
}

/** Share of the flipper that stays welded to the body as a shoulder stub. */
export const STUB_FRACTION = 0.14;

/**
 * Copy `image` with the flipper erased and redrawn rotated `angleDeg` towards
 * the viewer's left about `band.pivot`.
 *
 * Sampling is destination-driven: every candidate pixel asks which source pixel
 * rotates onto it. Forward-painting each source pixel instead leaves holes — a
 * rotation spreads neighbours apart — which shredded the flipper into slivers.
 */
export function raiseFlipper(image, band, angleDeg, options = {}) {
  // `new Uint8Array` and not `data.slice()`: pngjs hands over a Buffer, whose
  // `slice` is a view on the same memory, so every frame would stack onto the
  // previous one and the wave would fan out into three flippers.
  const out = { width: image.width, height: image.height, data: new Uint8Array(image.data) };
  // The top of the flipper stays put as a shoulder stub: it keeps the silhouette
  // from denting where the flipper used to be, and it bridges the raised flipper
  // back to the body so the pose reads as an arm and not a floating stick.
  const stubRows = Math.round(band.rows.length * (options.stub ?? STUB_FRACTION));
  const stubBelow = band.rows[stubRows]?.y ?? band.pivot.y;
  const moving = band.pixels.filter((pixel) => pixel.y >= stubBelow);
  const source = new Map();
  for (const pixel of moving) {
    source.set(pixel.y * image.width + pixel.x, pixel);
    writePixel(out, pixel.x, pixel.y, [0, 0, 0, 0]);
  }

  const theta = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pixel of moving) {
    const dx = pixel.x - band.pivot.x;
    const dy = pixel.y - band.pivot.y;
    const bx = Math.round(band.pivot.x + dx * cos - dy * sin);
    const by = Math.round(band.pivot.y + dx * sin + dy * cos);
    minX = Math.min(minX, bx);
    maxX = Math.max(maxX, bx);
    minY = Math.min(minY, by);
    maxY = Math.max(maxY, by);
  }

  for (let y = minY - 1; y <= maxY + 1; y++) {
    for (let x = minX - 1; x <= maxX + 1; x++) {
      const dx = x - band.pivot.x;
      const dy = y - band.pivot.y;
      const sx = Math.round(band.pivot.x + dx * cos + dy * sin);
      const sy = Math.round(band.pivot.y - dx * sin + dy * cos);
      const hit = source.get(sy * image.width + sx);
      if (hit) writePixel(out, x, y, hit.color);
    }
  }
  return out;
}

/**
 * Wave frames 1–3 of `WAVE_FRAME_SEQUENCE` (frame 0 is the idle plate), so the
 * one-shot snaps the flipper up on frame 1 and then wiggles it, the way Club
 * Penguin's wave reads: an up-and-held flipper, not a slow arc.
 *
 * All three are near a half turn about the outer corner, which is what keeps the
 * whole flipper on the plate: shallower angles swing the tip past the left edge.
 */
export const WAVE_ANGLES = [165, 172, 180];
