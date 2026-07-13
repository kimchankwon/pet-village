#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { repairExternalOutline } from './lib/pixel-outline.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: npm run sprite:repair -- <input.png> [output.png] [--in-place] [--tolerance 0-255] [--outline #RRGGBB]');
  process.exit(message ? 1 : 0);
}

function parseColor(value) {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (!match) usage(`invalid outline color: ${value}`);
  return [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16), 255];
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) usage();
let inPlace = false;
let tolerance = 0;
let outline = [0, 0, 0, 255];
const positional = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--in-place') inPlace = true;
  else if (arg === '--tolerance') {
    tolerance = Number(args[++i]);
    if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 255) usage('tolerance must be an integer from 0 to 255');
  } else if (arg === '--outline') outline = parseColor(args[++i] ?? '');
  else if (arg.startsWith('--')) usage(`unknown option: ${arg}`);
  else positional.push(arg);
}
if (positional.length < 1 || positional.length > 2) usage('provide one input and at most one output PNG');
if (inPlace && positional[1]) usage('--in-place cannot be combined with an output path');

const input = path.resolve(positional[0]);
if (!fs.existsSync(input)) usage(`input does not exist: ${input}`);
const output = inPlace
  ? input
  : path.resolve(positional[1] ?? input.replace(/\.png$/i, '') + '.repaired.png');
if (input === output && !inPlace) usage('use --in-place to overwrite the source');

const png = PNG.sync.read(fs.readFileSync(input));
const repaired = repairExternalOutline(png, { outline, tolerance });
const encoded = PNG.sync.write(repaired);
fs.mkdirSync(path.dirname(output), { recursive: true });
if (inPlace) {
  const temporary = `${output}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, encoded);
  fs.renameSync(temporary, output);
} else {
  fs.writeFileSync(output, encoded);
}
console.log(output);
