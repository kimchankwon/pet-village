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
import { MINITEEN, miniteenTexPrefix } from '../systems/miniteen';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };

const PET_GROUND_Y = 430;
/** Height of the rope arc above its lowest point (the pet's feet). */
const ROPE_SPAN = 155;
/** Rope handle posts either side of the pet. */
const HANDLE_DX = 170;

/** Starting swing period (ms) — a gentle warm-up that speeds up with the streak. */
const PERIOD_START = 2600;
const PERIOD_MIN = 620;
/** Phase where the rope hits the ground / pet's feet. Jumping at or after this is too late. */
const GROUND_PHASE = 0.5;
/**
 * Valid jump window sits entirely before ground contact: [GROUND_PHASE - JUMP_LEAD, GROUND_PHASE).
 * Jump while the rope is still coming down; once it hits the ground it hits the pet's feet.
 */
const JUMP_LEAD = 0.14;
/** How long the pet stays airborne after a jump (ms). */
const JUMP_AIR_MS = 340;
const JUMP_HEIGHT = 52;

type Mode = 'ready' | 'playing' | 'won' | 'failed' | 'done';

/** Hold on "Get ready…" before the rope starts turning. */
const READY_MS = 1500;

/** NPC texture prefixes that can sit in the bleachers. */
const AUDIENCE_PREFIXES = [
  'bong',
  'cinna',
  ...MINITEEN.map((d) => miniteenTexPrefix(d.id)),
];

type AudienceMember = {
  sprite: Phaser.GameObjects.Sprite;
  prefix: string;
  baseY: number;
};

/**
 * Skip Rope — Tamagotchi V3-style rhythm timing.
 * The rope turns a full 360°: down the near side (drawn in front of the
 * pet, growing as it approaches), under the feet, then up the far side
 * (drawn behind, shrinking) — jump (click / Space / tap) just before it
 * hits the ground. Once the rope reaches the ground it hits the pet's
 * feet. One miss ends the run, banking coins + happiness per 5 cleared;
 * 25 in a row wins outright.
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
  /** The rope's lowest point — flush with the bottom of the pet sprite. */
  private ropeBottomY = PET_GROUND_Y;
  private ropeTopY = PET_GROUND_Y - ROPE_SPAN;
  private jumps = 0;
  private periodMs = PERIOD_START;
  /** 0..1 through the current turn; GROUND_PHASE (0.5) = rope hitting the pet's feet. */
  private phase = 0.62;
  private jumpedThisSwing = false;
  private airborneUntil = 0;
  private petBaseY = PET_GROUND_Y;
  /** Rope stays frozen until this time (after the get-ready beat). */
  private ropeStartsAt = 0;
  /** Early jump: pet leaps now, then gets snagged when the rope arrives. */
  private pendingRopeCatch = false;
  /** Randomised villagers watching from the bleachers. */
  private audience: AudienceMember[] = [];

  constructor() {
    super('SkipRope');
  }

  create() {
    generateTextures(this);
    this.mode = 'ready';
    this.menuOpen = false;
    this.ignoreClicksUntil = 0;
    this.jumps = 0;
    this.periodMs = PERIOD_START;
    // Parked just past the window — first live pass gets a full turn of lead-in.
    this.phase = 0.62;
    this.jumpedThisSwing = true;
    this.airborneUntil = 0;
    this.pendingRopeCatch = false;
    this.ropeStartsAt = 0;

    const cx = this.cameras.main.width / 2;
    const viewW = this.cameras.main.width;
    const viewH = this.cameras.main.height;
    this.cameras.main.setBackgroundColor('#2a2440');
    this.petX = cx;

    // Cozy arcade playroom
    this.add.rectangle(cx, 90, viewW, 180, 0x3d3560);
    this.add.rectangle(cx, 280, viewW, 220, 0x352e55);
    this.add.rectangle(cx, viewH - 70, viewW, 160, 0x4a4370);
    for (let i = 0; i < 8; i++) {
      this.add.rectangle(50 + i * 100, 70, 40, 8, 0x5d5490);
    }

    this.petBaseY = PET_GROUND_Y;
    this.petSprite = this.add
      .sprite(this.petX, this.petBaseY, petTextureKey(State.data.petSpecies, 'idle1'))
      .setScale(2.3)
      .setDepth(10);
    this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
    this.spawnAudience();

    // The rope's lowest point sits exactly at the bottom of the pet, marked
    // by the ground line so the jump moment is easy to read.
    this.ropeBottomY = Math.round(this.petBaseY + this.petSprite.displayHeight / 2);
    this.ropeTopY = this.ropeBottomY - ROPE_SPAN;
    this.add.rectangle(cx, this.ropeBottomY + 2, viewW, 4, 0x1a1a2e).setDepth(1);

    // Handle posts the rope turns between (knob on top).
    const handleY = (this.ropeTopY + this.ropeBottomY) / 2;
    const posts = this.add.graphics().setDepth(6);
    for (const px of [this.petX - HANDLE_DX, this.petX + HANDLE_DX]) {
      posts.fillStyle(0x5d4037, 1);
      posts.fillRect(px - 3, handleY, 6, this.ropeBottomY + 8 - handleY);
      posts.fillStyle(0xffe066, 1);
      posts.fillCircle(px, handleY, 6);
    }

    // The rope itself is redrawn each frame (see drawRope).
    this.ropeGfx = this.add.graphics();
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
        `Click / Space / tap just before the rope hits the ground · one miss ends the run · ${SKIP_ROPE_TARGET} wins!`,
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

    this.ropeStartsAt = this.time.now + READY_MS;
    this.feedbackText.setText('Get ready…').setColor('#c8c8dc').setAlpha(1);
    this.hintText.setText('Get ready…');
    this.time.delayedCall(READY_MS, () => {
      if (this.mode !== 'ready') return;
      this.mode = 'playing';
      this.feedbackText.setAlpha(0);
      this.hintText.setText(
        `Click / Space / tap just before the rope hits the ground · one miss ends the run · ${SKIP_ROPE_TARGET} wins!`,
      );
      this.flashFeedback('Go!', '#a8e6cf');
    });
  }

  private refreshHud() {
    this.countText.setText(`Jumps: ${this.jumps} / ${SKIP_ROPE_TARGET}`);
    this.bestText.setText(`Best: ${State.data.bestSkipRope || 0}`);
  }

  /**
   * Pick 2–4 randomised villagers (Bongbongee / Cinna / MINITEEN) to watch
   * from either side of the rope. Only prefixes with loaded textures are used.
   */
  private spawnAudience() {
    this.audience = [];
    const available = AUDIENCE_PREFIXES.filter(
      (prefix) => this.textures.exists(`${prefix}-idle`) && this.textures.exists(`${prefix}-happy`),
    );
    if (available.length === 0) return;

    Phaser.Utils.Array.Shuffle(available);
    const count = Phaser.Math.Clamp(Phaser.Math.Between(2, 4), 2, Math.min(4, available.length));
    const slots: { x: number; y: number; flip: boolean }[] = [
      { x: this.petX - HANDLE_DX - 70, y: this.petBaseY - 20, flip: false },
      { x: this.petX + HANDLE_DX + 70, y: this.petBaseY - 18, flip: true },
      { x: this.petX - HANDLE_DX - 40, y: this.petBaseY - 55, flip: false },
      { x: this.petX + HANDLE_DX + 40, y: this.petBaseY - 52, flip: true },
    ];

    for (let i = 0; i < count; i++) {
      const prefix = available[i]!;
      const slot = slots[i]!;
      const idleKey = `${prefix}-idle`;
      const sprite = this.add
        .sprite(slot.x, slot.y, idleKey)
        .setScale(prefix === 'cinna' ? 1.35 : 1.55)
        .setFlipX(slot.flip)
        .setDepth(5);
      const bounce = `${prefix}-bounce`;
      if (this.anims.exists(bounce)) sprite.play(bounce);
      this.audience.push({ sprite, prefix, baseY: slot.y });
    }
  }

  private audienceCheer(big = false) {
    for (const member of this.audience) {
      const { sprite, prefix, baseY } = member;
      if (!sprite.active) continue;
      this.tweens.killTweensOf(sprite);
      sprite.y = baseY;
      if (this.textures.exists(`${prefix}-happy`)) sprite.setTexture(`${prefix}-happy`);
      this.tweens.add({
        targets: sprite,
        y: baseY - (big ? 14 : 8),
        duration: big ? 160 : 120,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => {
          if (!sprite.active) return;
          sprite.y = baseY;
          const bounce = `${prefix}-bounce`;
          if (this.mode === 'playing' && this.anims.exists(bounce)) sprite.play(bounce);
          else if (this.textures.exists(`${prefix}-idle`)) sprite.setTexture(`${prefix}-idle`);
        },
      });
    }
  }

  private audienceBoo() {
    for (const member of this.audience) {
      const { sprite, prefix, baseY } = member;
      if (!sprite.active) continue;
      this.tweens.killTweensOf(sprite);
      sprite.y = baseY;
      sprite.stop();
      if (this.textures.exists(`${prefix}-sad`)) sprite.setTexture(`${prefix}-sad`);
      this.tweens.add({
        targets: sprite,
        angle: { from: -4, to: 4 },
        duration: 180,
        yoyo: true,
        repeat: 1,
        onComplete: () => {
          if (sprite.active) sprite.angle = 0;
        },
      });
    }
  }

  /**
   * Draw the rope for the current phase. The turn is a circle in the
   * depth/height plane: phase 0 = overhead, 0→0.5 coming down the NEAR side
   * (in front of the pet — this is the pass the pet jumps over), 0.5 = at
   * the pet's feet, 0.5→1 rising up the far side (behind the pet).
   * Depth is read mainly through size: the middle (closest to camera when
   * in front) grows thick, then shrinks when the rope is behind. Colour
   * shifts only a little with nearness.
   */
  private drawRope() {
    const theta = (this.phase - 0.5) * Math.PI * 2;
    // +1 at the closest point of the turn (mid-descent in front),
    // -1 at the farthest (mid-rise behind), 0 at the top and bottom.
    const frontness = -Math.sin(theta);
    const inFront = frontness >= 0;
    const radius = (this.ropeBottomY - this.ropeTopY) / 2;
    const centerY = this.ropeTopY + radius;
    const bellyY = centerY + radius * Math.cos(theta);
    const handleY = centerY;

    const g = this.ropeGfx;
    g.clear();
    g.setDepth(inFront ? 12 : 8);
    const x0 = this.petX - HANDLE_DX;
    const x1 = this.petX + HANDLE_DX;
    // Cubic curve: the bow bulges wider when the rope is near, pinches when far.
    const bowX = HANDLE_DX * 0.5 * (1 + 0.55 * frontness);
    const ctrlY = (4 * bellyY - handleY) / 3;
    const curve = new Phaser.Curves.CubicBezier(
      new Phaser.Math.Vector2(x0, handleY),
      new Phaser.Math.Vector2(this.petX - bowX, ctrlY),
      new Phaser.Math.Vector2(this.petX + bowX, ctrlY),
      new Phaser.Math.Vector2(x1, handleY),
    );

    // Segment-draw so the middle can read as closer (thick) / farther (thin).
    const segs = 36;
    const points = curve.getPoints(segs);
    const near = (frontness + 1) / 2; // 0 behind → 1 in front
    const endW = 2.8;
    const midW = Phaser.Math.Linear(1.4, 11, near);
    const dark = Phaser.Display.Color.IntegerToColor(0x5a4034);
    const light = Phaser.Display.Color.IntegerToColor(0xb08a72);
    const tint = Phaser.Display.Color.Interpolate.ColorWithColor(dark, light, 100, Math.round(near * 100));
    const color = Phaser.Display.Color.GetColor(tint.r, tint.g, tint.b);

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const t = (i + 0.5) / (points.length - 1);
      // Peak thickness at the belly (closest to camera when in front).
      const mid = 1 - Math.abs(t - 0.5) * 2;
      const midEmphasis = mid * mid;
      const width = Phaser.Math.Linear(endW, midW, midEmphasis);
      g.lineStyle(Math.max(1.2, width), color, 1);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.strokePath();
    }
  }

  private inJumpWindow(): boolean {
    return this.phase >= GROUND_PHASE - JUMP_LEAD && this.phase < GROUND_PHASE;
  }

  private tryJump() {
    if (this.mode !== 'playing') return;
    if (this.time.now < this.airborneUntil) return; // already mid-jump
    if (this.jumpedThisSwing) return; // already resolved this turn

    if (!this.inJumpWindow()) {
      if (this.phase < GROUND_PHASE) {
        // Jump early → land → rope catches the pet on the ground pass.
        this.startEarlyJump();
        return;
      }
      // Rope already hit the ground — that means it hit the pet's feet.
      this.fail('Too late!');
      return;
    }

    this.playJumpTween(false);
    this.jumps += 1;
    this.periodMs = Phaser.Math.Linear(
      PERIOD_START,
      PERIOD_MIN,
      Phaser.Math.Clamp(this.jumps / SKIP_ROPE_TARGET, 0, 1),
    );
    State.recordSkipRope(this.jumps);
    this.refreshHud();
    this.flashFeedback('Nice!', '#a8e6cf');
    this.audienceCheer();

    if (this.jumps >= SKIP_ROPE_TARGET) {
      // Keep the rope turning so the winning jump visibly clears it, then celebrate.
      this.mode = 'won';
      this.backBtn.setVisible(false);
      this.time.delayedCall(JUMP_AIR_MS + 200, () => this.celebrateWin());
    }
  }

  /** Leap before the window — same jump motion, then get snagged when the rope arrives. */
  private startEarlyJump() {
    this.pendingRopeCatch = true;
    this.playJumpTween(true);
  }

  private playJumpTween(earlyCatch: boolean) {
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
        if (!this.petSprite.active) return;
        this.petSprite.y = this.petBaseY;
        if (earlyCatch) {
          this.tryResolveRopeCatch();
          return;
        }
        if (this.mode === 'playing') {
          this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
        }
      },
    });
  }

  /**
   * After an early jump: once the pet is on the ground and the rope has
   * reached (or passed) the feet, snag them like a real mistimed skip.
   */
  private tryResolveRopeCatch() {
    if (!this.pendingRopeCatch || this.mode !== 'playing') return;
    if (this.time.now < this.airborneUntil) return;
    if (this.phase < GROUND_PHASE) {
      // Landed early — idle until the rope arrives.
      if (this.petSprite.active && !this.petSprite.anims.isPlaying) {
        this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
      }
      return;
    }
    this.pendingRopeCatch = false;
    this.fail('Caught!', true);
  }

  /**
   * One miss ends the run: sad stumble (or rope snag), bank milestone rewards,
   * failed panel.
   */
  private fail(reason: string, snaggedByRope = false) {
    if (this.mode !== 'playing') return;
    this.mode = 'failed';
    this.pendingRopeCatch = false;
    this.backBtn.setVisible(false);
    const reward = State.rewardSkipRopeRun(this.jumps);
    this.flashFeedback(reason, '#ff6b6b');
    this.audienceBoo();

    this.tweens.killTweensOf(this.petSprite);
    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'sad'));
    this.petSprite.y = this.petBaseY;
    this.petSprite.x = this.petX;
    this.petSprite.angle = 0;

    if (snaggedByRope) {
      // Rope sweeps the ankles — yank forward, tip over, settle.
      this.tweens.add({
        targets: this.petSprite,
        x: this.petX + 22,
        angle: 18,
        duration: 220,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: this.petSprite,
            x: this.petX + 8,
            angle: -6,
            duration: 200,
            ease: 'Quad.easeIn',
            yoyo: true,
            onComplete: () => {
              this.petSprite.x = this.petX;
              this.petSprite.angle = 0;
            },
          });
        },
      });
      this.time.delayedCall(900, () => this.showResultPanel(false, reward));
    } else {
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
    this.audienceCheer(true);
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
    if (this.mode !== 'playing' && this.mode !== 'ready') {
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

    // Get-ready beat — rope stays still until READY_MS elapses.
    if (this.mode === 'ready' || this.time.now < this.ropeStartsAt) {
      this.drawRope();
      return;
    }

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

    // Early jump: after landing, snag when the rope reaches the feet.
    if (this.mode === 'playing' && this.pendingRopeCatch) {
      this.tryResolveRopeCatch();
    }

    // Rope hitting the ground with no clear jump = it hit the pet's feet.
    if (
      this.mode === 'playing' &&
      !this.jumpedThisSwing &&
      !this.pendingRopeCatch &&
      prevPhase < GROUND_PHASE &&
      this.phase >= GROUND_PHASE
    ) {
      this.fail('Missed!');
    }

    this.drawRope();
  }
}
