import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import {
  SKIP_ROPE_TARGET,
  SKIP_ROPE_WIN_COINS,
  SKIP_ROPE_WIN_HAPPINESS,
  State,
} from '../systems/GameState';
import { Menu, toast } from '../systems/UI';
import { isUiBlocked } from '../systems/nav';
import { petAnimKey, petTextureKey } from '../systems/pets';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };

/** Pet stands here; rope swings through this x. */
const PET_X = 400;
const PET_GROUND_Y = 430;
/** Rope pivot above the playfield (top of the swing). */
const ROPE_PIVOT = { x: PET_X, y: 120 };
const ROPE_LENGTH = 290;

/** Starting swing period (ms) — slows → speeds as streak grows. */
const PERIOD_START = 1450;
const PERIOD_MIN = 620;
/** Fraction of the cycle where a jump counts (centered on the ground pass). */
const WINDOW_HALF = 0.07;
/** How long the pet stays airborne after a jump (ms). */
const JUMP_AIR_MS = 340;
const JUMP_HEIGHT = 52;

type Mode = 'playing' | 'reacting' | 'won' | 'done';

/**
 * Skip Rope — Tamagotchi V3-style rhythm timing.
 * Jump (click / Space / tap) while the rope is in the window; 25 in a row wins.
 */
export class SkipRopeScene extends Phaser.Scene {
  private mode: Mode = 'playing';
  private backBtn!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private feedbackText!: Phaser.GameObjects.Text;
  private petSprite!: Phaser.GameObjects.Sprite;
  private rope!: Phaser.GameObjects.Image;
  private windowCue!: Phaser.GameObjects.Image;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private menuOpen = false;
  private ignoreClicksUntil = 0;

  private jumps = 0;
  private periodMs = PERIOD_START;
  /** 0..1 through the current swing; 0.5 = rope at the pet's feet. */
  private phase = 0.15;
  private jumpedThisSwing = false;
  private airborneUntil = 0;
  private petBaseY = PET_GROUND_Y;
  private reactingUntil = 0;

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
    this.phase = 0.12;
    this.jumpedThisSwing = false;
    this.airborneUntil = 0;
    this.reactingUntil = 0;

    const cx = this.cameras.main.width / 2;
    const viewW = this.cameras.main.width;
    const viewH = this.cameras.main.height;
    this.cameras.main.setBackgroundColor('#2a2440');

    // Cozy arcade playroom
    this.add.rectangle(cx, 90, viewW, 180, 0x3d3560);
    this.add.rectangle(cx, 280, viewW, 220, 0x352e55);
    this.add.rectangle(cx, viewH - 70, viewW, 160, 0x4a4370);
    this.add.rectangle(cx, PET_GROUND_Y + 18, viewW, 6, 0x1a1a2e);
    for (let i = 0; i < 8; i++) {
      this.add.rectangle(50 + i * 100, 70, 40, 8, 0x5d5490);
    }

    // Soft jump-window cue on the ground (brightens in-window).
    this.windowCue = this.add
      .image(PET_X, PET_GROUND_Y + 8, 'jump-window-indicator')
      .setScale(2.4)
      .setAlpha(0.2)
      .setDepth(4);

    this.rope = this.add
      .image(ROPE_PIVOT.x, ROPE_PIVOT.y, 'rope')
      .setOrigin(0.5, 0)
      .setScale(2.6, ROPE_LENGTH / 72)
      .setDepth(9);
    this.placeRope(this.phase);

    this.petBaseY = PET_GROUND_Y;
    this.petSprite = this.add
      .sprite(PET_X, this.petBaseY, petTextureKey(State.data.petSpecies, 'idle1'))
      .setScale(2.3)
      .setDepth(10);
    this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));

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
      .text(cx, viewH - 28, `Click / Space / tap when the rope swings low · ${SKIP_ROPE_TARGET} in a row!`, {
        ...FONT,
        fontSize: '12px',
        color: '#c8c8dc',
      })
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
  }

  private refreshHud() {
    this.countText.setText(`Jumps: ${this.jumps} / ${SKIP_ROPE_TARGET}`);
    this.bestText.setText(`Best: ${State.data.bestSkipRope || 0}`);
  }

  /** Map phase → rope angle. 0 = up-back, 0.5 = at feet, 1 = up-front. */
  private placeRope(phase: number) {
    const t = Phaser.Math.Clamp(phase, 0, 1);
    const angle = Phaser.Math.Linear(-110, 110, t);
    this.rope.setAngle(angle);
    this.rope.setPosition(ROPE_PIVOT.x, ROPE_PIVOT.y);
  }

  private inJumpWindow(): boolean {
    return Math.abs(this.phase - 0.5) <= WINDOW_HALF;
  }

  private tryJump() {
    if (this.mode !== 'playing') return;
    if (this.time.now < this.airborneUntil) return; // already mid-jump
    if (this.jumpedThisSwing) return; // already resolved (jumped or missed) this swing

    if (!this.inJumpWindow()) {
      this.miss(this.phase < 0.5 ? 'Too early!' : 'Too late!');
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
      this.win();
    }
  }

  private miss(reason: string) {
    if (this.mode !== 'playing') return;
    this.mode = 'reacting';
    this.reactingUntil = this.time.now + 650;
    this.jumps = 0;
    this.periodMs = PERIOD_START;
    this.jumpedThisSwing = true; // don't also miss again this swing
    this.refreshHud();
    this.flashFeedback(reason, '#ff6b6b');

    this.tweens.killTweensOf(this.petSprite);
    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'sad'));
    this.petSprite.y = this.petBaseY;
    // Little stumble
    this.tweens.add({
      targets: this.petSprite,
      x: PET_X + 10,
      angle: { from: -8, to: 0 },
      duration: 280,
      yoyo: true,
      onComplete: () => {
        this.petSprite.x = PET_X;
        this.petSprite.angle = 0;
      },
    });
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

  private win() {
    this.mode = 'won';
    State.rewardSkipRopeWin();
    State.recordSkipRope(this.jumps);
    this.refreshHud();

    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'happy'));
    toast(this, this.cameras.main.width / 2, 150, `+${SKIP_ROPE_WIN_COINS} coins!`, '#a8e6cf');
    this.time.delayedCall(400, () => this.showWinPanel());
  }

  private showWinPanel() {
    this.mode = 'done';
    this.backBtn.setVisible(false);
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;
    this.add
      .rectangle(cx, cy, 460, 236, 0x2a2440, 0.97)
      .setStrokeStyle(3, 0xffb3d1)
      .setDepth(1600)
      .setInteractive();
    this.add
      .text(cx, cy - 68, 'Skip Rope cleared!', { ...FONT, fontSize: '22px', color: '#ffe066' })
      .setOrigin(0.5)
      .setDepth(1601);
    this.add
      .text(
        cx,
        cy - 22,
        `${SKIP_ROPE_TARGET} jumps · +${SKIP_ROPE_WIN_COINS} coins · +${SKIP_ROPE_WIN_HAPPINESS} happy`,
        { ...FONT, fontSize: '15px' },
      )
      .setOrigin(0.5)
      .setDepth(1601);
    this.add
      .text(cx, cy + 10, `Best: ${State.data.bestSkipRope}`, { ...FONT, color: '#c8c8dc' })
      .setOrigin(0.5)
      .setDepth(1601);

    const again = this.add
      .text(cx - 120, cy + 68, '[ Play again ]', {
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
      .text(cx + 135, cy + 68, '[ Back to town ]', {
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
    if (this.mode === 'done') {
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

    if (this.mode === 'done' || this.mode === 'won') return;

    if (this.mode === 'reacting') {
      if (this.time.now >= this.reactingUntil) {
        this.mode = 'playing';
        if (this.petSprite.active) {
          this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
        }
      }
      // Rope keeps swinging during the whimper so rhythm stays readable.
    }

    if (Phaser.Input.Keyboard.JustDown(this.keySpace) && this.mode === 'playing') {
      this.tryJump();
    }

    // Advance rope phase
    const prevPhase = this.phase;
    this.phase += deltaMs / this.periodMs;
    if (this.phase >= 1) {
      this.phase -= 1;
      this.jumpedThisSwing = false;
    }

    // Miss if the window closes without a jump this swing
    const windowEnd = 0.5 + WINDOW_HALF;
    if (
      this.mode === 'playing' &&
      !this.jumpedThisSwing &&
      prevPhase < windowEnd &&
      this.phase >= windowEnd
    ) {
      this.miss('Missed!');
    }

    this.placeRope(this.phase);

    // Cue brightness while the window is open
    const inWin = this.inJumpWindow();
    this.windowCue.setAlpha(inWin ? 0.85 : 0.18);
    this.windowCue.setTint(inWin ? 0xa8e6cf : 0xffffff);
  }
}
