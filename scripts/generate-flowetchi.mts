/**
 * Flowetchi pet frames from the Flowertchi Tamagotchi iD fandom gallery.
 *
 * Walk: File:IDFlowertchiWalk.png / Walk2.png
 * (https://tamagotchi.fandom.com/wiki/Flowertchi/Sprite_Gallery § Tamagotchi iD)
 *
 * Flowetchi replaces Violetchi in Pet Village (same character line; JP
 * Flowertchi / EN Violetchi). Reference PNGs: scripts/reference/flowetchi/frames/
 *
 * Run: npx tsx scripts/generate-flowetchi.mts
 *   or: npm run sprite:flowetchi
 */
import path from 'node:path';
import { generateGalleryPet } from './lib/gallery-pet-generator.mjs';

// Gallery art already has a dark outline (~0,0,99). Outline repair would paint
// a second pure-black ring outside it, so the shared generator skips that pass.
generateGalleryPet({
  name: 'flowetchi',
  referenceDir: path.resolve('scripts/reference/flowetchi/frames'),
  outputDir: path.resolve('public/assets/pet/flowetchi'),
  poses: ['neutral1', 'neutral2', 'walk1', 'walk2', 'happy', 'sad', 'sleep', 'jump'],
  completionMessage: 'Flowetchi iD sprites written to',
});
