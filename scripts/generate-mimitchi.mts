/**
 * Mimitchi pet frames from the Tamagotchi iD fandom gallery.
 *
 * Walk: File:IDMimitchiWalk.png → walk1; File:IdMimitchiWalk2.png → walk2
 * (gallery item 18/90 on Mimitchi/Sprite_Gallery).
 * (https://tamagotchi.fandom.com/wiki/Mimitchi/Sprite_Gallery § Tamagotchi iD)
 *
 * Reference PNGs: scripts/reference/mimitchi/frames/
 * Each is padded to the shared 32×32 bottom-aligned pet canvas.
 *
 * Run: npx tsx scripts/generate-mimitchi.mts
 *   or: npm run sprite:mimitchi
 */
import path from 'node:path';
import { generateGalleryPet } from './lib/gallery-pet-generator.mjs';

// Exterior cleaning punches holes in Mimitchi's white body. iD gallery art
// already has a dark outline, so repair would only add a second black ring.
generateGalleryPet({
  name: 'mimitchi',
  referenceDir: path.resolve('scripts/reference/mimitchi/frames'),
  outputDir: path.resolve('public/assets/pet/mimitchi'),
  poses: ['neutral1', 'neutral2', 'walk1', 'walk2', 'happy', 'sad', 'sleep', 'jump'],
  completionMessage: 'Mimitchi iD sprites written to',
});
