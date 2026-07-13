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
import { attachCameraZoom, markAsUi, type CameraZoom } from '../systems/cameraZoom';
import { petAnimKey, petTextureKey } from '../systems/pets';
import { MINITEEN, miniteenTexPrefix } from '../systems/miniteen';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };

const PET_GROUND_Y = 430;
/** Height of the rope arc above its lowest point (the pet's feet). */
const ROPE_SPAN = 155;
/** Horizontal distance from pet to each rope-holder NPC. */
const HANDLE_DX = 170;

/** Starting swing period (ms) — a gentle warm-up that speeds up with the streak. */
const PERIOD_START = 2600;
const PERIOD_MIN = 620;
/** Phase where the rope hits the ground / pet's feet. */
const GROUND_PHASE = 0.5;
/**
 * Jump before this phase is too early: short abort hop, then fail when the rope arrives.
 * After this, jump freely — clear if still airborne when the rope passes.
 */
const TOO_EARLY_PHASE = 0.28;
/** Fixed jump height (px above ground). */
const JUMP_HEIGHT = 52;
/** Total time airborne for a normal jump (ms). */
const JUMP_AIR_MS = 340;
/** Must be grounded at least this long before another jump. */
const GROUND_RECOVER_MS = 70;

type Mode = 'ready' | 'playing' | 'won' | 'failed' | 'done';

/** Hold on "Get ready…" before the rope starts turning. */
const READY_MS = 1500;

/** NPC texture prefixes for rope holders and bleacher audience. */
const NPC_PREFIXES = [
  'bong',
  'cinna',
  ...MINITEEN.map((d) => miniteenTexPrefix(d.id)),
];

/** Vertical radius of each holder's hand orbit (matches the rope ends). */
const HAND_ORBIT_Y = 28;
/** Slight in/out sway so hands read as turning with the rope. */
const HAND_ORBIT_X = 10;
/** Pull rope ends inward toward the pet so they meet each holder's inner hand. */
const HAND_INSET = 22;
/** How far past the holders the watching crowd stands. */
const AUDIENCE_GAP = 115;

type RopeHolder = {
  sprite: Phaser.GameObjects.Sprite;
  prefix: string;
  side: 'left' | 'right';
  baseX: number;
  baseY: number;
  hopTween: Phaser.Tweens.Tween | null;
};

type AudienceMember = {
  sprite: Phaser.GameObjects.Sprite;
  prefix: string;
  baseY: number;
};

/**
 * Skip Rope — tap / click / Space to jump a fixed height. Clear by being
 * airborne when the rope sweeps underfoot. Jump too early and the hop is
 * cut short — the rope catches you on the pass. One miss ends the run;
 * 25 in a row wins.
 */
export class SkipRopeScene extends Phaser.Scene {
  private mode: Mode = 'playing';
  private backBtn!: Phaser.GameObjects.Text;
  private cameraZoom!: CameraZoom;
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
  /** This swing already cleared or failed. */
  private resolvedThisSwing = true;
  private petBaseY = PET_GROUND_Y;
  /** Rope stays frozen until this time (after the get-ready beat). */
  private ropeStartsAt = 0;

  private airborne = false;
  private groundedSince = 0;
  /** Jumped before TOO_EARLY_PHASE — hop aborted; fail when the rope arrives. */
  private pendingEarlyFail = false;

  /** One randomised villager on each end, turning the rope (no posts). */
  private holders: RopeHolder[] = [];
  /** Extra villagers watching from farther out on the sides. */
  private audience: AudienceMember[] = [];
  private handleCenterY = 0;

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
    // Parked just past ground — first live pass gets a full turn of lead-in.
    this.phase = 0.62;
    this.resolvedThisSwing = true;
    this.airborne = false;
    this.groundedSince = 0;
    this.pendingEarlyFail = false;
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

    // The rope's lowest point sits exactly at the bottom of the pet, marked
    // by the ground line so the jump moment is easy to read.
    this.ropeBottomY = Math.round(this.petBaseY + this.petSprite.displayHeight / 2);
    this.ropeTopY = this.ropeBottomY - ROPE_SPAN;
    this.handleCenterY = (this.ropeTopY + this.ropeBottomY) / 2;
    this.add.rectangle(cx, this.ropeBottomY + 2, viewW, 4, 0x1a1a2e).setDepth(1);

    // One NPC left + one right hold/turn the rope (no wooden posts).
    // Extra audience stands farther out on the sides.
    this.spawnRopeHolders();
    this.spawnAudience();

    // The rope itself is redrawn each frame (see drawRope).
    this.ropeGfx = this.add.graphics();
    this.drawRope();

    const title = this.add
      .text(140, 16, 'SKIP ROPE', { ...FONT, fontSize: '18px', color: '#ffe066' })
      .setScrollFactor(0);
    this.countText = this.add
      .text(20, 44, `Jumps: 0 / ${SKIP_ROPE_TARGET}`, {
        ...FONT,
        fontSize: '16px',
        color: '#a8e6cf',
      })
      .setScrollFactor(0);
    this.bestText = this.add
      .text(viewW - 52, 16, `Best: ${State.data.bestSkipRope || 0}`, { ...FONT, color: '#c8c8dc' })
      .setOrigin(1, 0)
      .setScrollFactor(0);
    this.feedbackText = this.add
      .text(cx, 110, '', { ...FONT, fontSize: '20px', color: '#ffe066' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30);
    const hint =
      `Click / Space / tap to jump · be off the ground when the rope passes · ${SKIP_ROPE_TARGET} wins!`;
    this.hintText = this.add
      .text(cx, viewH - 28, hint, {
        ...FONT,
        fontSize: '12px',
        color: '#c8c8dc',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

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
      .setScrollFactor(0)
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    this.backBtn.on('pointerdown', () => {
      this.ignoreClicksUntil = this.time.now + 150;
      this.requestLeave();
    });
    markAsUi(
      this,
      title,
      this.countText,
      this.bestText,
      this.feedbackText,
      this.hintText,
      this.backBtn,
    );

    this.cameraZoom = attachCameraZoom(this, {
      kind: 'game',
      isBlocked: () => this.menuOpen || isUiBlocked(),
      onPinchStart: () => {
        this.ignoreClicksUntil = this.time.now + 200;
      },
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.menuOpen || this.time.now < this.ignoreClicksUntil || isUiBlocked()) return;
      if (p.button !== 0) return;
      if (this.cameraZoom.ownsPointer(p) || this.cameraZoom.isPinching()) return;
      if (this.mode === 'playing') this.tryJump();
    });

    this.ropeStartsAt = this.time.now + READY_MS;
    this.feedbackText.setText('Get ready…').setColor('#c8c8dc').setAlpha(1);
    this.hintText.setText('Get ready…');
    this.time.delayedCall(READY_MS, () => {
      if (this.mode !== 'ready') return;
      this.mode = 'playing';
      // Drop any Space press held through the ready beat.
      Phaser.Input.Keyboard.JustDown(this.keySpace);
      this.feedbackText.setAlpha(0);
      this.hintText.setText(hint);
      this.flashFeedback('Go!', '#a8e6cf');
    });
  }

  private refreshHud() {
    this.countText.setText(`Jumps: ${this.jumps} / ${SKIP_ROPE_TARGET}`);
    this.bestText.setText(`Best: ${State.data.bestSkipRope || 0}`);
  }

  /**
   * Exactly two villagers: one on the left end of the rope, one on the right.
   * Rope ends attach to their hands — no support posts.
   */
  private spawnRopeHolders() {
    this.clearHolders();
    const available = NPC_PREFIXES.filter(
      (prefix) => this.textures.exists(`${prefix}-idle`) && this.textures.exists(`${prefix}-happy`),
    );
    if (available.length === 0) return;

    Phaser.Utils.Array.Shuffle(available);
    const picks = available.slice(0, Math.min(2, available.length));
    while (picks.length < 2 && available.length > 0) picks.push(available[0]!);

    const sides: Array<'left' | 'right'> = ['left', 'right'];
    for (let i = 0; i < 2; i++) {
      const side = sides[i]!;
      const prefix = picks[i]!;
      const baseX = this.petX + (side === 'left' ? -HANDLE_DX : HANDLE_DX);
      const baseY = this.ropeBottomY - 8;
      const sprite = this.add
        .sprite(baseX, baseY, `${prefix}-idle`)
        .setScale(prefix === 'cinna' ? 1.45 : 1.7)
        .setFlipX(side === 'right')
        .setOrigin(0.5, 1)
        .setDepth(7);
      const bounce = `${prefix}-bounce`;
      if (this.anims.exists(bounce)) sprite.play(bounce);

      this.holders.push({
        sprite,
        prefix,
        side,
        baseX,
        baseY,
        hopTween: null,
      });
    }
  }

  private clearHolders() {
    for (const h of this.holders) {
      h.hopTween?.stop();
      h.sprite.destroy();
    }
    this.holders = [];
  }

  /**
   * 2–4 watchers farther out on the left/right sides (beyond the holders).
   * Prefers NPCs not already turning the rope.
   */
  private spawnAudience() {
    this.audience = [];
    const used = new Set(this.holders.map((h) => h.prefix));
    let available = NPC_PREFIXES.filter(
      (prefix) =>
        !used.has(prefix) &&
        this.textures.exists(`${prefix}-idle`) &&
        this.textures.exists(`${prefix}-happy`),
    );
    if (available.length === 0) {
      available = NPC_PREFIXES.filter(
        (prefix) => this.textures.exists(`${prefix}-idle`) && this.textures.exists(`${prefix}-happy`),
      );
    }
    if (available.length === 0) return;

    Phaser.Utils.Array.Shuffle(available);
    const count = Phaser.Math.Clamp(Phaser.Math.Between(2, 4), 2, Math.min(4, available.length));
    // Farther from the rope than the holders — outer side bleachers.
    const slots: { x: number; y: number; flip: boolean; scale: number }[] = [
      {
        x: this.petX - HANDLE_DX - AUDIENCE_GAP,
        y: this.ropeBottomY - 6,
        flip: false,
        scale: 1.35,
      },
      {
        x: this.petX + HANDLE_DX + AUDIENCE_GAP,
        y: this.ropeBottomY - 6,
        flip: true,
        scale: 1.35,
      },
      {
        x: this.petX - HANDLE_DX - AUDIENCE_GAP - 42,
        y: this.ropeBottomY - 28,
        flip: false,
        scale: 1.15,
      },
      {
        x: this.petX + HANDLE_DX + AUDIENCE_GAP + 42,
        y: this.ropeBottomY - 26,
        flip: true,
        scale: 1.15,
      },
    ];

    for (let i = 0; i < count; i++) {
      const prefix = available[i]!;
      const slot = slots[i]!;
      const sprite = this.add
        .sprite(slot.x, slot.y, `${prefix}-idle`)
        .setScale(prefix === 'cinna' ? slot.scale * 0.9 : slot.scale)
        .setFlipX(slot.flip)
        .setOrigin(0.5, 1)
        .setDepth(4);
      const bounce = `${prefix}-bounce`;
      if (this.anims.exists(bounce)) sprite.play(bounce);
      this.audience.push({ sprite, prefix, baseY: slot.y });
    }
  }

  /** Hand positions for the current rope phase (ends of the turning rope). */
  private holderHandPos(side: 'left' | 'right'): { x: number; y: number } {
    const theta = (this.phase - 0.5) * Math.PI * 2;
    const sign = side === 'left' ? -1 : 1;
    const baseX = this.petX + sign * HANDLE_DX;
    const handY = this.handleCenterY + Math.cos(theta) * HAND_ORBIT_Y;
    // Inner hand (toward pet) + slight orbit so turning reads clearly.
    const handX = baseX - sign * HAND_INSET + Math.sin(theta) * HAND_ORBIT_X * sign;
    return { x: handX, y: handY };
  }

  /** Lean holders with the turn; rope ends follow their hands. */
  private syncRopeHolders() {
    for (const h of this.holders) {
      if (!h.hopTween) {
        const lean = Math.sin((this.phase - 0.5) * Math.PI * 2) * 5 * (h.side === 'left' ? 1 : -1);
        h.sprite.setAngle(lean);
      }
    }
  }

  private crowdCheer(big = false) {
    this.holdersCheer(big);
    this.audienceCheer(big);
  }

  private crowdBoo() {
    this.holdersBoo();
    this.audienceBoo();
  }

  private holdersCheer(big = false) {
    for (const h of this.holders) {
      h.hopTween?.stop();
      h.sprite.setAngle(0);
      const happy = `${h.prefix}-happy`;
      if (this.textures.exists(happy)) h.sprite.setTexture(happy);
      h.hopTween = this.tweens.add({
        targets: h.sprite,
        y: h.baseY - Phaser.Math.Between(big ? 12 : 8, big ? 18 : 14),
        duration: Phaser.Math.Between(160, 220),
        yoyo: true,
        repeat: big ? Phaser.Math.Between(2, 3) : Phaser.Math.Between(1, 2),
        ease: 'Sine.easeOut',
        onComplete: () => {
          h.sprite.setY(h.baseY);
          const bounce = `${h.prefix}-bounce`;
          if (this.anims.exists(bounce)) h.sprite.play(bounce);
          else if (this.textures.exists(`${h.prefix}-idle`)) {
            h.sprite.setTexture(`${h.prefix}-idle`);
          }
          h.hopTween = null;
        },
      });
    }
  }

  private holdersBoo() {
    for (const h of this.holders) {
      h.hopTween?.stop();
      h.sprite.setY(h.baseY);
      const sad = `${h.prefix}-sad`;
      if (this.textures.exists(sad)) h.sprite.setTexture(sad);
      h.hopTween = this.tweens.add({
        targets: h.sprite,
        angle: h.side === 'left' ? -10 : 10,
        duration: 280,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          h.sprite.setAngle(0);
          const bounce = `${h.prefix}-bounce`;
          if (this.anims.exists(bounce)) h.sprite.play(bounce);
          else if (this.textures.exists(`${h.prefix}-idle`)) {
            h.sprite.setTexture(`${h.prefix}-idle`);
          }
          h.hopTween = null;
        },
      });
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
   * shifts only a little with nearness. Ends attach to the two NPC hands.
   */
  private drawRope() {
    this.syncRopeHolders();

    const theta = (this.phase - 0.5) * Math.PI * 2;
    // +1 at the closest point of the turn (mid-descent in front),
    // -1 at the farthest (mid-rise behind), 0 at the top and bottom.
    const frontness = -Math.sin(theta);
    const inFront = frontness >= 0;
    const radius = (this.ropeBottomY - this.ropeTopY) / 2;
    const centerY = this.ropeTopY + radius;
    const bellyY = centerY + radius * Math.cos(theta);

    const leftHand = this.holderHandPos('left');
    const rightHand = this.holderHandPos('right');

    const g = this.ropeGfx;
    g.clear();
    g.setDepth(inFront ? 12 : 8);
    const x0 = leftHand.x;
    const x1 = rightHand.x;
    const handleY0 = leftHand.y;
    const handleY1 = rightHand.y;
    // Cubic curve: the bow bulges wider when the rope is near, pinches when far.
    const bowX = HANDLE_DX * 0.5 * (1 + 0.55 * frontness);
    const midHandleY = (handleY0 + handleY1) / 2;
    const ctrlY = (4 * bellyY - midHandleY) / 3;
    const curve = new Phaser.Curves.CubicBezier(
      new Phaser.Math.Vector2(x0, handleY0),
      new Phaser.Math.Vector2(this.petX - bowX, ctrlY),
      new Phaser.Math.Vector2(this.petX + bowX, ctrlY),
      new Phaser.Math.Vector2(x1, handleY1),
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

  private canStartJump(): boolean {
    if (this.mode !== 'playing') return false;
    if (this.airborne) return false;
    if (this.pendingEarlyFail) return false;
    if (this.time.now < this.groundedSince + GROUND_RECOVER_MS) return false;
    return true;
  }

  /** Fixed-height jump on click / tap / Space (keydown). */
  private tryJump() {
    if (!this.canStartJump()) return;

    if (this.phase < TOO_EARLY_PHASE) {
      this.pendingEarlyFail = true;
      this.playJump(true);
      return;
    }

    this.playJump(false);
  }

  /**
   * @param abortEarly - short hop that lands before the rope; fail on rope pass.
   */
  private playJump(abortEarly: boolean) {
    this.airborne = true;
    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'jump'));
    this.tweens.killTweensOf(this.petSprite);

    const height = abortEarly ? 20 : JUMP_HEIGHT;
    const airMs = abortEarly ? 180 : JUMP_AIR_MS;

    this.tweens.add({
      targets: this.petSprite,
      y: this.petBaseY - height,
      duration: airMs * 0.45,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (!this.petSprite.active) return;
        this.landFromJump();
        if (abortEarly) this.flashFeedback('Too early!', '#ffb3d1');
      },
    });
  }

  private landFromJump() {
    this.tweens.killTweensOf(this.petSprite);
    this.petSprite.y = this.petBaseY;
    this.airborne = false;
    this.groundedSince = this.time.now;
    if (
      (this.mode === 'playing' || this.mode === 'won') &&
      this.petSprite.active
    ) {
      this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
    }
  }

  private clearRopePass() {
    this.resolvedThisSwing = true;
    this.jumps += 1;
    this.periodMs = Phaser.Math.Linear(
      PERIOD_START,
      PERIOD_MIN,
      Phaser.Math.Clamp(this.jumps / SKIP_ROPE_TARGET, 0, 1),
    );
    State.recordSkipRope(this.jumps);
    this.refreshHud();
    this.flashFeedback('Nice!', '#a8e6cf');
    this.crowdCheer();

    if (this.jumps >= SKIP_ROPE_TARGET) {
      this.mode = 'won';
      this.backBtn.setVisible(false);
      this.time.delayedCall(JUMP_AIR_MS + 200, () => this.celebrateWin());
    }
  }

  /**
   * One miss ends the run: sad stumble (or rope snag), bank milestone rewards,
   * failed panel.
   */
  private fail(reason: string, snaggedByRope = false) {
    if (this.mode !== 'playing') return;
    this.mode = 'failed';
    this.resolvedThisSwing = true;
    this.pendingEarlyFail = false;
    this.airborne = false;
    this.backBtn.setVisible(false);
    const reward = State.rewardSkipRopeRun(this.jumps);
    this.flashFeedback(reason, '#ff6b6b');
    this.crowdBoo();

    this.tweens.killTweensOf(this.petSprite);
    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'sad'));
    this.petSprite.y = this.petBaseY;
    this.petSprite.x = this.petX;
    this.petSprite.angle = 0;

    if (snaggedByRope) {
      // Rope sweeps the ankles — yank forward, tip over, settle home.
      this.tweens.add({
        targets: this.petSprite,
        x: this.petX + 22,
        angle: 18,
        duration: 220,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: this.petSprite,
            x: this.petX,
            angle: 0,
            duration: 260,
            ease: 'Quad.easeInOut',
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
    this.crowdCheer(true);
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
    const panel = this.add
      .rectangle(cx, cy, 460, 250, 0x2a2440, 0.97)
      .setStrokeStyle(3, 0xffb3d1)
      .setScrollFactor(0)
      .setDepth(1600)
      .setInteractive();
    const title = this.add
      .text(cx, cy - 78, cleared ? 'Skip Rope cleared!' : 'Skip Rope failed!', {
        ...FONT,
        fontSize: '22px',
        color: cleared ? '#ffe066' : '#ff6b6b',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601);

    // A little portrait of the (proud or defeated) pet on the panel.
    const face = this.add
      .image(cx, cy - 36, petTextureKey(State.data.petSpecies, cleared ? 'happy' : 'sad'))
      .setScrollFactor(0)
      .setDepth(1601);
    face.setScale(Math.min(3, 52 / Math.max(face.width, face.height)));

    const rewardLine =
      reward.coins > 0 || reward.happiness > 0
        ? `${this.jumps} jumps · +${reward.coins} coins · +${reward.happiness} happy`
        : `${this.jumps} jumps — clear ${SKIP_ROPE_MILESTONE_JUMPS}+ for a reward`;
    const rewardText = this.add
      .text(cx, cy + 8, rewardLine, { ...FONT, fontSize: '15px' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601);
    const bestLine = this.add
      .text(cx, cy + 36, `Best: ${State.data.bestSkipRope}`, { ...FONT, color: '#c8c8dc' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601);

    const again = this.add
      .text(cx - 120, cy + 84, cleared ? '[ Play again ]' : '[ Try again ]', {
        ...FONT,
        fontSize: '18px',
        color: '#a8e6cf',
        padding: { x: 10, y: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
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
      .setScrollFactor(0)
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    leave.on('pointerdown', () => this.scene.start('Town', { spawn: 'skiprope' }));
    markAsUi(this, panel, title, face, rewardText, bestLine, again, leave);
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

    // Get-ready beat — rope stays still; drain Space latch so a press here
    // can't fire a jump when playing starts.
    if (this.mode === 'ready' || this.time.now < this.ropeStartsAt) {
      Phaser.Input.Keyboard.JustDown(this.keySpace);
      this.drawRope();
      return;
    }

    if (this.mode === 'playing' && Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this.tryJump();
    }

    // After the 25th clear, freeze the rope where it stopped.
    if (this.mode === 'won') {
      this.drawRope();
      return;
    }

    // Advance the rope while playing.
    const prevPhase = this.phase;
    const nextUnwrapped = prevPhase + deltaMs / this.periodMs;
    const groundCrossings =
      Math.floor(nextUnwrapped - GROUND_PHASE) - Math.floor(prevPhase - GROUND_PHASE);

    this.phase = nextUnwrapped;
    while (this.phase >= 1) {
      this.phase -= 1;
      this.resolvedThisSwing = false;
    }

    // Rope underfoot: clear if airborne; fail if grounded or aborted early.
    if (this.mode === 'playing' && groundCrossings > 0 && !this.resolvedThisSwing) {
      if (this.pendingEarlyFail || !this.airborne) {
        this.fail(this.pendingEarlyFail ? 'Caught!' : 'Missed!', true);
      } else {
        this.clearRopePass();
      }
    }

    this.drawRope();
  }
}
