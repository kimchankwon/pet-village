import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State } from '../systems/GameState';
import { toast } from '../systems/UI';

const GROUND_Y = 480;
const BALL_START = { x: 150, y: 430 };
const THROWS_PER_ROUND = 10;
const COINS_PER_BASKET = 3;
const GRAVITY = 1500;

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };

type Mode = 'aiming' | 'flying' | 'settling' | 'done';

export class PaperTossScene extends Phaser.Scene {
  private ball!: Phaser.GameObjects.Image;
  private bin!: Phaser.GameObjects.Image;
  private binX = 560;
  private mode: Mode = 'aiming';
  private vx = 0;
  private vy = 0;
  private wind = 0; // horizontal acceleration px/s^2
  private throwsLeft = THROWS_PER_ROUND;
  private baskets = 0;
  private streak = 0;
  private scored = false;
  private dragStart: { x: number; y: number } | null = null;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private windText!: Phaser.GameObjects.Text;
  private windArrow!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private keyE!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('PaperToss');
  }

  create() {
    generateTextures(this);
    this.mode = 'aiming';
    this.throwsLeft = THROWS_PER_ROUND;
    this.baskets = 0;
    this.streak = 0;
    this.dragStart = null;

    // Backdrop: cozy arcade room
    this.cameras.main.setBackgroundColor('#2a2440');
    this.add.rectangle(400, 540, 800, 120, 0x4a4370); // floor
    this.add.rectangle(400, GROUND_Y, 800, 4, 0x1a1a2e);
    for (let i = 0; i < 8; i++) {
      this.add.rectangle(50 + i * 100, 100, 40, 8, 0x5d5490); // ceiling slats
    }

    // Thrower penguin
    const penguin = this.add.image(BALL_START.x - 45, GROUND_Y - 24, 'penguin-side');
    penguin.setFlipX(false);

    this.ball = this.add.image(BALL_START.x, BALL_START.y, 'paperball').setDepth(10);
    this.bin = this.add.image(this.binX, GROUND_Y - 32, 'bin').setScale(1.5).setDepth(5);

    this.aimGfx = this.add.graphics().setDepth(20);
    this.windArrow = this.add.graphics().setDepth(20);

    this.add.text(20, 16, 'PAPER TOSS', { ...FONT, fontSize: '18px', color: '#ffe066' });
    this.statusText = this.add.text(20, 44, '', FONT);
    this.windText = this.add.text(400, 32, '', { ...FONT, fontSize: '16px' }).setOrigin(0.5, 0);
    this.bestText = this.add
      .text(780, 16, `Best: ${State.data.bestPaperToss}`, { ...FONT, color: '#c8c8dc' })
      .setOrigin(1, 0);
    this.add
      .text(400, 574, 'Drag from the paper ball and release to throw — watch the wind!', {
        ...FONT,
        fontSize: '12px',
        color: '#c8c8dc',
      })
      .setOrigin(0.5);

    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.newThrow(true);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.mode !== 'aiming') return;
      // Start the drag anywhere near the ball's half of the screen
      if (p.x < 400) this.dragStart = { x: p.x, y: p.y };
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.mode !== 'aiming' || !this.dragStart) return;
      const dx = this.dragStart.x - p.x;
      const dy = this.dragStart.y - p.y;
      this.dragStart = null;
      this.aimGfx.clear();
      // Slingshot: pull down-left, ball flies up-right. Require a real pull.
      if (Math.hypot(dx, dy) < 20) return;
      this.vx = Phaser.Math.Clamp(dx * 4.5, -1200, 1200);
      this.vy = Phaser.Math.Clamp(dy * 4.5, -1400, 400);
      this.mode = 'flying';
      this.scored = false;
    });
  }

  private newThrow(first = false) {
    this.mode = 'aiming';
    this.ball.setPosition(BALL_START.x, BALL_START.y).setVisible(true).setAlpha(1);
    // Fresh wind and a wandering bin every throw
    this.wind = Phaser.Math.Between(-280, 280);
    if (!first) this.binX = Phaser.Math.Between(430, 700);
    this.bin.x = this.binX;
    this.drawWind();
    this.updateStatus();
  }

  private drawWind() {
    const strength = Math.abs(this.wind);
    const dir = this.wind >= 0 ? 1 : -1;
    const label = `Wind ${dir > 0 ? '→' : '←'} ${(strength / 100).toFixed(1)}`;
    this.windText.setText(label).setColor(strength > 180 ? '#ff6b6b' : strength > 90 ? '#ffe066' : '#a8e6cf');
    this.windArrow.clear();
    const len = (strength / 280) * 70 + 10;
    const y = 60;
    this.windArrow.lineStyle(4, 0x87ceeb, 1);
    this.windArrow.lineBetween(400 - (dir * len) / 2, y, 400 + (dir * len) / 2, y);
    this.windArrow.fillStyle(0x87ceeb, 1);
    const tipX = 400 + (dir * len) / 2;
    this.windArrow.fillTriangle(tipX + dir * 10, y, tipX, y - 6, tipX, y + 6);
  }

  private updateStatus() {
    this.statusText.setText(
      `Throws left: ${this.throwsLeft}   Baskets: ${this.baskets}   Streak: ${this.streak}`,
    );
  }

  private basket() {
    this.scored = true;
    this.baskets++;
    this.streak++;
    const bonus = this.streak >= 3 ? 2 : 0;
    const earned = COINS_PER_BASKET + bonus;
    State.addCoins(earned);
    toast(this, this.bin.x, this.bin.y - 60, bonus ? `+${earned} (streak!)` : `+${earned}`, '#ffe066');
    this.tweens.add({ targets: this.ball, y: this.bin.y, alpha: 0, scale: 0.6, duration: 200 });
    this.tweens.add({ targets: this.bin, angle: { from: -4, to: 0 }, duration: 250 });
    this.endThrow();
  }

  private miss() {
    this.streak = 0;
    toast(this, this.ball.x, this.ball.y - 20, 'miss', '#8a8a9e');
    this.endThrow();
  }

  private endThrow() {
    this.mode = 'settling';
    this.throwsLeft--;
    this.updateStatus();
    this.time.delayedCall(700, () => {
      if (this.throwsLeft <= 0) this.finishRound();
      else this.newThrow();
    });
  }

  private finishRound() {
    this.mode = 'done';
    if (this.baskets > State.data.bestPaperToss) {
      State.data.bestPaperToss = this.baskets;
      State.save();
    }
    this.bestText.setText(`Best: ${State.data.bestPaperToss}`);
    const panel = this.add.rectangle(400, 300, 400, 200, 0x2a2440, 0.97).setStrokeStyle(3, 0xffe066).setDepth(50);
    this.add
      .text(400, 240, 'Round over!', { ...FONT, fontSize: '20px', color: '#ffe066' })
      .setOrigin(0.5)
      .setDepth(51);
    this.add
      .text(400, 285, `${this.baskets}/${THROWS_PER_ROUND} baskets`, { ...FONT, fontSize: '16px' })
      .setOrigin(0.5)
      .setDepth(51);
    this.add
      .text(400, 315, `Best: ${State.data.bestPaperToss}`, { ...FONT, color: '#c8c8dc' })
      .setOrigin(0.5)
      .setDepth(51);
    const again = this.add
      .text(300, 360, '[ Play again ]', { ...FONT, color: '#a8e6cf' })
      .setOrigin(0.5)
      .setDepth(51)
      .setInteractive({ useHandCursor: true });
    again.on('pointerdown', () => this.scene.restart());
    const leave = this.add
      .text(500, 360, '[ Back to town ]', { ...FONT, color: '#ffb3d1' })
      .setOrigin(0.5)
      .setDepth(51)
      .setInteractive({ useHandCursor: true });
    leave.on('pointerdown', () => this.scene.start('Town', { spawn: 'arcade' }));
  }

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000;

    // Aim line while dragging
    if (this.mode === 'aiming' && this.dragStart && this.input.activePointer.isDown) {
      const p = this.input.activePointer;
      this.aimGfx.clear();
      this.aimGfx.lineStyle(3, 0xffe066, 0.9);
      this.aimGfx.lineBetween(this.ball.x, this.ball.y, this.ball.x + (this.dragStart.x - p.x), this.ball.y + (this.dragStart.y - p.y));
      // Preview dots along the initial trajectory (without wind — part of the challenge)
      const pvx = Phaser.Math.Clamp((this.dragStart.x - p.x) * 4.5, -1200, 1200);
      const pvy = Phaser.Math.Clamp((this.dragStart.y - p.y) * 4.5, -1400, 400);
      this.aimGfx.fillStyle(0xffffff, 0.5);
      for (let t = 0.08; t <= 0.4; t += 0.08) {
        const x = this.ball.x + pvx * t;
        const y = this.ball.y + pvy * t + 0.5 * GRAVITY * t * t;
        this.aimGfx.fillCircle(x, y, 3);
      }
    }

    if (this.mode === 'flying') {
      this.vx += this.wind * dt;
      this.vy += GRAVITY * dt;
      this.ball.x += this.vx * dt;
      this.ball.y += this.vy * dt;
      this.ball.angle += this.vx * dt * 0.5;

      // Bin mouth: score when the ball drops through the opening
      const mouthY = this.bin.y - 28;
      const mouthHalf = 26;
      if (
        !this.scored &&
        this.vy > 0 &&
        Math.abs(this.ball.x - this.bin.x) < mouthHalf &&
        Math.abs(this.ball.y - mouthY) < 12
      ) {
        this.basket();
        return;
      }
      // Ground or out of bounds = miss
      if (this.ball.y > GROUND_Y - 8 || this.ball.x > 820 || this.ball.x < -20) {
        this.miss();
      }
    }

    if (this.mode === 'done' && Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.scene.start('Town', { spawn: 'arcade' });
    }
  }
}
