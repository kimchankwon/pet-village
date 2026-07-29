import Phaser from 'phaser';
import { generateTextures, PENGUIN_PLATE_KEY, PENGUIN_WAVE_PLATE_KEY } from '../sprites/pixelart';
import {
  ACCESSORY_LIST,
  accessoryAssetPath,
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

/**
 * Outdoor hub Imagine plates only (buildings, booths, plaza décor).
 * Floors, furniture, HUD icons, and mini-game props stay on pixel grids —
 * large photo-style plates look oversized and muddy at UI/inventory sizes.
 */
const WORLD_PROP_KEYS = [
  'house',
  'shop',
  'cafe',
  'fountain',
  'tree',
  'bush',
  'rock',
  'bench',
  'streetlamp',
  'mailbox',
  'barrel',
  'crate',
  'signpost',
  'dock',
  'skiprope-booth',
  'sled-hill',
  'bump-arena',
  'arcade',
  'get-arcade',
] as const;

const LOAD_BG = 0x0e1a28;
const LOAD_PANEL = 0x1a2838;
const LOAD_LINE = 0x3a5068;
const LOAD_ACCENT = 0x7ed6a8;
const LOAD_BAR_EMPTY = 0x0a1520;
const LOAD_MUTED = '#a89bc4';
const LOAD_TITLE = '#7ed6a8';
const LOAD_TEXT = '#efe8ff';

/**
 * Full-screen loading chrome while Boot preloads sprites / plates.
 * Built with pure Phaser graphics so it is available before any assets load.
 */
class BootLoadingScreen {
  private root: Phaser.GameObjects.Container;
  private barFill: Phaser.GameObjects.Rectangle;
  private status: Phaser.GameObjects.Text;
  private percent: Phaser.GameObjects.Text;
  private readonly barW: number;
  private readonly barH = 14;

  constructor(scene: Phaser.Scene) {
    const w = scene.scale.width;
    const h = scene.scale.height;
    this.barW = Math.min(320, Math.max(180, Math.floor(w * 0.55)));

    const bg = scene.add.rectangle(0, 0, w, h, LOAD_BG).setOrigin(0.5);
    const panel = scene.add
      .rectangle(0, 0, this.barW + 48, 148, LOAD_PANEL)
      .setOrigin(0.5)
      .setStrokeStyle(2, LOAD_LINE);

    const title = scene.add
      .text(0, -44, 'PET VILLAGE', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '16px',
        color: LOAD_TITLE,
      })
      .setOrigin(0.5);

    this.status = scene.add
      .text(0, -8, 'Loading sprites…', {
        fontFamily: 'VT323, monospace',
        fontSize: '22px',
        color: LOAD_MUTED,
      })
      .setOrigin(0.5);

    const barBg = scene.add
      .rectangle(0, 24, this.barW, this.barH, LOAD_BAR_EMPTY)
      .setOrigin(0.5)
      .setStrokeStyle(2, LOAD_LINE);

    this.barFill = scene.add
      .rectangle(-this.barW / 2 + 2, 24, 2, this.barH - 4, LOAD_ACCENT)
      .setOrigin(0, 0.5);

    this.percent = scene.add
      .text(0, 52, '0%', {
        fontFamily: 'VT323, monospace',
        fontSize: '20px',
        color: LOAD_TEXT,
      })
      .setOrigin(0.5);

    this.root = scene.add.container(w / 2, h / 2, [
      bg,
      panel,
      title,
      this.status,
      barBg,
      this.barFill,
      this.percent,
    ]);
    this.root.setDepth(10_000);
  }

  setProgress(value: number) {
    const t = Phaser.Math.Clamp(value, 0, 1);
    const inner = this.barW - 4;
    this.barFill.width = Math.max(2, Math.floor(inner * t));
    this.percent.setText(`${Math.round(t * 100)}%`);
  }

  setStatus(msg: string) {
    this.status.setText(msg);
  }

  destroy() {
    this.root.destroy(true);
  }
}

// Loads pet + NPC sprites, then Adopt (first run) or Town.
export class BootScene extends Phaser.Scene {
  private loadingUi: BootLoadingScreen | null = null;

  constructor() {
    super('Boot');
  }

  preload() {
    // Draw chrome first so the player sees feedback while the queue fills
    // (hundreds of pet / MINITEEN / penguin plate PNGs).
    this.loadingUi = new BootLoadingScreen(this);
    this.loadingUi.setProgress(0);

    this.load.on('progress', (value: number) => {
      this.loadingUi?.setProgress(value);
      this.loadingUi?.setStatus('Loading sprites…');
    });
    this.load.once('complete', () => {
      this.loadingUi?.setProgress(1);
      this.loadingUi?.setStatus('Preparing village…');
    });

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
      const path = accessoryAssetPath(acc.id);
      if (path) this.load.image(acc.texture, path);
    }
    // Imagine plate frames for the player penguin (nearest-neighbour in-game).
    // Generated by: npm run sprite:penguin
    // Frame 0 = idle plant; 1–2 = alternating walk strides.
    for (const facing of ['down', 'up', 'side'] as const) {
      for (const frame of [0, 1, 2] as const) {
        this.load.image(
          PENGUIN_PLATE_KEY(facing, frame),
          `assets/player/penguin/${facing}-${frame}.png`,
        );
      }
    }
    // Raised-flipper wave poses at plate resolution (npm run sprite:penguin-wave).
    // Wave frame 0 is the idle down plate, so only 1–3 are files.
    for (const frame of [1, 2, 3] as const) {
      this.load.image(
        PENGUIN_WAVE_PLATE_KEY(frame),
        `assets/player/penguin/wave-${frame}.png`,
      );
    }
    // Outdoor hub Imagine plates (override grid fallbacks in generateTextures).
    for (const key of WORLD_PROP_KEYS) {
      this.load.image(key, `assets/world/${key}.png`);
    }
  }

  create() {
    // Still show the loading chrome while we build generated textures + anims.
    this.loadingUi?.setStatus('Preparing village…');
    this.loadingUi?.setProgress(1);

    generateTextures(this);

    // Imagine outdoor props: nearest-neighbour so detailed plates stay sharp.
    for (const key of WORLD_PROP_KEYS) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    // Source-plate frames (≫64px) scale down in-game — force nearest-neighbour
    // so they stay crisp (default linear filtering blurs chunky pixel art).
    // NPC keys: mt-*/bong-idle|walk…  Pet keys: bongbongee-neutral1|… (species id).
    const plateNpcPrefixes = [
      ...MINITEEN.map((def) => miniteenTexPrefix(def.id)),
      'bong',
    ];
    for (const prefix of plateNpcPrefixes) {
      const idleKey = `${prefix}-idle`;
      if (!this.textures.exists(idleKey)) continue;
      const h = this.textures.getFrame(idleKey)?.height ?? 0;
      if (h <= 64) continue;
      for (const pose of NPC_POSES) {
        const key = `${prefix}-${pose}`;
        if (this.textures.exists(key)) {
          this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      }
    }
    for (const species of PET_SPECIES_LIST) {
      // Pet texture keys use pose names (idle1…), not file stems (neutral1…).
      const probe = petTextureKey(species.id, 'idle1');
      if (!this.textures.exists(probe)) continue;
      const h = this.textures.getFrame(probe)?.height ?? 0;
      if (h <= 64) continue;
      for (const file of PET_ASSET_FILES) {
        const key = petTextureKey(species.id, poseFromAssetFile(file));
        if (this.textures.exists(key)) {
          this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      }
      // Kirby’s extra walk plates (walk3+) use keys `kirby-walkN`, not petTextureKey.
      if (species.id === 'kirby') {
        for (const file of KIRBY_WALK_FILES) {
          const key =
            file === 'walk1' || file === 'walk2' ? petTextureKey('kirby', file) : `kirby-${file}`;
          if (this.textures.exists(key)) {
            this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
          }
        }
      }
    }

    for (const species of PET_SPECIES_LIST) {
      // Single-frame "bounce" = standing still. Walk still uses a two-frame cycle.
      this.anims.create({
        key: petAnimKey(species.id, 'bounce'),
        frames: [{ key: petTextureKey(species.id, 'idle1') }],
        frameRate: 1,
        repeat: -1,
      });
      if (species.id === 'kirby') {
        // Tenor walk GIF is ~0.85s / 10 frames ≈ 12 fps.
        this.anims.create({
          key: petAnimKey(species.id, 'walk'),
          frames: KIRBY_WALK_FILES.map((file) => ({
            key: file === 'walk1' || file === 'walk2' ? petTextureKey('kirby', file) : `kirby-${file}`,
          })),
          frameRate: 12,
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

    // Standing = static idle texture. Walk keeps a two-frame cycle.
    const npcPrefixes = ['cinna', 'bong', ...MINITEEN.map((def) => miniteenTexPrefix(def.id))];
    for (const prefix of npcPrefixes) {
      this.anims.create({
        key: `${prefix}-bounce`,
        frames: [{ key: `${prefix}-idle` }],
        frameRate: 1,
        repeat: -1,
      });
      this.anims.create({
        key: `${prefix}-walk`,
        frames: [{ key: `${prefix}-walk1` }, { key: `${prefix}-walk2` }],
        // Slightly snappier so Imagine stride poses read clearly while moving.
        frameRate: 7,
        repeat: -1,
      });
    }

    this.loadingUi?.destroy();
    this.loadingUi = null;

    if (!State.data.adopted) {
      this.scene.start('Adopt');
    } else {
      this.scene.start('Town');
    }
  }
}
