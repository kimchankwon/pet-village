import Phaser from 'phaser';
import { Menu } from './UI';
import { WandererNpc, type NpcTalkCallbacks } from './WandererNpc';

const LINES = [
  '…hi. I’m Cinnamoroll. I floated here on a cloud smell of cinnamon rolls.',
  'I get shy… but I like making friends. Want to sit and nap with me later?',
  'My ears go flap-flap and I can fly a little! Just don’t startle me.',
  'Cafe Cinnamon’s rolls are the best… warm and swirly like my tail.',
  'I’m quiet, but if you need help I’ll try. Softly.',
  'Sometimes I nap on friendly laps. Only if that’s okay…!',
];

/**
 * Shy, friendly white puppy NPC (Sanrio Cinnamoroll vibes).
 * Wanders town paths and chats when you interact.
 */
export class CinnamorollNpc extends WandererNpc {
  constructor(scene: Phaser.Scene, waypoints: { x: number; y: number }[]) {
    super(scene, {
      name: 'Cinnamoroll',
      texPrefix: 'cinna',
      waypoints,
      scale: 1.6,
      speed: 55,
      pauseMs: [1200, 2800],
    });
  }

  override talk(cbs: NpcTalkCallbacks) {
    const line = this.pickLine(LINES);
    this.playBounce();
    const menu = new Menu(
      this.scene,
      'Cinnamoroll',
      [
        {
          label: 'Wave hello (he blushes)',
          onSelect: () => this.emote('happy', 900),
        },
        {
          label: 'Ask about cinnamon rolls',
          onSelect: () => {
            cbs.keepMenuOpen();
            this.emote('happy', 1200);
            const follow = new Menu(
              this.scene,
              'Cinnamoroll',
              [{ label: 'Mmm… thank you for asking.', onSelect: () => undefined }],
              'Warm… swirly… the best smell in the sky.',
            );
            follow.onClose = cbs.onClose;
          },
        },
        {
          label: 'Ask him to fly',
          onSelect: () => this.hop(28),
        },
      ],
      line,
    );
    menu.onClose = cbs.onClose;
  }
}
