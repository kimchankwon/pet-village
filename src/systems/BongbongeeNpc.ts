import Phaser from 'phaser';
import { Menu, toast } from './UI';
import { State } from './GameState';
import { ACCESSORY_LIST } from './accessories';
import { WandererNpc, type NpcTalkCallbacks } from './WandererNpc';

const LINES = [
  'Hihi~ I’m Bongbongee! CARATs call me the little diamond friend.',
  'Pink on top, white below, and “17” on my cheeks — that’s me!',
  'Want my mint pom? Or the aqua Carat diamond? Dress your pet cute!',
  'My blue NEW tee is soft… like a hug from CARAT LAND.',
  'Bong! Bong! Let’s sparkle together.',
];

/**
 * SEVENTEEN CARAT mascot NPC. Wanders town and gifts pet accessories.
 */
export class BongbongeeNpc extends WandererNpc {
  constructor(scene: Phaser.Scene, waypoints: { x: number; y: number }[]) {
    super(scene, {
      name: 'Bongbongee',
      texPrefix: 'bong',
      waypoints,
      scale: 1.55,
      speed: 48,
    });
  }

  override talk(cbs: NpcTalkCallbacks) {
    const line = this.pickLine(LINES);
    this.playBounce();
    const missing = ACCESSORY_LIST.filter(
      (a) => a.owner === 'bongbongee' && !State.ownsAccessory(a.id),
    );
    const options = [
      {
        label: missing.length
          ? `Gift me CARAT clothes (${missing.length} left)`
          : 'You already have all my clothes!',
        icon: 'acc-carat-diamond',
        disabled: missing.length === 0,
        onSelect: () => {
          if (missing.length === 0) return;
          for (const a of missing) State.grantAccessory(a.id);
          toast(this.scene, this.sprite.x, this.sprite.y - 28, 'Bong! Dress-up time!', '#7ed6ff');
          this.emote('happy', 1000);
          cbs.onAccessoriesChanged?.();
        },
      },
      {
        label: 'Ask about the diamond',
        onSelect: () => {
          cbs.keepMenuOpen();
          this.emote('happy', 1200);
          const follow = new Menu(
            this.scene,
            'Bongbongee',
            [{ label: 'Shine on, little diamond.', onSelect: () => undefined }],
            {
              subtitle: 'Every CARAT is a diamond — that’s why I sparkle!',
              anchor: 'bottom',
              face: this.faceKey(),
            },
          );
          follow.onClose = cbs.onClose;
        },
      },
      {
        label: 'Ask for a bounce',
        onSelect: () => this.hop(22),
      },
    ];
    const menu = new Menu(this.scene, 'Bongbongee', options, {
      subtitle: line,
      anchor: 'bottom',
      face: this.faceKey(),
    });
    menu.onClose = cbs.onClose;
  }
}
