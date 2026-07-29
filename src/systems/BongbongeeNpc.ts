import Phaser from 'phaser';
import { Menu } from './UI';
import { miniteenDrawScale } from './miniteen';
import { WandererNpc, type NpcTalkCallbacks } from './WandererNpc';

const LINES = [
  'Hihi~ I’m Bongbongee! CARATs call me the little diamond friend.',
  'Pink on top, white below, and “17” on my cheeks — that’s me!',
  'Cafe Cinnamon has outfits that fit me — gem clips, mint puffs… sparkly!',
  'Bong! Bong! Let’s sparkle together.',
  'Mingyu drew me for CARATLAND 2018. I’m basically art.',
  'Visit Cafe Cinnamon if you want diamond clothes for a Bongbongee pet!',
];

/**
 * SEVENTEEN CARAT mascot NPC. Wanders town and chats — outfits are sold at
 * Cafe Cinnamon (not gifted here).
 */
export class BongbongeeNpc extends WandererNpc {
  constructor(scene: Phaser.Scene, waypoints: { x: number; y: number }[]) {
    super(scene, {
      name: 'Bongbongee',
      texPrefix: 'bong',
      waypoints,
      // Shared villager height — penguin-tall, like every other NPC.
      scale: miniteenDrawScale(scene, 'bong'),
      speed: 48,
    });
  }

  protected override openTalk(cbs: NpcTalkCallbacks) {
    const line = this.pickLine(LINES);
    this.playBounce();
    const options = [
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
        label: 'Where do I get your outfits?',
        onSelect: () => {
          cbs.keepMenuOpen();
          this.emote('happy', 1000);
          const follow = new Menu(
            this.scene,
            'Bongbongee',
            [{ label: 'Thanks, Bong!', onSelect: () => undefined }],
            {
              subtitle:
                'Cafe Cinnamon stocks Aqua Gem Clips, Mint Cap Puffs, Diamond Tees, and Carat Sashes — Bongbongee pets only!',
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
