import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { saveSprite } from './save-sprite.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const WIDTH = 32;
const HEIGHT = 32;
const OUTLINE = [0, 0, 0, 255];

function contentBounds(png, name) {
  let x0 = png.width;
  let y0 = png.height;
  let x1 = 0;
  let y1 = 0;
  let count = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2;
      if (png.data[i + 3] < 20) continue;
      count++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (!count) throw new Error(`empty ${name.toLowerCase()} frame`);
  return { x0, y0, x1, y1 };
}

/**
 * Fit scale for one frame's content. Used alone (`scaleToFit`) or as the shared
 * scale taken from an idle pose so walk frames do not shrink independently.
 */
export function fitScale(contentWidth, contentHeight) {
  return Math.min(1, WIDTH / contentWidth, HEIGHT / contentHeight);
}

/**
 * Crop opaque content and bottom-center it on the shared 32×32 pet canvas.
 *
 * @param {object} opts
 * @param {string} opts.name
 * @param {boolean} [opts.scaleToFit]  Per-frame fit (legacy). Prefer `scale` from
 *   a shared idle measurement so walk bob does not resize the character.
 * @param {number} [opts.scale]  Fixed nearest-neighbour scale applied to content.
 *   Taller walk frames bottom-align; overflow above the canvas is clipped so
 *   feet stay planted and body size matches idle.
 */
export function toGalleryCanvas(source, { name, scaleToFit = false, scale: fixedScale }) {
  const bounds = contentBounds(source, name);
  const contentWidth = bounds.x1 - bounds.x0 + 1;
  const contentHeight = bounds.y1 - bounds.y0 + 1;
  const scale =
    typeof fixedScale === 'number' && Number.isFinite(fixedScale) && fixedScale > 0
      ? fixedScale
      : scaleToFit
        ? fitScale(contentWidth, contentHeight)
        : 1;
  const width = Math.max(1, Math.round(contentWidth * scale));
  const height = Math.max(1, Math.round(contentHeight * scale));
  const output = new PNG({ width: WIDTH, height: HEIGHT });
  output.data.fill(0);
  const offsetX = Math.floor((WIDTH - width) / 2);
  // Negative when the scaled pose is taller than the plate — clip the top.
  const offsetY = HEIGHT - height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceX = bounds.x0 + Math.min(contentWidth - 1, Math.floor(x / scale));
      const sourceY = bounds.y0 + Math.min(contentHeight - 1, Math.floor(y / scale));
      const sourceIndex = (source.width * sourceY + sourceX) << 2;
      if (source.data[sourceIndex + 3] < 20) continue;
      const destinationX = offsetX + x;
      const destinationY = offsetY + y;
      if (destinationX < 0 || destinationY < 0 || destinationX >= WIDTH || destinationY >= HEIGHT) continue;
      const destinationIndex = (WIDTH * destinationY + destinationX) << 2;
      output.data[destinationIndex] = source.data[sourceIndex];
      output.data[destinationIndex + 1] = source.data[sourceIndex + 1];
      output.data[destinationIndex + 2] = source.data[sourceIndex + 2];
      output.data[destinationIndex + 3] = 255;
    }
  }
  return output;
}

export function generateGalleryPet({
  name,
  referenceDir,
  outputDir,
  poses,
  completionMessage,
  scaleToFit = false,
  /**
   * Pose id whose content size defines the shared scale for every frame.
   * Walk/jump art that is taller than idle keeps the same body size; extra
   * pixels clip at the top of the 32×32 plate instead of shrinking the pet.
   */
  uniformScaleFrom = null,
}) {
  // Preflight every reference and conversion before writing any output, so a
  // bad or missing mid-pose frame cannot leave the committed sprites partial.
  const sources = poses.map((pose) => {
    const file = path.join(referenceDir, `${pose}.png`);
    if (!fs.existsSync(file)) throw new Error(`Missing reference frame ${file}`);
    return { pose, source: PNG.sync.read(fs.readFileSync(file)) };
  });

  let sharedScale;
  if (uniformScaleFrom) {
    const ref = sources.find((entry) => entry.pose === uniformScaleFrom);
    if (!ref) throw new Error(`uniformScaleFrom pose missing: ${uniformScaleFrom}`);
    const bounds = contentBounds(ref.source, name);
    sharedScale = fitScale(bounds.x1 - bounds.x0 + 1, bounds.y1 - bounds.y0 + 1);
  }

  const loaded = sources.map(({ pose, source }) => ({
    pose,
    canvas: toGalleryCanvas(source, {
      name,
      scaleToFit: sharedScale == null && scaleToFit,
      scale: sharedScale,
    }),
  }));

  fs.mkdirSync(outputDir, { recursive: true });
  for (const { pose, canvas } of loaded) {
    saveSprite(canvas, path.join(outputDir, `${pose}.png`), {
      repairOutline: false,
      cleanExterior: false,
      outline: OUTLINE,
    });
    console.log('wrote', pose);
  }
  console.log(completionMessage, outputDir);
}
