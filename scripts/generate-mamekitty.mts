/**
 * Mame Kitty pet frames from the Tamagotchi P's fandom gallery.
 *
 * Walk: File:MameKittyWalk.png / Walk2.png
 * (https://tamagotchi.fandom.com/wiki/Mame_Kitty/Sprite_Gallery § Tamagotchi P's)
 *
 * Reference PNGs: scripts/reference/mamekitty/frames/
 * Each is padded (and scaled if needed) to the shared 32×32 bottom-aligned pet canvas.
 *
 * Run: npx tsx scripts/generate-mamekitty.mts
 *   or: npm run sprite:mamekitty
 */
import path from 'node:path';
import { generateGalleryPet } from './lib/gallery-pet-generator.mjs';

// Walk frames are taller than the plate, so nearest-neighbour scaling keeps ears
// and feet visible. Exterior cleaning would damage the yellow face/white ear fur;
// gallery outline repair would add a second pure-black ring.
generateGalleryPet({
  name: 'mamekitty',
  referenceDir: path.resolve('scripts/reference/mamekitty/frames'),
  outputDir: path.resolve('public/assets/pet/mamekitty'),
  poses: ['neutral1', 'neutral2', 'walk1', 'walk2', 'happy', 'sad', 'sleep', 'jump'],
  completionMessage: "Mame Kitty P's sprites written to",
  scaleToFit: true,
});
