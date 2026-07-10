import Phaser from 'phaser';
import { State } from './GameState';
import { toast } from './UI';
import { feetDepth } from './depth';

// Tamagotchi companion. Smoothly chases a follow-slot beside the player
// (no breadcrumb trail — that caused weird U-turns on direction changes).
export class Pet {
  sprite: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;
  // Softened follow point so player flip/turnarounds don't yank the pet.
  private followX: number;
  private followY: number;
  private facingLeft = false;
  private readonly ARRIVE = 3;
  // While an emotion pose (happy/sleep/jump) is showing, walk/idle don't override it.
  private emotionUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.followX = x;
    this.followY = y;
    this.sprite = scene.add.sprite(x, y, 'pet-idle1').setScale(1.5);
    this.sprite.setDepth(feetDepth(this.sprite));
    this.sprite.play('pet-bounce');
    this.updateMood();
  }

  update(targetX: number, targetY: number, playerMoving: boolean) {
    const dt = Math.min(this.scene.game.loop.delta / 1000, 0.05);
    const prevX = this.sprite.x;

    // Ease the desired slot (side-swap on flip is gradual, not instant).
    const slotRate = playerMoving ? 7 : 4;
    const slotT = 1 - Math.exp(-slotRate * dt);
    this.followX += (targetX - this.followX) * slotT;
    this.followY += (targetY - this.followY) * slotT;

    const dx = this.followX - this.sprite.x;
    const dy = this.followY - this.sprite.y;
    const dist = Math.hypot(dx, dy);

    let moving = false;
    if (dist > this.ARRIVE) {
      // Match player pace when close; boost when lagging after a long dash.
      const base = playerMoving ? 175 : 110;
      const boost = Phaser.Math.Clamp((dist - 40) * 2.5, 0, 180);
      const speed = base + boost;
      const step = Math.min(speed * dt, dist);
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;
      moving = step > 0.4;
    } else {
      this.sprite.x = this.followX;
      this.sprite.y = this.followY;
    }

    this.sprite.setDepth(feetDepth(this.sprite));

    if (this.scene.time.now < this.emotionUntil) return;

    // Hysteresis so tiny corrections don't flicker facing.
    const movedX = this.sprite.x - prevX;
    if (movedX < -1.0) this.facingLeft = true;
    else if (movedX > 1.0) this.facingLeft = false;
    this.sprite.setFlipX(this.facingLeft);

    if (State.petMood() === 'sad') {
      if (this.sprite.anims.isPlaying) this.sprite.stop();
      if (this.sprite.texture.key !== 'pet-sad') this.sprite.setTexture('pet-sad');
    } else if (moving) {
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
