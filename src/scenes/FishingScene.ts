import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { ITEMS, State } from '../systems/GameState';
import { Menu, toast } from '../systems/UI';
import { isUiBlocked } from '../systems/nav';
import { attachCameraZoom, markAsUi, type CameraZoom } from '../systems/cameraZoom';
import { petAnimKey, petTextureKey } from '../systems/pets';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };

/** Rod tip / bobber launch point (near the pet on the dock). */
const CAST_ORIGIN = { x: 228, y: 392 };
/** Drag saturates here — further pull doesn't add reach (aim line turns red). */
const MAX_DRAG = 220;
/** Below this pull length = tap → very short cast. */
const TAP_DRAG = 18;
const MIN_REACH = 48;
const MAX_REACH = 400;
/** Default fling when tapping / pressing Space (short cast into nearby water). */
const TAP_DIR = { x: 0.85, y: -0.35 };

type Mode =
  | 'ready'
  | 'casting'
  | 'waiting'
  | 'bite'
  | 'reeling'
  | 'retracting'
  | 'catch'
  | 'done'
  | 'settling';

type FishTier = 'oceanfish-common' | 'oceanfish-uncommon' | 'oceanfish-rare';

const FISH_TIERS: {
  id: FishTier;
  sizeMin: number;
  sizeMax: number;
  /** Base fight strength — bigger catches scale this further. */
  fight: number;
  label: string;
}[] = [
  { id: 'oceanfish-common', sizeMin: 12, sizeMax: 28, fight: 0.4, label: 'common' },
  { id: 'oceanfish-uncommon', sizeMin: 26, sizeMax: 48, fight: 0.7, label: 'uncommon' },
  { id: 'oceanfish-rare', sizeMin: 44, sizeMax: 78, fight: 1.0, label: 'rare' },
];

/**
 * Shore fishing minigame — slingshot cast → bite → reel tension.
 * Catch = food item only (no coins). Aim/drag mirrors PaperTossScene.
 */
export class FishingScene extends Phaser.Scene {
  private mode: Mode = 'ready';
  private backBtn!: Phaser.GameObjects.Text;
  private cameraZoom!: CameraZoom;
  private statusText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private petSprite!: Phaser.GameObjects.Sprite;
  private bobber!: Phaser.GameObjects.Image;
  private rod!: Phaser.GameObjects.Image;
  private biteBang!: Phaser.GameObjects.Text;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private lineGfx!: Phaser.GameObjects.Graphics;
  private tensionFill!: Phaser.GameObjects.Rectangle;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private patienceFill!: Phaser.GameObjects.Rectangle;
  private meterRoot!: Phaser.GameObjects.Container;
  private menuOpen = false;
  private ignoreClicksUntil = 0;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private holding = false;
  /** After hooking, ignore held input until the player releases once. */
  private reelArmed = false;
  private castPower = 0.2;
  private castDir = { x: TAP_DIR.x, y: TAP_DIR.y };
  private dragStart: { x: number; y: number } | null = null;
  private biteAt = 0;
  private biteDeadline = 0;
  private biteWindowMs = 900;
  private tension = 0;
  private progress = 0;
  private patience = 100;
  private fishFight = 0.7;
  private pendingFish: (typeof FISH_TIERS)[number] | null = null;
  private pendingSize = 0;
  private waterY = 310;
  private bobberHome = { x: 420, y: 360 };
  private reelPulse = 0;

  constructor() {
    super('Fishing');
  }

  create() {
    generateTextures(this);
    this.mode = 'ready';
    this.menuOpen = false;
    this.ignoreClicksUntil = 0;
    this.holding = false;
    this.reelArmed = false;
    this.dragStart = null;
    this.pendingFish = null;

    const cx = this.cameras.main.width / 2;
    const viewW = this.cameras.main.width;
    const viewH = this.cameras.main.height;
    this.cameras.main.setBackgroundColor('#1a3048');

    // Sky / water / dock bands
    this.add.rectangle(cx, 90, viewW, 180, 0x6eb5e0);
    this.add.rectangle(cx, 280, viewW, 220, 0x2e7ab8);
    this.add.rectangle(cx, 290, viewW, 8, 0x4599dc);
    this.add.rectangle(cx, viewH - 80, viewW, 200, 0xd4bc88);
    this.add.rectangle(cx, 470, 280, 70, 0x8d6e63).setStrokeStyle(3, 0x5d4037);

    for (let i = 0; i < 6; i++) {
      this.add
        .image(80 + i * 130, 250 + (i % 2) * 18, 'ripple')
        .setAlpha(0.35)
        .setScale(1.4)
        .setDepth(2);
    }

    this.rod = this.add.image(210, 430, 'rod').setScale(2.2).setDepth(12).setOrigin(0.2, 0.9);
    this.petSprite = this.add
      .sprite(168, 448, petTextureKey(State.data.petSpecies, 'idle1'))
      .setScale(2.1)
      .setDepth(11);
    this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));

    this.bobber = this.add.image(CAST_ORIGIN.x, CAST_ORIGIN.y, 'bobber').setScale(1.6).setDepth(15).setVisible(false);
    this.biteBang = this.add
      .text(0, 0, '!', { ...FONT, fontSize: '36px', color: '#ffe066', stroke: '#1a1a2e', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    this.aimGfx = this.add.graphics().setDepth(25);
    this.lineGfx = this.add.graphics().setDepth(14);

    this.buildMeters(cx);

    const title = this.add
      .text(140, 16, 'SHORE FISHING', { ...FONT, fontSize: '18px', color: '#ffe066' })
      .setScrollFactor(0);
    this.statusText = this.add.text(20, 44, '', FONT).setScrollFactor(0);
    this.bestText = this.add
      .text(viewW - 52, 16, `Best: ${State.data.biggestCatch || 0}cm`, { ...FONT, color: '#c8c8dc' })
      .setOrigin(1, 0)
      .setScrollFactor(0);
    this.hintText = this.add
      .text(cx, viewH - 28, 'Drag to aim cast · Tap = short cast · Farther = bigger fish', {
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
    this.meterRoot.setScrollFactor(0);
    markAsUi(
      this,
      title,
      this.statusText,
      this.bestText,
      this.hintText,
      this.backBtn,
      this.meterRoot,
    );

    this.cameraZoom = attachCameraZoom(this, {
      kind: 'game',
      isBlocked: () => this.menuOpen || isUiBlocked(),
      onPinchStart: () => {
        this.dragStart = null;
        this.holding = false;
        this.aimGfx.clear();
        this.ignoreClicksUntil = this.time.now + 200;
      },
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.menuOpen || this.time.now < this.ignoreClicksUntil || isUiBlocked()) return;
      if (this.cameraZoom.ownsPointer(p) || this.cameraZoom.isPinching()) return;
      if (this.mode === 'ready') {
        this.dragStart = { x: p.x, y: p.y };
      } else if (this.mode === 'waiting') {
        this.retract('Pulled the line back');
      } else if (this.mode === 'bite') {
        this.hook();
      } else if (this.mode === 'reeling' && this.reelArmed) {
        this.holding = true;
      }
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (this.menuOpen || isUiBlocked()) return;
      if (this.cameraZoom.isPinching()) {
        this.dragStart = null;
        this.holding = false;
        this.aimGfx.clear();
        return;
      }
      if (this.mode === 'ready' && this.dragStart) {
        const dx = this.dragStart.x - p.x;
        const dy = this.dragStart.y - p.y;
        this.dragStart = null;
        this.aimGfx.clear();
        this.applyCastFromDrag(dx, dy);
        this.cast();
      } else if (this.mode === 'reeling') {
        this.holding = false;
        // First release after hook arms the reel (blocks held-through spam).
        if (!this.reelArmed) this.reelArmed = true;
      }
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    this.setReady();
  }

  private buildMeters(cx: number) {
    this.meterRoot = this.add.container(cx, 70).setDepth(40).setVisible(false);
    const bg = this.add.rectangle(0, 0, 320, 78, 0x2a2440).setStrokeStyle(3, 0xffb3d1);
    const tLabel = this.add.text(-140, -28, 'Tension', { ...FONT, fontSize: '12px', color: '#c8c8dc' });
    const tTrack = this.add.rectangle(20, -20, 200, 12, 0x1a1a2e).setOrigin(0, 0.5);
    this.tensionFill = this.add.rectangle(20, -20, 2, 10, 0xff6b6b).setOrigin(0, 0.5);
    const pLabel = this.add.text(-140, -4, 'Reel', { ...FONT, fontSize: '12px', color: '#c8c8dc' });
    const pTrack = this.add.rectangle(20, 4, 200, 12, 0x1a1a2e).setOrigin(0, 0.5);
    this.progressFill = this.add.rectangle(20, 4, 2, 10, 0xa8e6cf).setOrigin(0, 0.5);
    const wLabel = this.add.text(-140, 20, 'Patience', { ...FONT, fontSize: '12px', color: '#c8c8dc' });
    const wTrack = this.add.rectangle(20, 28, 200, 12, 0x1a1a2e).setOrigin(0, 0.5);
    this.patienceFill = this.add.rectangle(20, 28, 200, 10, 0x74b9ff).setOrigin(0, 0.5);
    this.meterRoot.add([
      bg,
      tLabel,
      tTrack,
      this.tensionFill,
      pLabel,
      pTrack,
      this.progressFill,
      wLabel,
      wTrack,
      this.patienceFill,
    ]);
  }

  private setReady() {
    this.mode = 'ready';
    this.holding = false;
    this.reelArmed = false;
    this.dragStart = null;
    this.aimGfx.clear();
    this.lineGfx.clear();
    this.bobber.setVisible(false);
    this.biteBang.setVisible(false);
    this.meterRoot.setVisible(false);
    this.tweens.killTweensOf(this.rod);
    this.rod.setAngle(-18);
    this.statusText.setText('Ready to cast');
    this.hintText.setText('Drag opposite the cast · Tap / Space = short cast · Farther = rarer fish');
    this.bestText.setText(`Best: ${State.data.biggestCatch || 0}cm`);
  }

  /** Slingshot: pull back, fling the other way. Tiny pull = tap short cast. */
  private applyCastFromDrag(dx: number, dy: number) {
    const len = Math.hypot(dx, dy);
    if (len < TAP_DRAG) {
      this.castDir = { ...TAP_DIR };
      this.castPower = 0.12;
      return;
    }
    const c = this.clampDrag(dx, dy);
    const clen = Math.hypot(c.dx, c.dy);
    this.castDir = { x: c.dx / clen, y: c.dy / clen };
    this.castPower = clen / MAX_DRAG;
  }

  private clampDrag(dx: number, dy: number): { dx: number; dy: number; atMax: boolean } {
    const len = Math.hypot(dx, dy);
    if (len <= MAX_DRAG) return { dx, dy, atMax: false };
    const k = MAX_DRAG / len;
    return { dx: dx * k, dy: dy * k, atMax: true };
  }

  /** Predicted splash point for the current aim (clamped into water). */
  private predictLanding(dirX: number, dirY: number, power: number): { x: number; y: number; reach: number } {
    const reach = MIN_REACH + power * (MAX_REACH - MIN_REACH);
    let x = CAST_ORIGIN.x + dirX * reach;
    let y = CAST_ORIGIN.y + dirY * reach;
    // Prefer water band; nudge dock casts up into the sea.
    y = Phaser.Math.Clamp(y, 200, 370);
    x = Phaser.Math.Clamp(x, 90, 760);
    if (y > 350 && dirY > -0.1) y = 300 + power * 40;
    return { x, y, reach };
  }

  private drawAimPreview(dx: number, dy: number) {
    this.aimGfx.clear();
    const len = Math.hypot(dx, dy);
    let dirX = TAP_DIR.x;
    let dirY = TAP_DIR.y;
    let power = 0.12;
    let atMax = false;
    if (len >= TAP_DRAG) {
      const c = this.clampDrag(dx, dy);
      const clen = Math.hypot(c.dx, c.dy);
      dirX = c.dx / clen;
      dirY = c.dy / clen;
      power = clen / MAX_DRAG;
      atMax = c.atMax;
    }
    const land = this.predictLanding(dirX, dirY, power);
    const color = atMax ? 0xff6b6b : power < 0.25 ? 0xa8e6cf : power < 0.6 ? 0xffe066 : 0xffb3d1;

    // Pull-back guide (where you're dragging from)
    if (len >= TAP_DRAG) {
      const c = this.clampDrag(dx, dy);
      this.aimGfx.lineStyle(2, 0xffffff, 0.25);
      this.aimGfx.lineBetween(CAST_ORIGIN.x, CAST_ORIGIN.y, CAST_ORIGIN.x - c.dx * 0.35, CAST_ORIGIN.y - c.dy * 0.35);
    }

    // Cast prediction line + splash marker
    this.aimGfx.lineStyle(3, color, 0.9);
    this.aimGfx.lineBetween(CAST_ORIGIN.x, CAST_ORIGIN.y, land.x, land.y);
    this.aimGfx.fillStyle(color, 0.55);
    for (let t = 0.2; t < 1; t += 0.2) {
      this.aimGfx.fillCircle(
        Phaser.Math.Linear(CAST_ORIGIN.x, land.x, t),
        Phaser.Math.Linear(CAST_ORIGIN.y, land.y, t),
        3,
      );
    }
    this.aimGfx.lineStyle(2, color, 0.85);
    this.aimGfx.strokeCircle(land.x, land.y, 10 + power * 8);
  }

  private drawLineToBobber() {
    this.lineGfx.clear();
    if (!this.bobber.visible) return;
    const tip = this.rodTip();
    this.lineGfx.lineStyle(1.5, 0xe8f4ff, 0.75);
    this.lineGfx.lineBetween(tip.x, tip.y, this.bobber.x, this.bobber.y);
  }

  private rodTip(): { x: number; y: number } {
    // Approximate tip from rod origin + angle (origin near butt).
    const rad = Phaser.Math.DegToRad(this.rod.angle - 70);
    const len = 90;
    return {
      x: this.rod.x + Math.cos(rad) * len,
      y: this.rod.y + Math.sin(rad) * len,
    };
  }

  private cast() {
    if (this.mode !== 'ready') return;
    this.mode = 'casting';
    this.statusText.setText('Casting…');
    this.hintText.setText('');
    const land = this.predictLanding(this.castDir.x, this.castDir.y, this.castPower);
    this.bobberHome = { x: land.x, y: land.y };
    this.bobber.setPosition(CAST_ORIGIN.x, CAST_ORIGIN.y).setVisible(true).setAlpha(1).setScale(1.6);

    // Toss wind-up: pet hops, rod snaps forward.
    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'jump'));
    this.tweens.killTweensOf(this.rod);
    this.tweens.add({
      targets: this.rod,
      angle: -62,
      duration: 140,
      ease: 'Quad.easeOut',
      yoyo: true,
      hold: 40,
      onYoyo: () => {
        // Tip toward splash as the bobber leaves.
        this.rod.setAngle(-48);
      },
    });
    this.tweens.add({
      targets: this.petSprite,
      y: this.petSprite.y - 14,
      duration: 160,
      yoyo: true,
      ease: 'Quad.easeOut',
    });

    const flightMs = 280 + this.castPower * 320;
    this.tweens.add({
      targets: this.bobber,
      x: land.x,
      y: land.y,
      duration: flightMs,
      ease: 'Quad.easeOut',
      onUpdate: () => this.drawLineToBobber(),
      onComplete: () => {
        // Splash settle
        this.tweens.add({
          targets: this.bobber,
          scale: 1.9,
          duration: 80,
          yoyo: true,
          onComplete: () => {
            this.bobber.setScale(1.6);
            if (this.petSprite.active) {
              this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
            }
            this.beginWait();
          },
        });
        const splash = this.add.image(land.x, land.y, 'ripple').setDepth(13).setAlpha(0.7).setScale(0.8);
        this.tweens.add({
          targets: splash,
          alpha: 0,
          scale: 2.2,
          duration: 450,
          onComplete: () => splash.destroy(),
        });
      },
    });
  }

  private beginWait() {
    this.mode = 'waiting';
    this.statusText.setText('Waiting for a bite…');
    this.hintText.setText('Tap / Space to reel in the line · Watch for !');
    this.pendingFish = this.rollFish(this.castPower);
    this.pendingSize = Math.round(
      Phaser.Math.Between(this.pendingFish.sizeMin, this.pendingFish.sizeMax) *
        (0.9 + this.castPower * 0.25),
    );
    // Near/small = easy; far/big = harder — but always beatable with pumping.
    const sizeNorm = Phaser.Math.Clamp(this.pendingSize / 78, 0.12, 1);
    const distEase = 0.55 + this.castPower * 0.5; // short cast ~0.6, max ~1.05
    this.fishFight = Phaser.Math.Clamp(
      this.pendingFish.fight * (0.5 + sizeNorm * 0.55) * distEase,
      0.22,
      1.05,
    );
    this.biteWindowMs = Math.round(
      Phaser.Math.Clamp(1200 - this.pendingSize * 5 - this.fishFight * 80, 520, 1200),
    );
    const delay = Phaser.Math.Between(1400, 4200);
    this.biteAt = this.time.now + delay;
    this.rod.setAngle(-28);
    this.tweens.add({
      targets: this.bobber,
      y: this.bobberHome.y + 6,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * Farther casts bias toward uncommon/rare. Near shore is mostly common.
   */
  private rollFish(power: number): (typeof FISH_TIERS)[number] {
    let weights: [number, number, number];
    if (power < 0.22) weights = [86, 13, 1];
    else if (power < 0.45) weights = [60, 32, 8];
    else if (power < 0.7) weights = [32, 45, 23];
    else weights = [14, 38, 48];

    const total = weights[0] + weights[1] + weights[2];
    let roll = Math.random() * total;
    for (let i = 0; i < FISH_TIERS.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) return FISH_TIERS[i]!;
    }
    return FISH_TIERS[0]!;
  }

  private startBite() {
    this.mode = 'bite';
    this.tweens.killTweensOf(this.bobber);
    this.bobber.setPosition(this.bobberHome.x, this.bobberHome.y + 14);
    this.biteBang.setPosition(this.bobber.x, this.bobber.y - 36).setVisible(true);
    this.statusText.setText('A bite! Hook it!');
    this.hintText.setText('TAP / SPACE now!');
    this.biteDeadline = this.time.now + this.biteWindowMs;
    this.tweens.add({
      targets: this.rod,
      angle: -40,
      duration: 90,
      yoyo: true,
      repeat: 2,
    });
    this.tweens.add({
      targets: this.bobber,
      y: this.bobberHome.y + 22,
      duration: 110,
      yoyo: true,
      repeat: 4,
    });
  }

  private hook() {
    if (this.mode !== 'bite') return;
    this.biteBang.setVisible(false);
    this.tweens.killTweensOf(this.bobber);
    this.tweens.killTweensOf(this.rod);
    this.mode = 'reeling';
    this.tension = 8 + this.fishFight * 12;
    this.progress = 0;
    this.patience = 100;
    this.holding = false;
    // Must release then hold again — can't spam/hold through the bite into a free reel.
    this.reelArmed = !(this.keySpace.isDown || this.input.activePointer.isDown);
    this.meterRoot.setVisible(true);
    this.reelPulse = 0;
    this.statusText.setText(
      this.reelArmed
        ? 'Reeling — hold to pull, release before the red'
        : 'Release, then hold to reel',
    );
    this.hintText.setText('Hold = reel in · Red tension snaps · Near fish are easier');
    this.updateMeters();
    // Snap the rod into a fighting stance.
    this.tweens.add({
      targets: this.rod,
      angle: -50,
      duration: 160,
      ease: 'Back.easeOut',
    });
  }

  /** Pull the bobber back to the dock without a catch. */
  private retract(msg: string) {
    if (this.mode !== 'waiting' && this.mode !== 'bite') return;
    this.mode = 'retracting';
    this.holding = false;
    this.biteBang.setVisible(false);
    this.meterRoot.setVisible(false);
    this.tweens.killTweensOf(this.bobber);
    this.tweens.killTweensOf(this.rod);
    this.statusText.setText(msg);
    this.hintText.setText('');
    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'jump'));

    this.tweens.add({
      targets: this.rod,
      angle: -8,
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: this.bobber,
      x: CAST_ORIGIN.x,
      y: CAST_ORIGIN.y,
      scale: 1.2,
      duration: 320,
      ease: 'Quad.easeIn',
      onUpdate: () => this.drawLineToBobber(),
      onComplete: () => {
        this.lineGfx.clear();
        this.bobber.setVisible(false).setScale(1.6);
        toast(this, this.cameras.main.width / 2, 200, msg, '#8a8a9e');
        if (this.petSprite.active) {
          this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
        }
        this.time.delayedCall(280, () => this.setReady());
      },
    });
  }

  private missBite() {
    this.failCast('got away…', '#8a8a9e', 500);
  }

  private snapLine() {
    this.failCast('Line snapped!', '#ff6b6b', 600);
  }

  private fishEscaped() {
    this.failCast('Fish got tired of waiting…', '#8a8a9e', 600);
  }

  /** Brief non-interactive beat after a miss so toasts finish before re-cast. */
  private failCast(msg: string, color: string, delayMs: number) {
    this.mode = 'settling';
    this.holding = false;
    this.reelArmed = false;
    this.meterRoot.setVisible(false);
    this.lineGfx.clear();
    this.bobber.setVisible(false);
    this.biteBang.setVisible(false);
    this.tweens.killTweensOf(this.bobber);
    this.tweens.killTweensOf(this.rod);
    this.rod.setAngle(-18);
    toast(this, this.cameras.main.width / 2, 200, msg, color);
    this.statusText.setText(msg);
    this.time.delayedCall(delayMs, () => this.setReady());
  }

  private landFish() {
    const tier = this.pendingFish ?? FISH_TIERS[0]!;
    const size = this.pendingSize || Math.round(Phaser.Math.Between(tier.sizeMin, tier.sizeMax));
    this.pendingSize = size;
    this.mode = 'catch';
    this.holding = false;
    this.reelArmed = false;
    this.meterRoot.setVisible(false);
    this.lineGfx.clear();
    this.biteBang.setVisible(false);

    // Haul-in flourish: bobber flies to the dock.
    this.tweens.killTweensOf(this.bobber);
    this.tweens.add({
      targets: this.rod,
      angle: -12,
      duration: 280,
    });
    this.tweens.add({
      targets: this.bobber,
      x: CAST_ORIGIN.x + 40,
      y: CAST_ORIGIN.y - 10,
      duration: 380,
      ease: 'Back.easeIn',
      onUpdate: () => this.drawLineToBobber(),
      onComplete: () => {
        this.lineGfx.clear();
        this.bobber.setVisible(false);
      },
    });

    State.addItem(tier.id);
    const isBest = State.recordCatch(size);

    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'happy'));
    this.time.delayedCall(1100, () => {
      if (this.petSprite.active) this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
    });

    toast(this, this.cameras.main.width / 2, 160, isBest ? 'New best catch!' : 'Nice catch!', '#a8e6cf');
    this.time.delayedCall(420, () => this.showCatchCard(tier.id, size, isBest));
  }

  private showCatchCard(itemId: string, size: number, isBest: boolean) {
    this.mode = 'done';
    this.backBtn.setVisible(false);
    const def = ITEMS[itemId]!;
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;
    const panel = this.add
      .rectangle(cx, cy, 420, 260, 0x2a2440)
      .setStrokeStyle(3, 0xffb3d1)
      .setScrollFactor(0)
      .setDepth(1600);
    const heading = this.add
      .text(cx, cy - 90, 'You caught a fish!', { ...FONT, fontSize: '22px', color: '#ffe066' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601);
    const fishImg = this.add.image(cx, cy - 28, def.texture).setScale(3.2).setScrollFactor(0).setDepth(1601);
    const sizeLine = this.add
      .text(cx, cy + 36, `${def.name} — ${size}cm`, { ...FONT, fontSize: '16px' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601);
    const bestLine = this.add
      .text(
        cx,
        cy + 62,
        isBest ? `Personal best!  Best: ${State.data.biggestCatch}cm` : `Best: ${State.data.biggestCatch}cm`,
        {
          ...FONT,
          fontSize: '13px',
          color: '#c8c8dc',
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601);
    const tip = this.add
      .text(cx, cy + 88, 'Added to inventory — feed your pet!', {
        ...FONT,
        fontSize: '12px',
        color: '#a8e6cf',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601);

    const again = this.add
      .text(cx - 110, cy + 118, '[ Cast again ]', {
        ...FONT,
        fontSize: '16px',
        color: '#a8e6cf',
        padding: { x: 8, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    again.on('pointerdown', () => this.scene.restart());
    const leave = this.add
      .text(cx + 120, cy + 118, '[ Back to shore ]', {
        ...FONT,
        fontSize: '16px',
        color: '#ffb3d1',
        padding: { x: 8, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    leave.on('pointerdown', () => this.scene.start('Shore', { spawn: 'fishing' }));
    markAsUi(this, panel, heading, fishImg, sizeLine, bestLine, tip, again, leave);
  }

  private updateMeters() {
    this.tensionFill.width = Math.max(2, (this.tension / 100) * 200);
    this.tensionFill.fillColor = this.tension > 75 ? 0xff6b6b : this.tension > 45 ? 0xffe066 : 0xa8e6cf;
    this.progressFill.width = Math.max(2, (this.progress / 100) * 200);
    this.patienceFill.width = Math.max(2, (this.patience / 100) * 200);
  }

  private requestLeave() {
    if (this.mode === 'done' || this.mode === 'ready') {
      this.scene.start('Shore', { spawn: 'fishing' });
      return;
    }
    this.menuOpen = true;
    this.holding = false;
    this.dragStart = null;
    this.aimGfx.clear();
    const menu = new Menu(
      this,
      'Leave fishing?',
      [
        { label: 'Keep fishing', onSelect: () => undefined },
        {
          label: 'Back to shore',
          onSelect: () => this.scene.start('Shore', { spawn: 'fishing' }),
        },
      ],
      'This cast ends here — kept fish stay in your inventory',
    );
    menu.onClose = () => {
      this.menuOpen = false;
      this.ignoreClicksUntil = this.time.now + 250;
    };
  }

  update(_time: number, deltaMs: number) {
    if (isUiBlocked() || this.menuOpen) return;
    const dt = deltaMs / 1000;

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.requestLeave();
      return;
    }

    // Aim preview while dragging
    if (this.mode === 'ready' && this.dragStart) {
      const p = this.input.activePointer;
      this.drawAimPreview(this.dragStart.x - p.x, this.dragStart.y - p.y);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      if (this.mode === 'ready' && !this.dragStart) {
        this.castDir = { ...TAP_DIR };
        this.castPower = 0.12;
        this.cast();
      } else if (this.mode === 'waiting') {
        this.retract('Pulled the line back');
      } else if (this.mode === 'bite') {
        this.hook();
      }
    }

    if (this.mode === 'reeling') {
      const wantHold = this.keySpace.isDown || this.input.activePointer.isDown;
      if (!this.reelArmed) {
        // Arm once everything is released after the hook.
        if (!wantHold) this.reelArmed = true;
        this.holding = false;
        this.statusText.setText('Release, then hold to reel');
      } else {
        this.holding = wantHold;
      }
    }

    if (this.mode === 'waiting' && this.time.now >= this.biteAt) {
      this.startBite();
    } else if (this.mode === 'bite' && this.time.now >= this.biteDeadline) {
      this.missBite();
    } else if (this.mode === 'reeling') {
      const fight = this.fishFight;
      // Near/small fish: hold-through is enough. Far/big: pump the line.
      const fightPulse = (0.5 + Math.sin(this.time.now / 280) * 0.5) * fight;
      if (this.holding) {
        const reelRate = 48 - fight * 16; // ~44 easy → ~31 hard
        this.progress += Math.max(22, reelRate) * dt * (1.12 - this.tension / 320);
        // Easy fish climb slowly enough to land on a continuous hold.
        this.tension += (10 + fight * 36 + fightPulse * 14) * dt;
        this.reelPulse += dt * 14;
        this.rod.setAngle(-48 - Math.sin(this.reelPulse) * 7);
      } else {
        this.tension = Math.max(0, this.tension - (55 - fight * 12) * dt);
        this.progress += Math.max(2, 8 - fight * 4) * dt;
        this.rod.setAngle(-42 - Math.sin(this.time.now / 400) * 2);
      }
      // Patience always outlasts a competent reel; hard fish are tighter.
      this.patience -= (3 + fight * 4.5) * dt;
      this.tension = Phaser.Math.Clamp(this.tension, 0, 100);
      this.progress = Phaser.Math.Clamp(this.progress, 0, 100);
      this.updateMeters();

      // Bobber fights toward deeper water while being hauled shoreward.
      const haul = this.progress / 100;
      const baseX = Phaser.Math.Linear(this.bobberHome.x, CAST_ORIGIN.x + 80, haul * 0.55);
      const baseY = Phaser.Math.Linear(this.bobberHome.y, CAST_ORIGIN.y + 20, haul * 0.35);
      const thrash = 5 + this.tension / 16 + fight * 4;
      this.bobber.x = baseX + Math.sin(this.time.now / 80) * thrash;
      this.bobber.y = baseY + 8 + Math.cos(this.time.now / 65) * (3 + fight * 2);
      this.drawLineToBobber();

      if (this.tension >= 100) this.snapLine();
      else if (this.patience <= 0) this.fishEscaped();
      else if (this.progress >= 100) this.landFish();
    } else if (this.mode === 'waiting' || this.mode === 'bite' || this.mode === 'casting') {
      this.drawLineToBobber();
    }
  }
}
