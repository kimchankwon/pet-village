/**
 * Cinnamoroll — hand-traced from the user reference sprite sheet.
 *
 * Sheet rules: white body/ears, light-blue underside shade, dark outline,
 * eyes 2×3 blue, cheeks 2×1 pink, floppy hang / wing jump / wink win / hurt closed.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve('public/assets/npc/cinnamoroll');
const W = 32;
const H = 32;

type RGBA = [number, number, number, number];

const PAL: Record<string, RGBA> = {
  k: [32, 32, 40, 255],
  w: [255, 255, 255, 255],
  s: [167, 198, 213, 255],
  e: [73, 156, 227, 255],
  p: [244, 169, 169, 255],
  t: [255, 230, 210, 255],
};

function grid(...rows: string[]): string[] {
  if (rows.length !== H) throw new Error(`need ${H} rows, got ${rows.length}`);
  return rows.map((r, i) => {
    if (r.length !== W) throw new Error(`row ${i}: got ${r.length}, need ${W}: ${r}`);
    return r;
  });
}

// Each row is EXACTLY 32 chars. Centered chibi ~22px wide.

const IDLE = grid(
  '................................', // 0
  '................................',
  '................................',
  '................................',
  '......k................k........', // 4 ear tops
  '.....kwk....kkkkkk....kwk.......',
  '....kwwwk..kwwwwwwk..kwwwk......',
  '....kwwwkkwwwwwwwwwkkwwwk.......',
  '....kwwwwwwwwwwwwwwwwwwwk.......',
  '....kwwwwwwwwwwwwwwwwwwwk.......',
  '....kwwwwweewwwweewwwwwwk.......', // 10 eyes 2×3
  '....kwwwwweewwwweewwwwwwk.......',
  '....kwwwwweewwwweewwwwwwk.......',
  '....kwwwwppwwwppwwwwwwwwk.......', // cheeks 2×1
  '....kwwwwwkwwwkwwwwwwwwwk.......', // mouth v
  '....kwwwwwwkwkwwwwwwwwwwk.......',
  '....kwwsswwwwwwwwwwwwsswk.......', // ear underside shade
  '....kwsssswwwwwwwwwwssswk.......',
  '....kwksssskwwwwksssskwwk.......',
  '....kwk....kwssswk...kwk........', // ear tips + body
  '....ksk...kwtwwtwk...ksk........', // feet + tail warm
  '.....k.....kwwwwk.....k.........',
  '............kssk................',
  '.............kk.................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
);

const WALK1 = grid(
  '................................',
  '................................',
  '................................',
  '................................',
  '.....k..................k.......',
  '....kwk....kkkkkk......kwk......',
  '...kwwwk..kwwwwwwk....kwwwk.....',
  '...kwwwkkwwwwwwwwwkk..kwwwk.....',
  '...kwwwwwwwwwwwwwwwwwwwwwwk.....',
  '...kwwwwwwwwwwwwwwwwwwwwwwk.....',
  '...kwwwwweewwwweewwwwwwwwwk.....',
  '...kwwwwweewwwweewwwwwwwwwk.....',
  '...kwwwwweewwwweewwwwwwwwwk.....',
  '...kwwwwppwwwppwwwwwwwwwwwk.....',
  '...kwwwwwkwwwkwwwwwwwwwwwwk.....',
  '...kwwwwwwkwkwwwwwwwwwwwwwk.....',
  '...kwwsswwwwwwwwwwwwwwsswwk.....',
  '...kwsssswwwwwwwwwwwwssswwk.....',
  '...kwksssskwwwwksssskwwwwk......',
  '...kwk..kwwk.......kwk..........',
  '...ksk..kwswk..kwwk.ksk.........',
  '....k....kssk..kwswk.k..........',
  '..............kk.kssk...........',
  '.................kk.............',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
);

const WALK2 = grid(
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '.....k..................k.......',
  '....kwk....kkkkkk......kwk......',
  '...kwwwk..kwwwwwwk....kwwwk.....',
  '...kwwwkkwwwwwwwwwkk..kwwwk.....',
  '...kwwwwwwwwwwwwwwwwwwwwwwk.....',
  '...kwwwwwwwwwwwwwwwwwwwwwwk.....',
  '...kwwwwweewwwweewwwwwwwwwk.....',
  '...kwwwwweewwwweewwwwwwwwwk.....',
  '...kwwwwweewwwweewwwwwwwwwk.....',
  '...kwwwwppwwwppwwwwwwwwwwwk.....',
  '...kwwwwwkwwwkwwwwwwwwwwwwk.....',
  '...kwwwwwwkwkwwwwwwwwwwwwwk.....',
  '...kwwsswwwwwwwwwwwwwwsswwk.....',
  '...kwsssswwwwwwwwwwwwssswwk.....',
  '...kwksssskwwwwksssskwwwwk......',
  '...kwk.......kwwk..kwk..........',
  '...ksk..kwwk.kwswk.ksk..........',
  '....k...kwswk.kssk..k...........',
  '.........kssk..kk...............',
  '..........kk....................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
);

const JUMP = grid(
  '................................',
  '................................',
  '................................',
  '................................',
  '.kkkkkk..............kkkkkk.....',
  'kwwwwwwwk...kkkkkk..kwwwwwwwk...',
  'kwssssswwk.kwwwwwwk.kwwssssswk..',
  'kwwsssswwkkwwwwwwwwkkwwsssswwk..',
  '.kwwsswwwwwwwwwwwwwwwwwwsswwk...',
  '..kwwwwwwwwwwwwwwwwwwwwwwwwk....',
  '..kwwwwweewwwweewwwwwwwwwwwk....',
  '..kwwwwweewwwweewwwwwwwwwwwk....',
  '..kwwwwweewwwweewwwwwwwwwwwk....',
  '..kwwwwppwwwppwwwwwwwwwwwwwk....',
  '..kwwwwwkwwwkwwwwwwwwwwwwwwk....',
  '..kwwwwwwkwkwwwwwwwwwwwwwwwk....',
  '..kwwsswwwwwwwwwwwwwwwwsswwk....',
  '...kwksssskwwwwksssskwwwwk......',
  '....kk....kwssswk....kk.........',
  '...........kwwwwk...............',
  '............kssk................',
  '.............kk.................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
);

const SAD = grid(
  '................................',
  '................................',
  '................................',
  '................................',
  '......k................k........',
  '.....kwk....kkkkkk....kwk.......',
  '....kwwwk..kwwwwwwk..kwwwk......',
  '....kwwwkkwwwwwwwwwkkwwwk.......',
  '....kwwwwwwwwwwwwwwwwwwwk.......',
  '....kwwwwwwwwwwwwwwwwwwwk.......',
  '....kwwwwwkkwwwwkkwwwwwwk.......', // closed eyes
  '....kwwwwwwwwwwwwwwwwwwwk.......',
  '....kwwwwppwwwppwwwwwwwwk.......',
  '....kwwwwwwkkkwwwwwwwwwwk.......', // flat mouth
  '....kwwwwwwwwwwwwwwwwwwwk.......',
  '....kwwsswwwwwwwwwwwwsswk.......',
  '....kwsssswwwwwwwwwwssswk.......',
  '....kwksssskwwwwksssskwwk.......',
  '....kwk....kwssswk...kwk........',
  '....ksk...kwtwwtwk...ksk........',
  '.....k.....kwwwwk.....k.........',
  '............kssk................',
  '.............kk.................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
);

const HAPPY = grid(
  '................................',
  '................................',
  '................................',
  '..........k..........kkkkk......',
  '.........kwk.......kwwwwwwk.....',
  '....kkkk.kwsk.....kwwsssswk.....',
  '...kwwwwkkwssk...kwwsssswwk.....',
  '...kwsswwwwsskk.kkwwssswwwk.....',
  '...kwsswwwwwwwwkwwwwwwwwwwk.....',
  '...kwwwwwwwwwwwwwwwwwwwwwwk.....',
  '...kwwwwk.wwweewwwwwwwwwwwk.....', // wink + open eye
  '...kwwww.kwwweewwwwwwwwwwwk.....',
  '...kwwwwk.wwweewwwwwwwwwwwk.....',
  '...kwwwwppwwwppwwwwwwwwwwwk.....',
  '...kwwwwwkwwwkwwwwwwwwwwwwk.....',
  '...kwwwwwwkwkwwwwwwwwwwwwwk.....',
  '...kwwsswwwwwwwwwwwwwwsswwk.....',
  '...kwksssskwwwwksssskwwwwk......',
  '....kk....kwssswk....kk.........',
  '...........kwwwwk...............',
  '............kssk................',
  '.............kk.................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
);

function draw(rows: string[]): InstanceType<typeof PNG> {
  const png = new PNG({ width: W, height: H });
  png.data.fill(0);
  for (let y = 0; y < H; y++) {
    const row = rows[y]!;
    for (let x = 0; x < W; x++) {
      const c = PAL[row[x]!];
      if (!c) continue;
      const i = (W * y + x) << 2;
      png.data[i] = c[0];
      png.data[i + 1] = c[1];
      png.data[i + 2] = c[2];
      png.data[i + 3] = c[3];
    }
  }
  return png;
}

function save(png: InstanceType<typeof PNG>, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

const POSES: Record<string, string[]> = { idle: IDLE, walk1: WALK1, walk2: WALK2, jump: JUMP, sad: SAD, happy: HAPPY };
for (const [name, rows] of Object.entries(POSES)) {
  save(draw(rows), path.join(ROOT, `${name}.png`));
}
console.log('Cinnamoroll sprites traced from reference sheet');
