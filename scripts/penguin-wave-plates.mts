/**
 * Build the penguin's wave plates at plate resolution.
 *
 * The wave used to be hand-authored 18×20 ASCII grids stretched over the
 * 477×513 Imagine plate, so each "pixel" became a ~26px block and waving read
 * as the sprite falling apart. These frames instead reuse the real plate art:
 * the viewer's left flipper is lifted off `down-0.png` and pivoted about the
 * shoulder, so the wave is the same sprite at the same resolution.
 *
 * Source: public/assets/player/penguin/down-0.png  (the Imagine down idle plate)
 * Output: public/assets/player/penguin/wave-{1,2,3}.png
 *
 * Frame 0 of the wave animation is the idle plate itself, so only the three
 * raised poses are written. Drop authored art in over these files and the game
 * picks it up unchanged — Boot just loads `wave-{1,2,3}.png`.
 *
 *   npm run sprite:penguin-wave
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { findFlipperBand, raiseFlipper, WAVE_ANGLES } from './lib/penguin-wave.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const DIR = path.resolve('public/assets/player/penguin');
const IDLE = path.join(DIR, 'down-0.png');

if (!fs.existsSync(IDLE)) {
  console.error(`missing ${IDLE} — run the Imagine plate pipeline first`);
  process.exit(1);
}

const idle = PNG.sync.read(fs.readFileSync(IDLE));
const band = findFlipperBand(idle);
if (!band) {
  console.error('could not locate the flipper band in down-0.png');
  process.exit(1);
}
console.log(
  `flipper rows ${band.rows[0].y}..${band.rows[band.rows.length - 1].y}`,
  `shoulder (${band.pivot.x},${band.pivot.y})`,
  `${band.pixels.length}px`,
);

WAVE_ANGLES.forEach((angle, index) => {
  const raised = raiseFlipper(idle, band, angle);
  const png = new PNG({ width: raised.width, height: raised.height });
  Buffer.from(raised.data).copy(png.data);
  const out = path.join(DIR, `wave-${index + 1}.png`);
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log(`wrote ${path.relative(process.cwd(), out)} (${angle}°)`);
});
