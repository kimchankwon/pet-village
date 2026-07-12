import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import {
  SKIP_ROPE_MILESTONE_JUMPS,
  SKIP_ROPE_TARGET,
  SKIP_ROPE_WIN_COINS,
  SKIP_ROPE_WIN_HAPPINESS,
  State,
} from '../systems/GameState';
import { Menu, toast } from '../systems/UI';
import { isUiBlocked } from '../systems/nav';
import { petAnimKey, petTextureKey } from '../systems/pets';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };

const PET_GROUND_Y = 430;
/** Rope arc: lowest point skims under the pet's feet, top clears its head. */
const ROPE_BOTTOM_Y = 476;
const ROPE_TOP_Y = 318;
/** Rope handle posts either side of the pet. */
const HANDLE_DX = 170;

/** Starting swing period (ms) — speeds up as the streak grows. */
const PERIOD_START = 1450;
const PERIOD_MIN = 620;
/** Fraction of the cycle where a jump counts (centered on the ground pass). */
const WINDOW_HALF = 0.07;
/** How long the pet stays airborne after a jump (ms). */
const JUMP_AIR_MS = 340;
const JUMP_HEIGHT = 52;

type Mode = 'playing' | 'won' | 'failed' | 'done';

/**
 * Skip Rope — Tamagotchi V3-style rhythm timing.
 * The rope turns a full 360°: down the far side (drawn behind the pet),
 * under the feet, then up the near side (drawn in front) — jump (click /
 * Space / tap) as it passes the ground. One miss ends the run, banking
 * coins + happiness per 5 cleared; 25 in a row wins outright.
 */
export class SkipRopeScene extends Phaser.Scene {
  private mode: Mode = 'playing';
  private backBtn!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private feedbackText!: Phaser.GameObjects.Text;
  private petSprite!: Phaser.GameObjects.Sprite;
  private ropeGfx!: Phaser.GameObjects.Graphics;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private menuOpen = false;
  private ignoreClicksUntil = 0;

  private petX = 0;
  private jumps = 0;
  private periodMs = PERIOD_START;
  /** 0..1 through the current turn; 0.5 = rope passing the pet's feet. */
  private phase = 0.62;
  private jumpedThisSwing = false;
  private airborneUntil = 0;
  private petBaseY = PET_GROUND_Y;

  constructor() {
    super('SkipRope');
  }

  create() {
    generateTextures(this);
    this.mode = 'playing';
    this.menuOpen = false;
    this.ignoreClicksUntil = 0;
    this.jumps = 0;
    this.periodMs = PERIOD_START;
    // Start just past the window so the first pass gives a full turn of lead-in.
    this.phase = 0.62;
    this.jumpedThisSwing = true;
    this.airborneUntil = 0;

    const cx = this.cameras.main.width / 2;
    const viewW = this.cameras.main.width;
    const viewH = this.cameras.main.height;
    this.cameras.main.setBackgroundColor('#2a2440');
    this.petX = cx;

    // Cozy arcade playroom
    this.add.rectangle(cx, 90, viewW, 180, 0x3d3560);
    this.add.rectangle(cx, 280, viewW, 220, 0x352e55);
    this.add.rectangle(cx, viewH - 70, viewW, 160, 0x4a4370);
    this.add.rectangle(cx, PET_GROUND_Y + 18, viewW, 6, 0x1a1a2e);
    for (let i = 0; i < 8; i++) {
      this.add.rectangle(50 + i * 100, 70, 40, 8, 0x5d5490);
    }

    // Handle posts the rope turns between (knob on top).
    const handleY = (ROPE_TOP_Y + ROPE_BOTTOM_Y) / 2;
    const posts = this.add.graphics().setDepth(6);
    for (const px of [this.petX - HANDLE_DX, this.petX + HANDLE_DX]) {
      posts.fillStyle(0x5d4037, 1);
      posts.fillRect(px - 3, handleY, 6, PET_GROUND_Y + 24 - handleY);
      posts.fillStyle(0xffe066, 1);
      posts.fillCircle(px, handleY, 6);
    }

    // The rope itself is redrawn each frame (see drawRope).
    this.ropeGfx = this.add.graphics();

    this.petBaseY = PET_GROUND_Y;
    this.petSprite = this.add
      .sprite(this.petX, this.petBaseY, petTextureKey(State.data.petSpecies, 'idle1'))
      .setScale(2.3)
      .setDepth(10);
    this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
    this.drawRope();

    this.add.text(140, 16, 'SKIP ROPE', { ...FONT, fontSize: '18px', color: '#ffe066' });
    this.countText = this.add.text(20, 44, `Jumps: 0 / ${SKIP_ROPE_TARGET}`, {
      ...FONT,
      fontSize: '16px',
      color: '#a8e6cf',
    });
    this.bestText = this.add
      .text(viewW - 20, 16, `Best: ${State.data.bestSkipRope || 0}`, { ...FONT, color: '#c8c8dc' })
      .setOrigin(1, 0);
    this.feedbackText = this.add
      .text(cx, 110, '', { ...FONT, fontSize: '20px', color: '#ffe066' })
      .setOrigin(0.5)
      .setDepth(30);
    this.hintText = this.add
      .text(
        cx,
        viewH - 28,
        `Click / Space / tap as the rope passes the ground · one miss ends the run · ${SKIP_ROPE_TARGET} wins!`,
        {
          ...FONT,
          fontSize: '12px',
          color: '#c8c8dc',
        },
      )
      .setOrigin(0.5);

    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.time.addEvent({
      delay: 60_000,
      loop: true,
      callback: () => {
        State.decay(1 / 60);
        State.save();
      },
    });

    this.backBtn = this.add
      .text(14, 10, '[ Back ]', { ...FONT, fontSize: '18px', color: '#ffb3d1', padding: { x: 8, y: 8 } })
      .setOrigin(0, 0)
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    this.backBtn.on('pointerdown', () => {
      this.ignoreClicksUntil = this.time.now + 150;
      this.requestLeave();
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.menuOpen || this.time.now < this.ignoreClicksUntil || isUiBlocked()) return;
      if (p.button !== 0) return;
      if (this.mode === 'playing') this.tryJump();
    });

    this.flashFeedback('Get ready…', '#c8c8dc');
  }

  private refreshHud() {
    this.countText.setText(`Jumps: ${this.jumps} / ${SKIP_ROPE_TARGET}`);
    this.bestText.setText(`Best: ${State.data.bestSkipRope || 0}`);
  }

  /**
   * Draw the rope for the current phase. The turn is a circle in the
   * depth/height plane: phase 0 = overhead, 0→0.5 coming down the far side
   * (behind the pet), 0.5 = under the feet, 0.5→1 rising the near side
   * (in front of the pet).
   */
  private drawRope() {
    const theta = (this.phase - 0.5) * Math.PI * 2;
    const inFront = Math.sin(theta) > 0;
    const centerY = (ROPE_TOP_Y + ROPE_BOTTOM_Y) / 2;
    const radius = (ROPE_BOTTOM_Y - ROPE_TOP_Y) / 2;
    const bellyY = centerY + radius * Math.cos(theta);
    const handleY = centerY;

    const g = this.ropeGfx;
    g.clear();
    g.setDepth(inFront ? 12 : 8);
    // Slightly thinner + darker on the far side for depth.
    g.lineStyle(inFront ? 4 : 3, inFront ? 0x8d6e63 : 0x5d4037, 1);
    const x0 = this.petX - HANDLE_DX;
    const x1 = this.petX + HANDLE_DX;
    // Quadratic curve whose midpoint tracks the turning belly of the rope.
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(x0, handleY),
      new Phaser.Math.Vector2(this.petX, 2 * bellyY - handleY),
      new Phaser.Math.Vector2(x1, handleY),
    );
    curve.draw(g, 24);
  }

  private inJumpWindow(): boolean {
    return Math.abs(this.phase - 0.5) <= WINDOW_HALF;
  }

  private tryJump() {
    if (this.mode !== 'playing') return;
    if (this.time.now < this.airborneUntil) return; // already mid-jump
    if (this.jumpedThisSwing) return; // already resolved this turn

    if (!this.inJumpWindow()) {
      this.fail(this.phase < 0.5 ? 'Too early!' : 'Too late!');
      return;
    }

    this.jumpedThisSwing = true;
    this.airborneUntil = this.time.now + JUMP_AIR_MS;
    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'jump'));
    this.tweens.killTweensOf(this.petSprite);
    this.tweens.add({
      targets: this.petSprite,
      y: this.petBaseY - JUMP_HEIGHT,
      duration: JUMP_AIR_MS * 0.45,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (this.mode === 'playing' && this.petSprite.active) {
          this.petSprite.y = this.petBaseY;
          this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
        }
      },
    });

    this.jumps += 1;
    this.periodMs = Phaser.Math.Linear(
      PERIOD_START,
      PERIOD_MIN,
      Phaser.Math.Clamp(this.jumps / SKIP_ROPE_TARGET, 0, 1),
    );
    State.recordSkipRope(this.jumps);
    this.refreshHud();
    this.flashFeedback('Nice!', '#a8e6cf');

    if (this.jumps >= SKIP_ROPE_TARGET) {
      // Keep the rope turning so the winning jump visibly clears it, then celebrate.
      this.mode = 'won';
      this.backBtn.setVisible(false);
      this.time.delayedCall(JUMP_AIR_MS + 200, () => this.celebrateWin());
    }
  }

  /** One miss ends the run: sad stumble, bank milestone rewards, failed panel. */
  private fail(reason: string) {
    if (this.mode !== 'playing') return;
    this.mode = 'failed';
    this.backBtn.setVisible(false);
    const reward = State.rewardSkipRopeRun(this.jumps);
    this.flashFeedback(reason, '#ff6b6b');

    this.tweens.killTweensOf(this.petSprite);
    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'sad'));
    this.petSprite.y = this.petBaseY;
    // Little stumble
    this.tweens.add({
      targets: this.petSprite,
      x: this.petX + 10,
      angle: { from: -8, to: 0 },
      duration: 280,
      yoyo: true,
      onComplete: () => {
        this.petSprite.x = this.petX;
        this.petSprite.angle = 0;
      },
    });

    this.time.delayedCall(700, () => this.showResultPanel(false, reward));
  }

  private flashFeedback(msg: string, color: string) {
    this.feedbackText.setText(msg).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.feedbackText);
    this.tweens.add({
      targets: this.feedbackText,
      alpha: 0,
      duration: 520,
      delay: 180,
    });
  }

  private celebrateWin() {
    State.rewardSkipRopeWin();
    this.refreshHud();

    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'happy'));
    toast(this, this.cameras.main.width / 2, 150, `+${SKIP_ROPE_WIN_COINS} coins!`, '#a8e6cf');
    this.time.delayedCall(450, () =>
      this.showResultPanel(true, { coins: SKIP_ROPE_WIN_COINS, happiness: SKIP_ROPE_WIN_HAPPINESS }),
    );
  }

  private showResultPanel(cleared: boolean, reward: { coins: number; happiness: number }) {
    this.mode = 'done';
    this.backBtn.setVisible(false);
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;

    // The pet's own reaction is part of the result screen — keep it visible
    // under the panel and pose it to match.
    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, cleared ? 'happy' : 'sad'));

    // Pink border like every other modal; the title carries the fail colour.
    this.add
      .rectangle(cx, cy, 460, 250, 0x2a2440, 0.97)
      .setStrokeStyle(3, 0xffb3d1)
      .setDepth(1600)
      .setInteractive();
    this.add
      .text(cx, cy - 78, cleared ? 'Skip Rope cleared!' : 'Skip Rope failed!', {
        ...FONT,
        fontSize: '22px',
        color: cleared ? '#ffe066' : '#ff6b6b',
      })
      .setOrigin(0.5)
      .setDepth(1601);

    // A little portrait of the (proud or defeated) pet on the panel.
    const face = this.add
      .image(cx, cy - 36, petTextureKey(State.data.petSpecies, cleared ? 'happy' : 'sad'))
      .setDepth(1601);
    face.setScale(Math.min(3, 52 / Math.max(face.width, face.height)));

    const rewardLine =
      reward.coins > 0 || reward.happiness > 0
        ? `${this.jumps} jumps · +${reward.coins} coins · +${reward.happiness} happy`
        : `${this.jumps} jumps — clear ${SKIP_ROPE_MILESTONE_JUMPS}+ for a reward`;
    this.add
      .text(cx, cy + 8, rewardLine, { ...FONT, fontSize: '15px' })
      .setOrigin(0.5)
      .setDepth(1601);
    this.add
      .text(cx, cy + 36, `Best: ${State.data.bestSkipRope}`, { ...FONT, color: '#c8c8dc' })
      .setOrigin(0.5)
      .setDepth(1601);

    const again = this.add
      .text(cx - 120, cy + 84, cleared ? '[ Play again ]' : '[ Try again ]', {
        ...FONT,
        fontSize: '18px',
        color: '#a8e6cf',
        padding: { x: 10, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    again.on('pointerdown', () => this.scene.restart());
    const leave = this.add
      .text(cx + 135, cy + 84, '[ Back to town ]', {
        ...FONT,
        fontSize: '18px',
        color: '#ffb3d1',
        padding: { x: 10, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    leave.on('pointerdown', () => this.scene.start('Town', { spawn: 'skiprope' }));
  }

  private requestLeave() {
    if (this.mode !== 'playing') {
      this.scene.start('Town', { spawn: 'skiprope' });
      return;
    }
    this.menuOpen = true;
    const menu = new Menu(
      this,
      'Leave Skip Rope?',
      [
        { label: 'Keep jumping', onSelect: () => undefined },
        {
          label: 'Back to town',
          onSelect: () => this.scene.start('Town', { spawn: 'skiprope' }),
        },
      ],
      'Progress this run is lost — your best streak is saved',
    );
    menu.onClose = () => {
      this.menuOpen = false;
      this.ignoreClicksUntil = this.time.now + 250;
    };
  }

  update(_time: number, deltaMs: number) {
    if (isUiBlocked() || this.menuOpen) return;

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.requestLeave();
      return;
    }

    // Failed/done: the rope freezes where the run ended.
    if (this.mode === 'done' || this.mode === 'failed') return;

    if (Phaser.Input.Keyboard.JustDown(this.keySpace) && this.mode === 'playing') {
      this.tryJump();
    }

    // Advance the rope (also during 'won' so the last jump visibly clears it).
    const prevPhase = this.phase;
    this.phase += deltaMs / this.periodMs;
    if (this.phase >= 1) {
      this.phase -= 1;
      this.jumpedThisSwing = false;
    }

    // Letting the window close without jumping ends the run too.
    const windowEnd = 0.5 + WINDOW_HALF;
    if (
      this.mode === 'playing' &&
      !this.jumpedThisSwing &&
      prevPhase < windowEnd &&
      this.phase >= windowEnd
    ) {
      this.fail('Missed!');
    }

    this.drawRope();
  }
}
