import Phaser from 'phaser';
import { feetDepth } from './depth';
import { Menu, toast } from './UI';
import { State } from './GameState';
import { ACCESSORY_LIST } from './accessories';

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
export class BongbongeeNpc {
  sprite: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;
  private waypoints: { x: number; y: number }[];
  private destIndex = 0;
  private pauseUntil = 0;
  private facingLeft = false;
  private readonly SPEED = 48;

  constructor(scene: Phaser.Scene, waypoints: { x: number; y: number }[]) {
    this.scene = scene;
    this.waypoints = waypoints;
    const start = waypoints[0] ?? { x: 500, y: 400 };
    this.sprite = scene.add.sprite(start.x, start.y, 'bong-idle').setScale(1.55);
    this.sprite.setDepth(feetDepth(this.sprite));
    this.sprite.play('bong-bounce');
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
      if (this.sprite.anims.currentAnim?.key !== 'bong-bounce') {
        this.sprite.play('bong-bounce', true);
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
      this.pauseUntil = this.scene.time.now + Phaser.Math.Between(1400, 3200);
      this.pickNext();
      this.sprite.play('bong-bounce', true);
      return;
    }

    const dt = Math.min(this.scene.game.loop.delta / 1000, 0.05);
    const step = Math.min(this.SPEED * dt, dist);
    this.sprite.x += (dx / dist) * step;
    this.sprite.y += (dy / dist) * step;
    if (dx < -0.5) this.facingLeft = true;
    else if (dx > 0.5) this.facingLeft = false;
    this.sprite.setFlipX(this.facingLeft);
    this.sprite.play('bong-walk', true);
    this.sprite.setDepth(feetDepth(this.sprite));
  }

  talk(onClose: () => void, keepMenuOpen?: () => void, onGift?: () => void) {
    const line = LINES[Phaser.Math.Between(0, LINES.length - 1)] ?? LINES[0]!;
    this.sprite.play('bong-bounce', true);
    const missing = ACCESSORY_LIST.filter((a) => !State.ownsAccessory(a.id));
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
          this.sprite.setTexture('bong-happy');
          this.scene.time.delayedCall(1000, () => {
            if (this.sprite.active) this.sprite.play('bong-bounce', true);
          });
          onGift?.();
        },
      },
      {
        label: 'Ask about the diamond',
        onSelect: () => {
          keepMenuOpen?.();
          this.sprite.setTexture('bong-happy');
          this.scene.time.delayedCall(1200, () => {
            if (this.sprite.active) this.sprite.play('bong-bounce', true);
          });
          const follow = new Menu(
            this.scene,
            'Bongbongee',
            [{ label: 'Sparkle on, CARAT!', onSelect: () => undefined }],
            'It’s the Carat Bong gem! Stick it on your pet’s pink cap.',
          );
          follow.onClose = onClose;
        },
      },
      {
        label: 'Cheer “Bong bong!”',
        onSelect: () => {
          this.sprite.setTexture('bong-jump');
          this.scene.tweens.add({
            targets: this.sprite,
            y: this.sprite.y - 22,
            duration: 400,
            yoyo: true,
            onComplete: () => {
              if (this.sprite.active) this.sprite.play('bong-bounce', true);
            },
          });
        },
      },
    ];
    const menu = new Menu(this.scene, 'Bongbongee', options, line);
    menu.onClose = onClose;
  }
}
