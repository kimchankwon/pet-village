import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { repairExternalOutline } from './pixel-outline.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

/**
 * Write a generated sprite PNG, optionally normalizing its external outline
 * first. Shared by the generator scripts so the repair-toggle plumbing lives
 * in one place.
 */
export function saveSprite(png, file, options = {}) {
  const { repairOutline = false, outline = [0, 0, 0, 255], tolerance } = options;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const output = repairOutline ? repairExternalOutline(png, { outline, tolerance }) : png;
  fs.writeFileSync(file, PNG.sync.write(output));
}
