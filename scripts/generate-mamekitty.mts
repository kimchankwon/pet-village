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

// Walk frames are a few pixels taller than idle (leg bob). Scale every pose
// from neutral1 so the body stays the same size; extra height clips at the top
// of the 32×32 plate instead of shrinking the whole kitty when she walks.
// Exterior cleaning would damage the yellow face/white ear fur; gallery outline
// repair would add a second pure-black ring.
//
// Walk reference frames lean **screen-right** so Pet.setFlipX faces travel
// direction (left walk → flipX true → faces left). Gallery sources that face
// the other way were mirrored in scripts/reference/mamekitty/frames/.
generateGalleryPet({
  name: 'mamekitty',
  referenceDir: path.resolve('scripts/reference/mamekitty/frames'),
  outputDir: path.resolve('public/assets/pet/mamekitty'),
  poses: ['neutral1', 'neutral2', 'walk1', 'walk2', 'happy', 'sad', 'sleep', 'jump'],
  completionMessage: "Mame Kitty P's sprites written to",
  uniformScaleFrom: 'neutral1',
});
