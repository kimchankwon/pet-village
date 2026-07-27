/**
 * Memetchi pet frames from the Tamagotchi iD fandom gallery.
 *
 * Walk: File:IDMemetchiWalk.png / Walk2.png
 * (https://tamagotchi.fandom.com/wiki/Memetchi/Sprite_Gallery § Tamagotchi iD)
 *
 * Reference PNGs: scripts/reference/memetchi/frames/
 * Each is padded to the shared 32×32 bottom-aligned pet canvas.
 *
 * Run: npx tsx scripts/generate-memetchi.mts
 *   or: npm run sprite:memetchi
 */
import path from 'node:path';
import { generateGalleryPet } from './lib/gallery-pet-generator.mjs';

// Preflight prevents a missing mid-pose file from leaving this directory half-updated.
// Gallery art already has a dark outline (~0,0,100); repair would add a second ring.
generateGalleryPet({
  name: 'memetchi',
  referenceDir: path.resolve('scripts/reference/memetchi/frames'),
  outputDir: path.resolve('public/assets/pet/memetchi'),
  poses: ['neutral1', 'neutral2', 'walk1', 'walk2', 'happy', 'sad', 'sleep', 'jump'],
  completionMessage: 'Memetchi iD sprites written to',
});
