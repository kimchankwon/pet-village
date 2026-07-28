/**
 * Derive raised-flipper wave poses from a finished penguin plate.
 *
 * The Imagine pipeline only produces walk plates (`down/up/side-{0,1,2}`), so
 * the wave frames are built by rotating the *real* plate art: find the viewer's
 * left flipper, lift it out, and pivot it about the shoulder. Everything here is
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

  // Shoulder: top of the band, at the outline the flipper shares with the body.
  const pivot = { x: rows[0].sepEnd, y: rows[0].y };
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

/**
 * Copy `image` with the flipper erased and redrawn rotated `angleDeg` clockwise
 * about the shoulder. Forward-mapped with a 2×2 brush so the low-resolution
 * source never tears into slivers; outline pixels land last so the silhouette
 * keeps its border.
 */
export function raiseFlipper(image, band, angleDeg, options = {}) {
  const brush = options.brush ?? 2;
  const out = { width: image.width, height: image.height, data: image.data.slice() };
  for (const pixel of band.pixels) writePixel(out, pixel.x, pixel.y, [0, 0, 0, 0]);

  const theta = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const paint = (pixel) => {
    const dx = pixel.x - band.pivot.x;
    const dy = pixel.y - band.pivot.y;
    const bx = Math.round(band.pivot.x + dx * cos - dy * sin);
    const by = Math.round(band.pivot.y + dx * sin + dy * cos);
    for (let oy = 0; oy < brush; oy++) {
      for (let ox = 0; ox < brush; ox++) writePixel(out, bx + ox, by + oy, pixel.color);
    }
  };
  for (const pixel of band.pixels) if (!pixel.outline) paint(pixel);
  for (const pixel of band.pixels) if (pixel.outline) paint(pixel);
  return out;
}

/**
 * Wave frames 1–3 of `WAVE_FRAME_SEQUENCE` (frame 0 is the idle plate).
 * Angles stay between 120° and 160°: below that the raised flipper runs off the
 * left edge of the plate, above it the tip lands on the penguin's face.
 */
export const WAVE_ANGLES = [120, 142, 160];
