import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { repairExternalOutline } from './pixel-outline.mjs';
import { cleanSpriteExterior } from './clean-sprite.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

/**
 * Write a generated sprite PNG, optionally cleaning exterior debris and
 * normalizing the external outline. Shared by generator scripts.
 */
export function saveSprite(png, file, options = {}) {
  const {
    repairOutline = false,
    cleanExterior = repairOutline,
    outline = [0, 0, 0, 255],
    tolerance,
  } = options;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let output = png;
  if (!(output.data instanceof Buffer)) {
    output.data = Buffer.from(output.data);
  }
  if (cleanExterior) {
    cleanSpriteExterior(output, {
      outline,
      tolerance,
      repairOutline: false,
    });
  }
  if (repairOutline) {
    output = repairExternalOutline(output, { outline, tolerance });
  }
  fs.writeFileSync(file, PNG.sync.write(output));
}
