/**
 * Re-generate pet pose frames (walk/happy/sad/sleep/jump/neutral2) from each
 * species' neutral1 using the shared pose-animate library.
 *
 * Skips Kirby (has bespoke 8-frame walk) and Cinnamoroll (sheet-authored poses).
 * Puffles are handled by imagine-to-puffles.mts.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { saveSprite } from './lib/save-sprite.mjs';
import { petPosesFromIdle } from './lib/pose-animate.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const PET_ROOT = path.resolve('public/assets/pet');
const SKIP = new Set(['kirby', 'cinnamoroll', ...Array.from({ length: 10 }, (_, i) => {
  const colors = ['blue','pink','green','black','purple','red','yellow','white','orange','brown'];
  return `puffle-${colors[i]}`;
}).flat()]);

// Actually skip list:
const SKIP_SPECIES = new Set([
  'kirby', // 8-frame walk + custom faces
  'cinnamoroll', // reference-sheet poses
]);

const OUT_BLACK: [number, number, number, number] = [0, 0, 0, 255];
const OUT_PUFFLE: [number, number, number, number] = [20, 20, 28, 255];

function isPuffle(id: string) {
  return id.startsWith('puffle-');
}

const species = fs
  .readdirSync(PET_ROOT)
  .filter((d) => fs.statSync(path.join(PET_ROOT, d)).isDirectory());

console.log('Re-posing pets from neutral1…');
for (const id of species) {
  if (SKIP_SPECIES.has(id)) {
    console.log(`  skip ${id}`);
    continue;
  }
  // Puffles: prefer imagine-to-puffles; still allow re-pose if flag
  if (isPuffle(id) && !process.argv.includes('--puffles')) {
    console.log(`  skip ${id} (use imagine-to-puffles or --puffles)`);
    continue;
  }
  const neutral = path.join(PET_ROOT, id, 'neutral1.png');
  if (!fs.existsSync(neutral)) {
    console.warn(`  missing ${neutral}`);
    continue;
  }
  const idle = PNG.sync.read(fs.readFileSync(neutral));
  const outline = isPuffle(id) ? OUT_PUFFLE : OUT_BLACK;
  const poses = petPosesFromIdle(idle, {
    ink: outline,
    accent: [255, 150, 180, 255],
  });
  for (const [pose, png] of Object.entries(poses)) {
    // Keep neutral1 untouched (source of truth)
    if (pose === 'neutral1') continue;
    saveSprite(png, path.join(PET_ROOT, id, `${pose}.png`), {
      repairOutline: true,
      outline,
    });
  }
  console.log(`  ${id}`);
}
console.log('Done.');
