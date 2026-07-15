/**
 * Batch-clean exterior sprite artifacts across NPC + pet PNG assets.
 * Removes orphan islands and non-outline halo pixels outside the silhouette.
 */
import fs from 'fs';
import path from 'path';
import { cleanSpriteFile } from './lib/clean-sprite.mjs';

const ROOTS = [
  { dir: path.resolve('public/assets/npc/miniteen'), outline: [0, 0, 0, 255] as const },
  { dir: path.resolve('public/assets/npc/cinnamoroll'), outline: [0, 0, 0, 255] as const },
  { dir: path.resolve('public/assets/npc/bongbongee'), outline: [0, 0, 0, 255] as const },
  { dir: path.resolve('public/assets/pet'), outline: [0, 0, 0, 255] as const },
];

function walkPngs(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkPngs(p, acc);
    else if (name.endsWith('.png')) acc.push(p);
  }
  return acc;
}

let files = 0;
let orphans = 0;
let halo = 0;
const touched: string[] = [];

for (const { dir, outline } of ROOTS) {
  // Puffles use near-black outline [20,20,28]
  const filesIn = walkPngs(dir);
  for (const file of filesIn) {
    const isPuffle = file.includes(`${path.sep}puffle-`);
    const ol = isPuffle ? ([20, 20, 28, 255] as const) : outline;
    const stats = cleanSpriteFile(file, {
      outline: ol,
      repairOutline: true,
      minKeepRatio: 0.08,
      tolerance: 0,
    });
    files++;
    orphans += stats.orphansRemoved;
    halo += stats.haloRemoved;
    if (stats.orphansRemoved + stats.haloRemoved > 0) {
      touched.push(
        `${path.relative(process.cwd(), file)} (-${stats.orphansRemoved} orphans, -${stats.haloRemoved} halo)`,
      );
    }
  }
}

console.log(`Cleaned ${files} sprites`);
console.log(`Removed ${orphans} orphan px, ${halo} exterior halo px`);
console.log(`Files changed: ${touched.length}`);
for (const t of touched.slice(0, 40)) console.log(' ', t);
if (touched.length > 40) console.log(`  … +${touched.length - 40} more`);
