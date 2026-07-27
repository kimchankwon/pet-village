/**
 * Kuchipatchi pet frames from the Tamagotchi iD fandom gallery.
 *
 * Walk frames are the official gallery “Walking” sprites:
 *   File:IDKuchipatchiWalk.png  → walk1
 *   File:IDKuchipatchiWalk2.png → walk2
 * (https://tamagotchi.fandom.com/wiki/Kuchipatchi/Sprite_Gallery § Tamagotchi iD)
 *
 * Reference PNGs: scripts/reference/kuchipatchi/frames/
 * Each is padded to the shared 32×32 bottom-aligned pet canvas.
 *
 * Run: npx tsx scripts/generate-kuchipatchi.mts
 *   or: npm run sprite:kuchipatchi
 */
import path from 'node:path';
import { generateGalleryPet } from './lib/gallery-pet-generator.mjs';

// cleanExterior stays off because pale body highlights can be near-white.
// iD gallery art already has a dark outline; repair would add a second black ring.
generateGalleryPet({
  name: 'kuchipatchi',
  referenceDir: path.resolve('scripts/reference/kuchipatchi/frames'),
  outputDir: path.resolve('public/assets/pet/kuchipatchi'),
  poses: ['neutral1', 'neutral2', 'walk1', 'walk2', 'happy', 'sad', 'sleep', 'jump'],
  completionMessage: 'Kuchipatchi iD sprites written to',
});
