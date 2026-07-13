const BODY_NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const OUTLINE_NEIGHBORS = [
  ...BODY_NEIGHBORS,
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function pixelOffset(image, x, y) {
  return (y * image.width + x) * 4;
}

function inBounds(image, x, y) {
  return x >= 0 && y >= 0 && x < image.width && y < image.height;
}

function isTransparent(image, x, y, alphaThreshold) {
  return !inBounds(image, x, y) || image.data[pixelOffset(image, x, y) + 3] < alphaThreshold;
}

function matchesOutline(image, x, y, outline, tolerance, alphaThreshold) {
  if (!inBounds(image, x, y)) return false;
  const i = pixelOffset(image, x, y);
  if (image.data[i + 3] < alphaThreshold) return false;
  return Math.abs(image.data[i] - outline[0]) <= tolerance &&
    Math.abs(image.data[i + 1] - outline[1]) <= tolerance &&
    Math.abs(image.data[i + 2] - outline[2]) <= tolerance;
}

/**
 * Remove outline-colored pixels connected to the transparent exterior, then
 * draw one 4-connected outline pixel outside the preserved colored silhouette.
 * Enclosed outline-colored pixels (eyes, mouths, markings) are retained.
 */
function repairExternalOutlinePass(image, options = {}) {
  const outline = options.outline ?? [0, 0, 0, 255];
  const tolerance = options.tolerance ?? 0;
  const alphaThreshold = options.alphaThreshold ?? 128;
  const result = {
    width: image.width,
    height: image.height,
    // Buffer, not Uint8Array: callers hand the result straight to
    // PNG.sync.write, whose documented contract expects Buffer data.
    data: Buffer.from(image.data),
  };
  const exterior = new Uint8Array(image.width * image.height);
  const visited = new Uint8Array(image.width * image.height);
  const queue = [];

  const isExteriorPassable = (x, y) =>
    isTransparent(image, x, y, alphaThreshold) ||
    matchesOutline(image, x, y, outline, tolerance, alphaThreshold);
  const enqueue = (x, y) => {
    if (!inBounds(image, x, y) || !isExteriorPassable(x, y)) return;
    const index = y * image.width + x;
    if (visited[index]) return;
    visited[index] = 1;
    queue.push([x, y]);
  };

  for (let x = 0; x < image.width; x++) {
    enqueue(x, 0);
    enqueue(x, image.height - 1);
  }
  for (let y = 0; y < image.height; y++) {
    enqueue(0, y);
    enqueue(image.width - 1, y);
  }

  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    const index = y * image.width + x;
    if (matchesOutline(image, x, y, outline, tolerance, alphaThreshold)) exterior[index] = 1;
    for (const [dx, dy] of OUTLINE_NEIGHBORS) enqueue(x + dx, y + dy);
  }

  for (let index = 0; index < exterior.length; index++) {
    if (!exterior[index]) continue;
    result.data.fill(0, index * 4, index * 4 + 4);
  }

  const additions = [];
  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) {
      if (!isTransparent(result, x, y, alphaThreshold)) continue;
      const touchesBody = BODY_NEIGHBORS.some(([dx, dy]) =>
        inBounds(result, x + dx, y + dy) && !isTransparent(result, x + dx, y + dy, alphaThreshold));
      if (touchesBody) additions.push([x, y]);
    }
  }

  for (const [x, y] of additions) {
    result.data.set(outline, pixelOffset(result, x, y));
  }
  return result;
}

function pixelsEqual(left, right) {
  if (left.width !== right.width || left.height !== right.height || left.data.length !== right.data.length) return false;
  for (let i = 0; i < left.data.length; i++) if (left.data[i] !== right.data[i]) return false;
  return true;
}

export function repairExternalOutline(image, options = {}) {
  let current = image;
  const maxPasses = Math.max(image.width, image.height);
  for (let pass = 0; pass < maxPasses; pass++) {
    const repaired = repairExternalOutlinePass(current, options);
    if (pixelsEqual(current, repaired)) return repaired;
    current = repaired;
  }
  throw new Error(`outline repair did not stabilize after ${maxPasses} passes`);
}
