import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import {
  ACCESSORY_ASSET_PATH,
  ACCESSORY_LIST,
} from '../systems/accessories';
import {
  PET_ASSET_FILES,
  PET_SPECIES_LIST,
  petAnimKey,
  petAssetPath,
  petTextureKey,
  poseFromAssetFile,
} from '../systems/pets';
import { State } from '../systems/GameState';

const CINNA_POSES = ['idle', 'walk1', 'walk2', 'happy', 'sad', 'jump'] as const;
const BONG_POSES = ['idle', 'walk1', 'walk2', 'happy', 'sad', 'jump'] as const;

// Loads pet + NPC sprites, then Adopt (first run) or Town.
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
    for (const pose of CINNA_POSES) {
      this.load.image(`cinna-${pose}`, `assets/npc/cinnamoroll/${pose}.png`);
    }
    for (const pose of BONG_POSES) {
      this.load.image(`bong-${pose}`, `assets/npc/bongbongee/${pose}.png`);
    }
    for (const acc of ACCESSORY_LIST) {
      this.load.image(acc.texture, ACCESSORY_ASSET_PATH[acc.id]);
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

    this.anims.create({
      key: 'cinna-bounce',
      frames: [{ key: 'cinna-idle' }, { key: 'cinna-happy' }],
      frameRate: 2,
      repeat: -1,
    });
    this.anims.create({
      key: 'cinna-walk',
      frames: [{ key: 'cinna-walk1' }, { key: 'cinna-walk2' }],
      frameRate: 5,
      repeat: -1,
    });

    this.anims.create({
      key: 'bong-bounce',
      frames: [{ key: 'bong-idle' }, { key: 'bong-happy' }],
      frameRate: 2,
      repeat: -1,
    });
    this.anims.create({
      key: 'bong-walk',
      frames: [{ key: 'bong-walk1' }, { key: 'bong-walk2' }],
      frameRate: 5,
      repeat: -1,
    });

    if (!State.data.adopted) {
      this.scene.start('Adopt');
    } else {
      this.scene.start('Town');
    }
  }
}
