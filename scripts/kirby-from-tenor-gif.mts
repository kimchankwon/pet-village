/**
 * Kirby from Tenor walk GIF — thin wrapper around the Python exporter.
 *
 * The 32×32 majority downsample crushed faces/feet; the faithful path keeps
 * plate resolution and only keys the white backdrop (see .py).
 *
 * Run: npm run sprite:kirby
 *   → python3 scripts/kirby-from-tenor-gif.py
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'kirby-from-tenor-gif.py');

const candidates = ['python3', 'python', process.env.KIRBY_PYTHON].filter(Boolean) as string[];
let lastErr = '';
for (const bin of candidates) {
  const r = spawnSync(bin, [script], { stdio: 'inherit', cwd: path.join(here, '..') });
  if (r.error) {
    lastErr = String(r.error);
    continue;
  }
  if (r.status === 0) process.exit(0);
  process.exit(r.status ?? 1);
}
console.error('Need python3 with Pillow to rebuild Kirby sprites.', lastErr);
console.error('  python3 -m pip install pillow');
console.error('  python3 scripts/extract-kirby-gif-frames.py');
console.error('  python3 scripts/kirby-from-tenor-gif.py');
process.exit(1);
