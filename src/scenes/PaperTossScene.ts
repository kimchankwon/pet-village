import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State } from '../systems/GameState';
import { toast } from '../systems/UI';

const GROUND_Y = 480;
const BALL_START = { x: 150, y: 430 };
const THROWS_PER_LEVEL = 3;
const COINS_PER_BASKET = 3;
// Slower, floatier flight so the wind has time to bend the arc.
const GRAVITY = 1100;
const BALL_R = 12;
// Drag-to-power: the pull saturates at MAX_DRAG px — dragging further
// doesn't add speed (the aim line turns red at the cap).
const MAX_DRAG = 260;
const POWER = 3.4; // velocity per px of (clamped) drag
// Wind pushes the ball harder than its raw px/s² value.
const WIND_INFLUENCE = 1.25;

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };

type Mode = 'aiming' | 'flying' | 'settling' | 'done';

interface ObstacleDef {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Oscillates vertically around y. */
  moveY?: { range: number; speed: number };
}

// 3 throws per level; each level brings stronger wind, a wider-wandering
// bin, and more randomly placed obstacle planks the ball bounces off.
const LEVELS: { windMax: number; binMin: number; binMax: number; obstacles: number }[] = [
  { windMax: 220, binMin: 430, binMax: 600, obstacles: 0 },
  { windMax: 320, binMin: 430, binMax: 650, obstacles: 1 },
  { windMax: 440, binMin: 450, binMax: 680, obstacles: 2 },
  { windMax: 560, binMin: 460, binMax: 700, obstacles: 3 },
];
const THROWS_PER_ROUND = THROWS_PER_LEVEL * LEVELS.length;

// Paper-ball tints the player can pick; persisted in the game registry.
const BALL_TINTS = [0xffffff, 0xffb3d1, 0xa8e6cf, 0xffe066, 0x87ceeb];
const BALL_TINT_KEY = 'paperBallTint';

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
  private level = 0; // 1-based once newThrow runs
  private obstacles: { rect: Phaser.GameObjects.Rectangle; def: ObstacleDef; phase: number }[] = [];
  private windStreaks: { rect: Phaser.GameObjects.Rectangle; baseY: number; seed: number }[] = [];
  private swatches: Phaser.GameObjects.Rectangle[] = [];
  private scored = false;
  private dragStart: { x: number; y: number } | null = null;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private windText!: Phaser.GameObjects.Text;
  private windArrow!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('PaperToss');
  }

  create() {
    generateTextures(this);
    this.mode = 'aiming';
    this.throwsLeft = THROWS_PER_ROUND;
    this.baskets = 0;
    this.streak = 0;
    this.level = 0;
    this.obstacles = [];
    this.windStreaks = [];
    this.swatches = [];
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
    this.ball.setTint((this.registry.get(BALL_TINT_KEY) as number | undefined) ?? BALL_TINTS[0]);
    this.bin = this.add.image(this.binX, GROUND_Y - 32, 'bin').setScale(1.5).setDepth(5);

    this.buildSwatches();

    this.aimGfx = this.add.graphics().setDepth(20);
    this.windArrow = this.add.graphics().setDepth(20);

    this.add.text(20, 16, 'PAPER TOSS', { ...FONT, fontSize: '18px', color: '#ffe066' });
    this.statusText = this.add.text(20, 44, '', FONT);
    // Wind readout lives at the bottom, over the floor.
    this.windText = this.add.text(400, 496, '', { ...FONT, fontSize: '16px' }).setOrigin(0.5, 0).setDepth(21);

    // Drifting streaks across the play area animate which way (and how
    // hard) the wind is blowing.
    for (let i = 0; i < 12; i++) {
      const baseY = Phaser.Math.Between(130, 460);
      const rect = this.add
        .rectangle(Phaser.Math.Between(0, 800), baseY, 30, 2, 0xcfe8ff, 1)
        .setAlpha(0.18)
        .setDepth(3);
      this.windStreaks.push({ rect, baseY, seed: i * 0.9 });
    }
    this.bestText = this.add
      .text(780, 16, `Best: ${State.data.bestPaperToss}`, { ...FONT, color: '#c8c8dc' })
      .setOrigin(1, 0);
    this.add
      .text(400, 574, 'Drag anywhere to throw · ESC / Back to leave — watch the wind!', {
        ...FONT,
        fontSize: '12px',
        color: '#c8c8dc',
      })
      .setOrigin(0.5);

    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // Always-visible leave control
    const backBtn = this.add
      .text(780, 44, '[ Back ]', { ...FONT, color: '#ffb3d1' })
      .setOrigin(1, 0)
      .setDepth(51)
      .setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this.scene.start('Town', { spawn: 'arcade' }));

    this.newThrow(true);

    // Start the drag anywhere on screen — both halves work.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.mode !== 'aiming') return;
      this.dragStart = { x: p.x, y: p.y };
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (this.mode !== 'aiming' || !this.dragStart) return;
      const dx = this.dragStart.x - p.x;
      const dy = this.dragStart.y - p.y;
      this.dragStart = null;
      this.aimGfx.clear();
      // Slingshot: pull down-left, ball flies up-right. Require a real pull.
      if (Math.hypot(dx, dy) < 20) return;
      const c = this.clampDrag(dx, dy);
      this.vx = c.dx * POWER;
      this.vy = Math.min(c.dy * POWER, 400); // never hurl it straight down
      this.mode = 'flying';
      this.scored = false;
    };
    this.input.on('pointerup', release);
    // Letting go outside the game canvas still counts as the throw.
    this.input.on('pointerupoutside', release);
  }

  // Small colour swatches: tint the paper ball; choice persists via registry.
  private buildSwatches() {
    this.add.text(20, 70, 'Ball:', { ...FONT, fontSize: '12px', color: '#c8c8dc' });
    const current = (this.registry.get(BALL_TINT_KEY) as number | undefined) ?? BALL_TINTS[0];
    BALL_TINTS.forEach((tint, i) => {
      const s = this.add
        .rectangle(72 + i * 26, 78, 18, 18, tint)
        .setDepth(30)
        .setInteractive({ useHandCursor: true });
      s.setStrokeStyle(2, tint === current ? 0xffffff : 0x1a1a2e);
      s.on('pointerdown', () => {
        this.registry.set(BALL_TINT_KEY, tint);
        this.ball.setTint(tint);
        this.swatches.forEach((sw, j) => sw.setStrokeStyle(2, BALL_TINTS[j] === tint ? 0xffffff : 0x1a1a2e));
      });
      this.swatches.push(s);
    });
  }

  // The drag vector saturates at MAX_DRAG px — that's full power.
  private clampDrag(dx: number, dy: number): { dx: number; dy: number; atMax: boolean } {
    const len = Math.hypot(dx, dy);
    if (len <= MAX_DRAG) return { dx, dy, atMax: false };
    const k = MAX_DRAG / len;
    return { dx: dx * k, dy: dy * k, atMax: true };
  }

  // Obstacle planks the ball bounces off. Count scales with the level and
  // positions re-randomise every throw; level 4's first plank oscillates.
  private buildObstacles() {
    this.obstacles.forEach((o) => o.rect.destroy());
    this.obstacles = [];
    const count = LEVELS[this.level - 1].obstacles;
    const placed: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      let x = 0;
      let y = 0;
      // Keep planks spaced out so a clear line to the bin always exists.
      for (let tries = 0; tries < 20; tries++) {
        x = Phaser.Math.Between(300, 640);
        y = Phaser.Math.Between(170, 400);
        if (!placed.some((p) => Math.abs(p.x - x) < 130 && Math.abs(p.y - y) < 70)) break;
      }
      placed.push({ x, y });
      const def: ObstacleDef = {
        x,
        y,
        w: Phaser.Math.Between(70, 110),
        h: 16,
        moveY: this.level === LEVELS.length && i === 0 ? { range: 90, speed: 1.7 } : undefined,
      };
      const rect = this.add
        .rectangle(def.x, def.y, def.w, def.h, 0x8d6e63)
        .setStrokeStyle(3, 0x5d4037)
        .setDepth(4);
      this.obstacles.push({ rect, def, phase: i * 1.3 });
    }
  }

  private newThrow(first = false) {
    this.mode = 'aiming';
    // Reset scale/alpha too — the basket tween shrinks and fades the ball.
    this.ball.setPosition(BALL_START.x, BALL_START.y).setVisible(true).setAlpha(1).setScale(1);

    // Level up every THROWS_PER_LEVEL throws: more obstacles, stronger wind.
    const thrown = THROWS_PER_ROUND - this.throwsLeft;
    const level = Math.min(LEVELS.length, Math.floor(thrown / THROWS_PER_LEVEL) + 1);
    if (level !== this.level) {
      this.level = level;
      if (!first) toast(this, 400, 180, `Level ${level} — stronger wind!`, '#ffe066');
    }
    // Obstacles re-randomise every throw.
    this.buildObstacles();

    // Fresh wind and a wandering bin every throw; both scale with the level.
    const cfg = LEVELS[this.level - 1];
    this.wind = Phaser.Math.Between(-cfg.windMax, cfg.windMax);
    if (!first) this.binX = Phaser.Math.Between(cfg.binMin, cfg.binMax);
    this.bin.x = this.binX;
    this.drawWind();
    this.updateStatus();
  }

  private drawWind() {
    const windMax = LEVELS[this.level - 1].windMax;
    const strength = Math.abs(this.wind);
    const dir = this.wind >= 0 ? 1 : -1;
    const label = `Wind ${dir > 0 ? '→' : '←'} ${(strength / 100).toFixed(1)}`;
    this.windText.setText(label).setColor(strength > 180 ? '#ff6b6b' : strength > 90 ? '#ffe066' : '#a8e6cf');
    this.windArrow.clear();
    const len = (strength / windMax) * 70 + 10;
    const y = 526;
    this.windArrow.lineStyle(4, 0x87ceeb, 1);
    this.windArrow.lineBetween(400 - (dir * len) / 2, y, 400 + (dir * len) / 2, y);
    this.windArrow.fillStyle(0x87ceeb, 1);
    const tipX = 400 + (dir * len) / 2;
    this.windArrow.fillTriangle(tipX + dir * 10, y, tipX, y - 6, tipX, y + 6);
  }

  private updateStatus() {
    this.statusText.setText(
      `Level ${this.level}/${LEVELS.length}   Throws left: ${this.throwsLeft}   Baskets: ${this.baskets}   Streak: ${this.streak}`,
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

  update(time: number, deltaMs: number) {
    const dt = deltaMs / 1000;

    // Oscillating obstacles (level 4 variant)
    for (const o of this.obstacles) {
      if (o.def.moveY) {
        o.rect.y = o.def.y + Math.sin(time / 1000 * o.def.moveY.speed + o.phase) * (o.def.moveY.range / 2);
      }
    }

    // Wind streaks drift with the wind: direction, speed and length all
    // read the current wind so the blow is visible at a glance.
    for (const s of this.windStreaks) {
      s.rect.x += this.wind * WIND_INFLUENCE * dt;
      s.rect.displayWidth = 16 + Math.abs(this.wind) / 7;
      s.rect.y = s.baseY + Math.sin(time / 400 + s.seed) * 4;
      s.rect.setAlpha(this.mode === 'done' ? 0 : 0.1 + Math.min(0.22, Math.abs(this.wind) / 1800));
      if (s.rect.x > 830) s.rect.x -= 860;
      else if (s.rect.x < -30) s.rect.x += 860;
    }

    // Aim line while dragging — clamped at max power (line turns red).
    if (this.mode === 'aiming' && this.dragStart && this.input.activePointer.isDown) {
      const p = this.input.activePointer;
      const c = this.clampDrag(this.dragStart.x - p.x, this.dragStart.y - p.y);
      this.aimGfx.clear();
      this.aimGfx.lineStyle(3, c.atMax ? 0xff6b6b : 0xffe066, 0.9);
      this.aimGfx.lineBetween(this.ball.x, this.ball.y, this.ball.x + c.dx, this.ball.y + c.dy);
      // Preview dots along the initial trajectory (without wind — part of the challenge)
      const pvx = c.dx * POWER;
      const pvy = Math.min(c.dy * POWER, 400);
      this.aimGfx.fillStyle(0xffffff, 0.5);
      for (let t = 0.08; t <= 0.4; t += 0.08) {
        const x = this.ball.x + pvx * t;
        const y = this.ball.y + pvy * t + 0.5 * GRAVITY * t * t;
        this.aimGfx.fillCircle(x, y, 3);
      }
    }

    if (this.mode === 'flying') {
      this.vx += this.wind * WIND_INFLUENCE * dt;
      this.vy += GRAVITY * dt;
      this.ball.x += this.vx * dt;
      this.ball.y += this.vy * dt;
      this.ball.angle += this.vx * dt * 0.5;

      // Bounce off obstacle planks (AABB, resolve the shallower axis).
      for (const o of this.obstacles) {
        const hw = o.rect.width / 2 + BALL_R;
        const hh = o.rect.height / 2 + BALL_R;
        const dx = this.ball.x - o.rect.x;
        const dy = this.ball.y - o.rect.y;
        if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
          const px = hw - Math.abs(dx);
          const py = hh - Math.abs(dy);
          if (px < py) {
            this.ball.x += dx > 0 ? px : -px;
            this.vx = -this.vx * 0.55;
          } else {
            this.ball.y += dy > 0 ? py : -py;
            this.vy = -this.vy * 0.5;
            this.vx *= 0.85;
          }
        }
      }

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

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.scene.start('Town', { spawn: 'arcade' });
    }
  }
}
