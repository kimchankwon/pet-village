import Phaser from 'phaser';
import { feetDepth } from './depth';
import { Menu } from './UI';

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
export class CinnamorollNpc {
  sprite: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;
  private waypoints: { x: number; y: number }[];
  private destIndex = 0;
  private pauseUntil = 0;
  private facingLeft = false;
  private readonly SPEED = 55;

  constructor(scene: Phaser.Scene, waypoints: { x: number; y: number }[]) {
    this.scene = scene;
    this.waypoints = waypoints;
    const start = waypoints[0] ?? { x: 400, y: 400 };
    this.sprite = scene.add.sprite(start.x, start.y, 'cinna-idle').setScale(1.6);
    this.sprite.setDepth(feetDepth(this.sprite));
    this.sprite.play('cinna-bounce');
    this.pickNext();
  }

  private pickNext() {
    if (this.waypoints.length < 2) return;
    let next = this.destIndex;
    while (next === this.destIndex) {
      next = Phaser.Math.Between(0, this.waypoints.length - 1);
    }
    this.destIndex = next;
  }

  update() {
    if (this.scene.time.now < this.pauseUntil) {
      if (this.sprite.anims.currentAnim?.key !== 'cinna-bounce') {
        this.sprite.play('cinna-bounce', true);
      }
      this.sprite.setDepth(feetDepth(this.sprite));
      return;
    }

    const dest = this.waypoints[this.destIndex];
    if (!dest) return;
    const dx = dest.x - this.sprite.x;
    const dy = dest.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      this.pauseUntil = this.scene.time.now + Phaser.Math.Between(1200, 2800);
      this.pickNext();
      this.sprite.play('cinna-bounce', true);
      return;
    }

    const dt = Math.min(this.scene.game.loop.delta / 1000, 0.05);
    const step = Math.min(this.SPEED * dt, dist);
    this.sprite.x += (dx / dist) * step;
    this.sprite.y += (dy / dist) * step;
    if (dx < -0.5) this.facingLeft = true;
    else if (dx > 0.5) this.facingLeft = false;
    this.sprite.setFlipX(this.facingLeft);
    this.sprite.play('cinna-walk', true);
    this.sprite.setDepth(feetDepth(this.sprite));
  }

  talk(onClose: () => void, keepMenuOpen?: () => void) {
    const line = LINES[Phaser.Math.Between(0, LINES.length - 1)] ?? LINES[0]!;
    this.sprite.play('cinna-bounce', true);
    const menu = new Menu(
      this.scene,
      'Cinnamoroll',
      [
        {
          label: 'Wave hello (he blushes)',
          onSelect: () => {
            this.sprite.setTexture('cinna-happy');
            this.scene.time.delayedCall(900, () => {
              if (this.sprite.active) this.sprite.play('cinna-bounce', true);
            });
          },
        },
        {
          label: 'Ask about cinnamon rolls',
          onSelect: () => {
            keepMenuOpen?.();
            this.sprite.setTexture('cinna-happy');
            this.scene.time.delayedCall(1200, () => {
              if (this.sprite.active) this.sprite.play('cinna-bounce', true);
            });
            const follow = new Menu(
              this.scene,
              'Cinnamoroll',
              [{ label: 'Mmm… thank you for asking.', onSelect: () => undefined }],
              'Warm… swirly… the best smell in the sky.',
            );
            follow.onClose = onClose;
          },
        },
        {
          label: 'Ask him to fly',
          onSelect: () => {
            this.sprite.setTexture('cinna-jump');
            this.scene.tweens.add({
              targets: this.sprite,
              y: this.sprite.y - 28,
              duration: 450,
              yoyo: true,
              onComplete: () => {
                if (this.sprite.active) this.sprite.play('cinna-bounce', true);
              },
            });
          },
        },
      ],
      line,
    );
    menu.onClose = onClose;
  }
}
