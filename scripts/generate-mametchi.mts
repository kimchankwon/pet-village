/**
 * Mametchi pet frames from the Tamagotchi iD fandom gallery.
 *
 * Walk frames are the official gallery “Walking” sprites:
 *   File:IDMametchiWalk.png  → walk1
 *   File:IDMametchiWalk2.png → walk2
 * (https://tamagotchi.fandom.com/wiki/Mametchi/Sprite_Gallery § Tamagotchi iD)
 *
 * Reference PNGs live under scripts/reference/mametchi/frames/ (from
 * scripts/reference/mametchi/id-gallery/*-gallery.png). Each is padded to the
 * shared 32×32 bottom-aligned pet canvas.
 *
 * Run: npx tsx scripts/generate-mametchi.mts
 *   or: npm run sprite:mametchi
 */
import path from 'node:path';
import { generateGalleryPet } from './lib/gallery-pet-generator.mjs';

// Exterior cleaning would treat Mametchi's white eye sclera as plate and punch
// holes in the face. iD art already has a dark outline, so repair stays off too.
generateGalleryPet({
  name: 'mametchi',
  referenceDir: path.resolve('scripts/reference/mametchi/frames'),
  outputDir: path.resolve('public/assets/pet/mametchi'),
  poses: ['neutral1', 'neutral2', 'walk1', 'walk2', 'happy', 'sad', 'sleep', 'jump'],
  completionMessage: 'Mametchi iD sprites written to',
});
