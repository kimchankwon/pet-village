import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import {
  ACCESSORY_ASSET_PATH,
  ACCESSORY_LIST,
} from '../systems/accessories';
import {
  KIRBY_WALK_FILES,
  PET_ASSET_FILES,
  PET_SPECIES_LIST,
  petAnimKey,
  petAssetPath,
  petTextureKey,
  poseFromAssetFile,
} from '../systems/pets';
import { State } from '../systems/GameState';
import { MINITEEN, miniteenTexPrefix } from '../systems/miniteen';

const NPC_POSES = ['idle', 'walk1', 'walk2', 'happy', 'sad', 'jump'] as const;

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
    // Kirby’s GBA-style walk uses extra mid-stride frames beyond walk1/walk2.
    for (const file of KIRBY_WALK_FILES) {
      if (file === 'walk1' || file === 'walk2') continue;
      this.load.image(`kirby-${file}`, `assets/pet/kirby/${file}.png`);
    }
    for (const pose of NPC_POSES) {
      this.load.image(`cinna-${pose}`, `assets/npc/cinnamoroll/${pose}.png`);
      this.load.image(`bong-${pose}`, `assets/npc/bongbongee/${pose}.png`);
      for (const def of MINITEEN) {
        this.load.image(`${miniteenTexPrefix(def.id)}-${pose}`, `assets/npc/miniteen/${def.id}/${pose}.png`);
      }
    }
    for (const acc of ACCESSORY_LIST) {
      // Penguin clothes have no PNG — pixelart.ts generates their textures.
      const path = ACCESSORY_ASSET_PATH[acc.id];
      if (path) this.load.image(acc.texture, path);
    }
    // The Skip Rope booth PNG placeholder lives under public/assets/misc/ —
    // pixelart generates the matching key until it's replaced with final art
    // (then load it here so it overrides the generated texture).
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
      if (species.id === 'kirby') {
        this.anims.create({
          key: petAnimKey(species.id, 'walk'),
          frames: KIRBY_WALK_FILES.map((file) => ({
            key: file === 'walk1' || file === 'walk2' ? petTextureKey('kirby', file) : `kirby-${file}`,
          })),
          frameRate: 14,
          repeat: -1,
        });
      } else {
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
    }

    // Every wandering NPC gets the same two-frame bounce/walk pair.
    const npcPrefixes = ['cinna', 'bong', ...MINITEEN.map((def) => miniteenTexPrefix(def.id))];
    for (const prefix of npcPrefixes) {
      this.anims.create({
        key: `${prefix}-bounce`,
        frames: [{ key: `${prefix}-idle` }, { key: `${prefix}-happy` }],
        frameRate: 2,
        repeat: -1,
      });
      this.anims.create({
        key: `${prefix}-walk`,
        frames: [{ key: `${prefix}-walk1` }, { key: `${prefix}-walk2` }],
        frameRate: 5,
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
