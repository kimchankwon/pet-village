/**
 * Gozarutchi pet frames from the Tamagotchi iD fandom gallery.
 *
 * Walk: File:IDGozarutchiWalk.png / Walk2.png
 * (https://tamagotchi.fandom.com/wiki/Gozarutchi/Sprite_Gallery § Tamagotchi iD)
 *
 * Reference PNGs: scripts/reference/gozarutchi/frames/
 * Each is padded to the shared 32×32 bottom-aligned pet canvas.
 *
 * Run: npx tsx scripts/generate-gozarutchi.mts
 *   or: npm run sprite:gozarutchi
 */
import path from 'node:path';
import { generateGalleryPet } from './lib/gallery-pet-generator.mjs';

// Preflight prevents a missing mid-pose file from leaving this directory half-updated.
// Gallery art already has a dark outline (~0,0,99); repair would add a second ring.
generateGalleryPet({
  name: 'gozarutchi',
  referenceDir: path.resolve('scripts/reference/gozarutchi/frames'),
  outputDir: path.resolve('public/assets/pet/gozarutchi'),
  poses: ['neutral1', 'neutral2', 'walk1', 'walk2', 'happy', 'sad', 'sleep', 'jump'],
  completionMessage: 'Gozarutchi iD sprites written to',
});
