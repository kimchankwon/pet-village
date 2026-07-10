import Phaser from 'phaser';
import { State } from './GameState';
import { toast } from './UI';

// The tamagotchi companion (Mametchi, Tamagotchi iD sprites). Follows the
// player along a breadcrumb trail of recent positions, so it retraces the
// player's path like a duckling.
export class Pet {
  sprite: Phaser.GameObjects.Sprite;
  private trail: { x: number; y: number }[] = [];
  private scene: Phaser.Scene;
  private readonly FOLLOW_DISTANCE = 18; // breadcrumbs behind the player
  // While an emotion pose (happy/sleep/jump) is showing, walk/idle don't override it.
  private emotionUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.sprite = scene.add.sprite(x, y, 'pet-idle1').setScale(1.5).setDepth(y);
    this.sprite.play('pet-bounce');
    this.updateMood();
  }

  update(targetX: number, targetY: number, playerMoving: boolean) {
    const prevX = this.sprite.x;
    if (playerMoving) {
      this.trail.push({ x: targetX, y: targetY });
      if (this.trail.length > this.FOLLOW_DISTANCE) {
        const p = this.trail.shift()!;
        this.sprite.x = Phaser.Math.Linear(this.sprite.x, p.x, 0.6);
        this.sprite.y = Phaser.Math.Linear(this.sprite.y, p.y, 0.6);
      }
    } else if (this.trail.length > 0) {
      // Catch up to the player after they stop, then idle beside them.
      const p = this.trail[0];
      this.sprite.x = Phaser.Math.Linear(this.sprite.x, p.x, 0.15);
      this.sprite.y = Phaser.Math.Linear(this.sprite.y, p.y, 0.15);
      if (Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, p.x, p.y) < 2) {
        this.trail.shift();
      }
    }
    this.sprite.setDepth(this.sprite.y);

    if (this.scene.time.now < this.emotionUntil) return;

    const dx = this.sprite.x - prevX;
    if (Math.abs(dx) > 0.5) this.sprite.setFlipX(dx < 0);

    if (State.petMood() === 'sad') {
      if (this.sprite.anims.isPlaying) this.sprite.stop();
      if (this.sprite.texture.key !== 'pet-sad') this.sprite.setTexture('pet-sad');
    } else if (Math.abs(dx) > 0.5 || this.trail.length > 2) {
      this.sprite.play('pet-walk', true);
    } else {
      this.sprite.play('pet-bounce', true);
    }
  }

  updateMood() {
    if (this.scene.time.now < this.emotionUntil) return;
    if (State.petMood() === 'sad') {
      this.sprite.stop();
      this.sprite.setTexture('pet-sad');
    } else if (!this.sprite.anims.isPlaying) {
      this.sprite.play('pet-bounce');
    }
  }

  // Show a one-off pose (pet-happy / pet-sleep / pet-jump) for a moment.
  showEmotion(textureKey: string, ms: number) {
    this.emotionUntil = this.scene.time.now + ms;
    this.sprite.stop();
    this.sprite.setTexture(textureKey);
  }

  emitHearts() {
    for (let i = 0; i < 3; i++) {
      const h = this.scene.add
        .image(this.sprite.x + Phaser.Math.Between(-14, 14), this.sprite.y - 10, 'heart')
        .setDepth(1500);
      this.scene.tweens.add({
        targets: h,
        y: h.y - 40 - i * 8,
        alpha: 0,
        duration: 900 + i * 200,
        onComplete: () => h.destroy(),
      });
    }
  }

  celebrate(msg: string) {
    toast(this.scene, this.sprite.x, this.sprite.y - 24, msg, '#ffb3d1');
    this.showEmotion('pet-happy', 1400);
    this.emitHearts();
  }
}
