import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import {
  PET_ASSET_FILES,
  PET_SPECIES_LIST,
  petAnimKey,
  petAssetPath,
  petTextureKey,
  poseFromAssetFile,
} from '../systems/pets';
import { State } from '../systems/GameState';

// Loads pet sprites + pixel-art textures, then Adopt (first run) or Town.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.setPath(import.meta.env.BASE_URL);
    for (const species of PET_SPECIES_LIST) {
      for (const file of PET_ASSET_FILES) {
        const pose = poseFromAssetFile(file);
        this.load.image(petTextureKey(species.id, pose), petAssetPath(species.id, file));
      }
    }
  }

  create() {
    generateTextures(this);

    for (const species of PET_SPECIES_LIST) {
      this.anims.create({
        key: petAnimKey(species.id, 'bounce'),
        frames: [
          { key: petTextureKey(species.id, 'idle1') },
          { key: petTextureKey(species.id, 'idle2') },
        ],
        frameRate: 3,
        repeat: -1,
      });
      this.anims.create({
        key: petAnimKey(species.id, 'walk'),
        frames: [
          { key: petTextureKey(species.id, 'walk1') },
          { key: petTextureKey(species.id, 'walk2') },
        ],
        frameRate: 6,
        repeat: -1,
      });
    }

    if (!State.data.adopted) {
      this.scene.start('Adopt');
    } else {
      this.scene.start('Town');
    }
  }
}
