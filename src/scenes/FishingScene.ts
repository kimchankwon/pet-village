import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { ITEMS, State } from '../systems/GameState';
import { FISHING_ENERGY_PER_CAST, tooTiredMessage } from '../systems/gameEnergy';
import { Menu, toast } from '../systems/UI';
import { isUiBlocked } from '../systems/nav';
import { bindGameActivity } from '../systems/multiplayerGameActivity';
import { attachCameraZoom, markAsUi, type CameraZoom } from '../systems/cameraZoom';
import { petAnimKey, petDrawScale, petTextureKey } from '../systems/pets';
import {
  FISHING_BAIT_ID,
  FISH_TIERS,
  fishingBaitCount,
  fishingBiteWindowMs,
  fishingFightStrength,
  hasFishingBait,
  rollFishSize,
  rollFishTier,
  type FishTier,
} from '../systems/fishingRules';
import {
  createKeepItInState,
  createSweepState,
  keepItInTuning,
  pickFishingMinigame,
  stepKeepItIn,
  stepSweep,
  sweepTuning,
  tapSweep,
  type FishingMinigameId,
  type KeepItInState,
  type KeepItInTuning,
  type SweepState,
  type SweepTuning,
} from '../systems/fishingMinigames';

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

/** Catch-bar track geometry for Keep It In. */
const TRACK_W = 46;
const TRACK_H = 264;
/** Dial radius for The Sweep. */
const DIAL_R = 84;

/**
 * Shore fishing minigame — slingshot cast → bite → one of two fights.
 *
 * Hooking a fish rolls either Keep It In (hold to lift a bar, keep the fish
 * inside it) or The Sweep (tap as a needle crosses a shrinking arc). Both scale
 * off the fish's size, and every size is simulated as catchable — see
 * `fishingMinigames.test.ts`. Casting farther is the only way to find big fish.
 *
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
  private keepRoot!: Phaser.GameObjects.Container;
  private keepBar!: Phaser.GameObjects.Rectangle;
  private keepFish!: Phaser.GameObjects.Image;
  private keepFill!: Phaser.GameObjects.Rectangle;
  private keepFlash!: Phaser.GameObjects.Rectangle;
  private sweepRoot!: Phaser.GameObjects.Container;
  private sweepGfx!: Phaser.GameObjects.Graphics;
  private sweepFish!: Phaser.GameObjects.Image;
  private sweepText!: Phaser.GameObjects.Text;
  private sweepWarn!: Phaser.GameObjects.Text;
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
  /** Drives the bobber thrash visuals only — the fight itself is size-driven. */
  private fishFight = 0.7;
  /** Which fight this hook-up rolled. */
  private minigame: FishingMinigameId = 'keepitin';
  private keepState: KeepItInState | null = null;
  private keepCfg: KeepItInTuning | null = null;
  private sweepState: SweepState | null = null;
  private sweepCfg: SweepTuning | null = null;
  private minigameHintShown = false;
  private pendingFish: FishTier | null = null;
  private pendingSize = 0;
  private bobberHome = { x: 420, y: 360 };
  private reelPulse = 0;

  constructor() {
    super('Fishing');
  }

  create() {
    bindGameActivity(this, 'Fishing');
    generateTextures(this);
    this.mode = 'ready';
    this.menuOpen = false;
    this.ignoreClicksUntil = 0;
    this.holding = false;
    this.reelArmed = false;
    this.minigameHintShown = false;
    this.keepState = null;
    this.sweepState = null;
    this.dragStart = null;
    this.pendingFish = null;

    const cx = this.cameras.main.width / 2;
    const viewW = this.cameras.main.width;
    const viewH = this.cameras.main.height;
    this.cameras.main.setBackgroundColor('#1a3048');

    // Sky / water / dock bands — winter icy shore
    this.add.rectangle(cx, 90, viewW, 180, 0x8ec4e8);
    this.add.rectangle(cx, 280, viewW, 220, 0x3a7aa8);
    this.add.rectangle(cx, 290, viewW, 8, 0x5a9dcb);
    this.add.rectangle(cx, viewH - 80, viewW, 200, 0xe6e0d4);
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
      .setScale(petDrawScale(this, State.data.petSpecies))
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

    this.buildKeepItInHud(viewW, viewH);
    this.buildSweepHud(cx, viewH);

    const title = this.add
      .text(140, 16, 'SHORE FISHING', { ...FONT, fontSize: '18px', color: '#ffe066' })
      .setScrollFactor(0);
    this.statusText = this.add
      .text(20, 44, '', { ...FONT, color: '#1a1a2e' })
      .setScrollFactor(0);
    this.bestText = this.add
      .text(
        viewW - 52,
        16,
        `Best: ${State.data.biggestCatch || 0}cm · Bait: ${fishingBaitCount(State.data.inventory)}`,
        { ...FONT, color: '#1a1a2e' },
      )
      .setOrigin(1, 0)
      .setScrollFactor(0);
    this.hintText = this.add
      .text(cx, viewH - 28, 'Drag to aim cast · Tap = short cast · Farther = bigger fish', {
        ...FONT,
        fontSize: '12px',
        color: '#1a1a2e',
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
    this.keepRoot.setScrollFactor(0);
    this.sweepRoot.setScrollFactor(0);
    markAsUi(
      this,
      title,
      this.statusText,
      this.bestText,
      this.hintText,
      this.backBtn,
      this.keepRoot,
      this.sweepRoot,
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
        // The Sweep scores the press itself; Keep It In only cares that it's held.
        if (this.minigame === 'sweep') this.sweepTap();
        else this.holding = true;
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

  /** Keep It In: a vertical track with the catch bar, plus the catch meter. */
  private buildKeepItInHud(viewW: number, viewH: number) {
    this.keepRoot = this.add.container(viewW - 96, viewH / 2).setDepth(40).setVisible(false);
    const track = this.add.rectangle(0, 0, TRACK_W, TRACK_H, 0x101a2c, 0.82).setStrokeStyle(3, 0xffb3d1);
    // Sits behind the bar so a dart reads as the whole lane lighting up.
    this.keepFlash = this.add.rectangle(0, 0, TRACK_W - 8, 26, 0xffe066, 0).setVisible(false);
    this.keepBar = this.add.rectangle(0, 0, TRACK_W - 8, 80, 0xa8e6cf, 0.3).setStrokeStyle(2, 0xa8e6cf);
    this.keepFish = this.add.image(0, 0, 'oceanfish-common').setScale(1.3);
    const meterTrack = this.add.rectangle(40, 0, 16, TRACK_H, 0x101a2c, 0.82).setStrokeStyle(2, 0xffb3d1);
    // Centre origin and an explicit y: setting `.height` alone would leave the
    // display origin stale and spill the fill out of its track.
    this.keepFill = this.add.rectangle(40, TRACK_H / 2, 10, 0, 0xa8e6cf);
    const label = this.add
      .text(0, -TRACK_H / 2 - 20, 'KEEP IT IN', { ...FONT, fontSize: '12px', color: '#ffe066' })
      .setOrigin(0.5);
    this.keepRoot.add([track, this.keepFlash, this.keepBar, this.keepFish, meterTrack, this.keepFill, label]);
  }

  /** The Sweep: a dial with a sweeping needle, hit pips and slack pips. */
  private buildSweepHud(cx: number, viewH: number) {
    this.sweepRoot = this.add.container(cx, viewH / 2 - 10).setDepth(40).setVisible(false);
    this.sweepGfx = this.add.graphics();
    this.sweepFish = this.add.image(0, 0, 'oceanfish-common').setScale(1.6);
    this.sweepText = this.add
      .text(0, -DIAL_R - 34, 'THE SWEEP', { ...FONT, fontSize: '12px', color: '#ffe066' })
      .setOrigin(0.5);
    // Stands in for the old slack pips: the stake is the same every strike.
    this.sweepWarn = this.add
      .text(0, DIAL_R + 20, 'ONE MISS AND IT’S GONE', {
        ...FONT,
        fontSize: '11px',
        color: '#ff6b6b',
      })
      .setOrigin(0.5);
    this.sweepRoot.add([this.sweepGfx, this.sweepFish, this.sweepText, this.sweepWarn]);
  }

  private hideMinigameHud() {
    this.keepRoot.setVisible(false);
    this.sweepRoot.setVisible(false);
  }

  private setReady() {
    this.mode = 'ready';
    this.holding = false;
    this.reelArmed = false;
    this.keepState = null;
    this.sweepState = null;
    this.dragStart = null;
    this.aimGfx.clear();
    this.lineGfx.clear();
    this.bobber.setVisible(false);
    this.biteBang.setVisible(false);
    this.hideMinigameHud();
    this.tweens.killTweensOf(this.rod);
    this.rod.setAngle(-18);
    const bait = fishingBaitCount(State.data.inventory);
    const rested = State.hasEnergy(FISHING_ENERGY_PER_CAST);
    this.statusText.setText(bait > 0 ? (rested ? 'Ready to cast' : 'Too tired to cast') : 'Out of bait');
    this.hintText.setText(
      bait <= 0
        ? 'Back to shore — Daniel sells bait for 3 coins'
        : rested
          ? `Each cast uses 1 bait and ${FISHING_ENERGY_PER_CAST} energy · Drag opposite the cast · Farther = bigger fish`
          : tooTiredMessage(State.data.petName, FISHING_ENERGY_PER_CAST),
    );
    this.bestText.setText(`Best: ${State.data.biggestCatch || 0}cm · Bait: ${bait}`);
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
    if (!State.hasEnergy(FISHING_ENERGY_PER_CAST)) {
      // Checked before the bait is spent, so being tired never costs a bait.
      this.statusText.setText('Too tired to cast');
      const message = tooTiredMessage(State.data.petName, FISHING_ENERGY_PER_CAST);
      this.hintText.setText(message);
      toast(this, this.cameras.main.width / 2, 200, message, '#ffb3d1');
      return;
    }
    if (!State.removeItem(FISHING_BAIT_ID)) {
      this.statusText.setText('Out of bait');
      this.hintText.setText('Back to shore — Daniel sells bait for 3 coins');
      toast(this, this.cameras.main.width / 2, 200, 'No bait left!', '#ffe066');
      return;
    }
    State.spendEnergy(FISHING_ENERGY_PER_CAST);
    this.mode = 'casting';
    const baitLeft = fishingBaitCount(State.data.inventory);
    this.statusText.setText(`Casting… · ${baitLeft} bait left`);
    this.bestText.setText(`Best: ${State.data.biggestCatch || 0}cm · Bait: ${baitLeft}`);
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
    // Distance is the whole story: it picks the tier and biases the size upward
    // inside it. A tap barely ever finds anything rare; a maxed cast usually does.
    this.pendingFish = rollFishTier(this.castPower);
    this.pendingSize = rollFishSize(this.pendingFish, this.castPower);
    this.fishFight = fishingFightStrength(
      this.pendingFish.fight,
      this.pendingSize,
      this.castPower,
    );
    this.biteWindowMs = fishingBiteWindowMs(this.pendingSize, this.fishFight);
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

  /**
   * Hooking always starts a fight now — a bite is never a decoy, so a tap on the
   * `!` is never wasted. Which of the two games you get is a coin flip, and the
   * fish's size sets how hard it is.
   */
  private hook() {
    if (this.mode !== 'bite') return;
    this.biteBang.setVisible(false);
    this.tweens.killTweensOf(this.bobber);
    this.tweens.killTweensOf(this.rod);

    this.mode = 'reeling';
    this.holding = false;
    this.reelPulse = 0;
    const size = this.pendingSize;
    this.minigame = pickFishingMinigame();
    const fishTexture = ITEMS[(this.pendingFish ?? FISH_TIERS[0]!).id]!.texture;

    if (this.minigame === 'keepitin') {
      this.keepCfg = keepItInTuning(size);
      this.keepState = createKeepItInState(this.keepCfg);
      this.sweepState = null;
      this.keepFish.setTexture(fishTexture);
      this.keepRoot.setVisible(true);
      this.sweepRoot.setVisible(false);
    } else {
      this.sweepCfg = sweepTuning(size);
      this.sweepState = createSweepState(this.sweepCfg);
      this.keepState = null;
      this.sweepFish.setTexture(fishTexture);
      this.sweepRoot.setVisible(true);
      this.keepRoot.setVisible(false);
    }

    // Must release once before the fight reads input — otherwise the tap that
    // set the hook would immediately count as the first reel or the first strike.
    this.reelArmed = !(this.keySpace.isDown || this.input.activePointer.isDown);
    this.statusText.setText(this.reelArmed ? this.minigameStatus() : 'Release, then play');
    if (!this.minigameHintShown) {
      this.hintText.setText(
        this.minigame === 'keepitin'
          ? 'Hold to lift the bar · Keep the fish inside it · The meter drains faster as it goes on'
          : 'Tap as the needle crosses the green · Each hit speeds it up · One miss and it is gone',
      );
      this.minigameHintShown = true;
    } else {
      this.hintText.setText(
        this.minigame === 'keepitin' ? 'Hold to lift · Keep it in' : 'Tap in the green · Miss once and it is gone',
      );
    }
    this.renderMinigame();
    // Snap the rod into a fighting stance.
    this.tweens.add({
      targets: this.rod,
      angle: -50,
      duration: 160,
      ease: 'Back.easeOut',
    });
  }

  private minigameStatus(): string {
    if (this.minigame === 'keepitin') {
      return this.keepState?.inZone ? 'On it — keep it in!' : 'Get the bar under it!';
    }
    const state = this.sweepState;
    if (!state || !this.sweepCfg) return 'Tap in the green';
    return `Strike ${state.hits + 1}/${this.sweepCfg.hitsNeeded}`;
  }

  /** Resolves one Sweep strike and reacts to the outcome. */
  private sweepTap() {
    const state = this.sweepState;
    const cfg = this.sweepCfg;
    // No outcome guard needed: both callers require mode 'reeling', which a
    // resolved fight has already left, and tapSweep no-ops once it's decided.
    if (this.mode !== 'reeling' || !state || !cfg) return;
    const result = tapSweep(state, cfg);
    if (result === 'miss') {
      // No "Missed!" toast any more — the miss *is* the loss, and fishEscaped
      // is about to say so. Two toasts at once just talked over each other.
      this.cameras.main.shake(180, 0.006);
    } else if (result === 'perfect') {
      toast(this, this.cameras.main.width / 2, 150, 'Perfect!', '#ffe066');
    }
    this.renderMinigame();
    if (state.outcome === 'caught') this.landFish();
    else if (state.outcome === 'escaped') this.fishEscaped();
  }

  /** Pull the bobber back to the dock without a catch. */
  private retract(msg: string) {
    if (this.mode !== 'waiting' && this.mode !== 'bite') return;
    this.mode = 'retracting';
    this.holding = false;
    this.biteBang.setVisible(false);
    this.hideMinigameHud();
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

  /** Only way to lose a bite outright: never tapping inside the window. */
  private missBite() {
    this.failCast('Too slow — it spat the hook…', '#8a8a9e', 500);
  }

  private fishEscaped() {
    this.failCast(
      this.minigame === 'keepitin' ? 'It slipped the line…' : 'It shook loose…',
      '#8a8a9e',
      600,
    );
  }

  /** Brief non-interactive beat after a miss so toasts finish before re-cast. */
  private failCast(msg: string, color: string, delayMs: number) {
    this.mode = 'settling';
    this.holding = false;
    this.reelArmed = false;
    this.hideMinigameHud();
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
    this.hideMinigameHud();
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
    const cheer = State.rewardFishingCatch(tier.id);

    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'happy'));
    this.time.delayedCall(1100, () => {
      if (this.petSprite.active) this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
    });

    toast(
      this,
      this.cameras.main.width / 2,
      160,
      `${isBest ? 'New best catch!' : 'Nice catch!'} +${cheer} happy`,
      '#a8e6cf',
    );
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

    const canCastAgain = hasFishingBait(State.data.inventory);
    const restedForNextCast = State.hasEnergy(FISHING_ENERGY_PER_CAST);
    // Out of bait and too tired both read the same way here: greyed, and the
    // label says which one it is rather than making the player guess.
    const againLabel = !canCastAgain
      ? '[ Out of bait ]'
      : restedForNextCast
        ? '[ Cast again ]'
        : '[ Too tired ]';
    const again = this.add
      .text(cx - 110, cy + 118, againLabel, {
        ...FONT,
        fontSize: '16px',
        color: canCastAgain && restedForNextCast ? '#a8e6cf' : '#8a8a9e',
        padding: { x: 8, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601);
    if (canCastAgain) {
      again.setInteractive({ useHandCursor: true });
      again.on('pointerdown', () => {
        if (!restedForNextCast) {
          toast(
            this,
            cx,
            cy - 130,
            tooTiredMessage(State.data.petName, FISHING_ENERGY_PER_CAST),
            '#ffb3d1',
          );
          return;
        }
        this.scene.restart();
      });
    }
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

  private renderMinigame() {
    if (this.minigame === 'keepitin') this.renderKeepItIn();
    else this.renderSweep();
  }

  /** Track runs bottom-up: position 0 is the floor, 1 is the surface. */
  private trackY(position: number): number {
    return TRACK_H / 2 - position * TRACK_H;
  }

  private renderKeepItIn() {
    const state = this.keepState;
    const cfg = this.keepCfg;
    if (!state || !cfg) return;

    this.keepBar.setSize(TRACK_W - 8, cfg.barHeight * TRACK_H);
    this.keepBar.y = this.trackY(state.barPos + cfg.barHeight / 2);
    this.keepBar.fillAlpha = state.inZone ? 0.42 : 0.16;
    this.keepFish.y = this.trackY(state.fishPos);

    // A dart is the fish's tell — flash the lane so it's readable, not random.
    if (state.darted) {
      this.keepFlash.y = this.keepFish.y;
      this.keepFlash.setVisible(true).setAlpha(0.55);
      this.tweens.killTweensOf(this.keepFlash);
      this.tweens.add({
        targets: this.keepFlash,
        alpha: 0,
        duration: 220,
        onComplete: () => this.keepFlash.setVisible(false),
      });
    }

    // Grows upward from the foot of the track.
    const fillPx = state.progress * TRACK_H;
    this.keepFill.setSize(10, fillPx);
    this.keepFill.y = TRACK_H / 2 - fillPx / 2;
    this.keepFill.fillColor =
      state.progress > 0.66 ? 0xa8e6cf : state.progress > 0.3 ? 0xffe066 : 0xff6b6b;
  }

  private renderSweep() {
    const state = this.sweepState;
    const cfg = this.sweepCfg;
    if (!state || !cfg) return;
    const g = this.sweepGfx;
    g.clear();

    // Dial base
    g.lineStyle(18, 0x101a2c, 0.85);
    g.beginPath();
    g.arc(0, 0, DIAL_R, 0, Math.PI * 2);
    g.strokePath();

    // Target arc, with the perfect core inside it
    const half = state.zoneWidth / 2;
    g.lineStyle(18, 0xa8e6cf, 0.95);
    g.beginPath();
    g.arc(0, 0, DIAL_R, state.zone - half, state.zone + half);
    g.strokePath();
    const core = half * cfg.perfectFraction;
    g.lineStyle(18, 0xffe066, 0.95);
    g.beginPath();
    g.arc(0, 0, DIAL_R, state.zone - core, state.zone + core);
    g.strokePath();

    // Rails
    g.lineStyle(2, 0xffb3d1, 0.7);
    g.beginPath();
    g.arc(0, 0, DIAL_R + 10, 0, Math.PI * 2);
    g.strokePath();
    g.beginPath();
    g.arc(0, 0, DIAL_R - 10, 0, Math.PI * 2);
    g.strokePath();

    // Needle
    const cos = Math.cos(state.angle);
    const sin = Math.sin(state.angle);
    g.lineStyle(4, 0xffffff, 1);
    g.lineBetween(cos * (DIAL_R - 15), sin * (DIAL_R - 15), cos * (DIAL_R + 14), sin * (DIAL_R + 14));

    // Strikes landed, along the top. There is no slack row any more — one miss
    // ends the fight, so the warning below the dial replaces it.
    for (let i = 0; i < cfg.hitsNeeded; i++) {
      const x = (i - (cfg.hitsNeeded - 1) / 2) * 16;
      g.fillStyle(i < state.hits ? 0xa8e6cf : 0x3a4a66, 1);
      g.fillRect(x - 5, -DIAL_R - 22, 10, 8);
    }

    this.sweepText.setText(`STRIKE ${Math.min(state.hits + 1, cfg.hitsNeeded)}/${cfg.hitsNeeded}`);
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
      'This cast ends here — its bait is already used; kept fish stay in your inventory',
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

    // Read once: JustDown clears the flag, so a second call this frame is false.
    const spaceJustDown = Phaser.Input.Keyboard.JustDown(this.keySpace);
    if (spaceJustDown) {
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
        this.statusText.setText(
          this.minigame === 'keepitin' ? 'Release, then hold to lift' : 'Release, then tap',
        );
      } else {
        this.holding = this.minigame === 'keepitin' && wantHold;
        if (this.minigame === 'sweep' && spaceJustDown) this.sweepTap();
      }
    }

    if (this.mode === 'waiting' && this.time.now >= this.biteAt) {
      this.startBite();
    } else if (this.mode === 'bite' && this.time.now >= this.biteDeadline) {
      this.missBite();
    } else if (this.mode === 'reeling') {
      const fight = this.fishFight;
      let haul = 0;
      let struggling = false;

      if (this.minigame === 'keepitin') {
        const state = this.keepState;
        const cfg = this.keepCfg;
        if (state && cfg) {
          // Only advance once armed, so the hook tap can't bank free progress.
          if (this.reelArmed) stepKeepItIn(state, cfg, dt, this.holding);
          this.renderKeepItIn();
          haul = state.progress;
          struggling = !state.inZone;
          if (this.reelArmed) this.statusText.setText(this.minigameStatus());
          if (state.outcome === 'caught') this.landFish();
          else if (state.outcome === 'escaped') this.fishEscaped();
        }
      } else {
        const state = this.sweepState;
        const cfg = this.sweepCfg;
        if (state && cfg) {
          if (this.reelArmed) stepSweep(state, cfg, dt);
          this.renderSweep();
          haul = state.hits / cfg.hitsNeeded;
          struggling = state.misses > 0;
          if (this.reelArmed) this.statusText.setText(this.minigameStatus());
          // Unlike Keep It In, nothing here decays on its own — without the idle
          // timeout a player who stops tapping would sit in the fight forever.
          if (state.outcome === 'escaped') this.fishEscaped();
        }
      }

      // The fight resolved this frame — the bobber has already been hidden.
      if (this.mode !== 'reeling') return;

      if (this.holding) {
        this.reelPulse += dt * 14;
        this.rod.setAngle(-48 - Math.sin(this.reelPulse) * 7);
      } else {
        this.rod.setAngle(-42 - Math.sin(this.time.now / 400) * 2);
      }

      // Bobber fights toward deeper water while being hauled shoreward.
      const baseX = Phaser.Math.Linear(this.bobberHome.x, CAST_ORIGIN.x + 80, haul * 0.55);
      const baseY = Phaser.Math.Linear(this.bobberHome.y, CAST_ORIGIN.y + 20, haul * 0.35);
      const thrashBoost = struggling ? 1.8 : 1;
      const thrash = (6 + fight * 6) * thrashBoost;
      this.bobber.x = baseX + Math.sin(this.time.now / (struggling ? 55 : 80)) * thrash;
      this.bobber.y = baseY + 8 + Math.cos(this.time.now / (struggling ? 48 : 65)) * (3 + fight * 2) * thrashBoost;
      this.drawLineToBobber();
    } else if (this.mode === 'waiting' || this.mode === 'bite' || this.mode === 'casting') {
      this.drawLineToBobber();
    }
  }
}
