import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { BUMP_ENERGY_COST, MIN_GAME_ENERGY, State, type BumpDifficulty } from '../systems/GameState';
import { Menu, toast } from '../systems/UI';
import { isUiBlocked } from '../systems/nav';
import { attachCameraZoom, markAsUi, type CameraZoom } from '../systems/cameraZoom';
import { petAnimKey, petTextureKey } from '../systems/pets';
import { MINITEEN, miniteenDrawScale, miniteenTexPrefix } from '../systems/miniteen';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };

/** Top surface of the platform — both fighters stand here. */
const PLATFORM_Y = 420;
/** Platform half-width; the topple point is just past each end. */
const PLATFORM_HALF = 250;
/** Where the loser lands after falling off. */
const FALL_FLOOR_Y = PLATFORM_Y + 120;
/** Contact-point travel at |tug| = 1 (win/lose). */
const TUG_TRAVEL = 165;
/** Fighters stand this far either side of the contact point. */
const CHAR_GAP = 38;

/** Tug marker travel on the bottom bar (px from centre). */
const BAR_TRAVEL = 160;

/** How hard each tap shoves; the mash meter adds up to this much again. */
const TAP_IMPULSE_BASE = 0.045;
const TAP_IMPULSE_MASH_BONUS = 0.02;
/** A full-meter tap's total shove — difficulty pressure is derived from it. */
const TAP_IMPULSE_FULL = TAP_IMPULSE_BASE + TAP_IMPULSE_MASH_BONUS;
/** Mash meter: gain per tap, drain per second (fills at ~4+ taps/sec). */
const MASH_GAIN = 0.3;
const MASH_DRAIN_PER_S = 0.9;

/** Pressing during the stare-down shoves YOU back this much. */
const FALSE_START_PENALTY = 0.08;

/**
 * Difficulty is a taps-per-second bar: pressure sits one tap/sec under the
 * target rate, so mashing at `taps` wins steadily, one below stalls, and
 * slower loses. Surges swing pressure ±30% around that.
 */
const DIFFICULTY: Record<BumpDifficulty, { label: string; taps: number; pressure: number }> = {
  easy: { label: 'Easy', taps: 4, pressure: TAP_IMPULSE_FULL * 3 },
  medium: { label: 'Medium', taps: 6, pressure: TAP_IMPULSE_FULL * 5 },
  hard: { label: 'Hard', taps: 8, pressure: TAP_IMPULSE_FULL * 7 },
};

/** NPC texture prefixes eligible to be the opponent. */
const NPC_PREFIXES = ['bong', 'cinna', ...MINITEEN.map((d) => miniteenTexPrefix(d.id))];

function npcDisplayName(prefix: string): string {
  if (prefix === 'bong') return 'Bongbongee';
  if (prefix === 'cinna') return 'Cinnamoroll';
  const def = MINITEEN.find((d) => miniteenTexPrefix(d.id) === prefix);
  return def?.name ?? 'A villager';
}

type Mode = 'pick' | 'ready' | 'wait' | 'push' | 'won' | 'lost' | 'done';

/**
 * Bump — sumo push-out. Pick a difficulty, square up against a random
 * villager, hold your nerve through the stare-down, then MASH tap / click /
 * Space to shove. The mash meter boosts each shove; the bottom bar shows
 * who's winning. Push the marker all the way right to topple the opponent
 * off the platform — get pushed to the left end and your pet falls instead.
 */
export class BumpScene extends Phaser.Scene {
  private mode: Mode = 'pick';
  private difficulty: BumpDifficulty = 'easy';
  private backBtn!: Phaser.GameObjects.Text;
  private cameraZoom!: CameraZoom;
  private menuOpen = false;
  private ignoreClicksUntil = 0;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  private petSprite!: Phaser.GameObjects.Sprite;
  private oppSprite!: Phaser.GameObjects.Sprite;
  private oppPrefix = 'bong';
  private oppName = '';
  private vsText!: Phaser.GameObjects.Text;
  private feedbackText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private diffText!: Phaser.GameObjects.Text;

  /** −1 (pet falls) … +1 (opponent falls). */
  private tug = 0;
  /** 0..1 recent mash intensity; boosts shove strength, drains fast. */
  private mash = 0;
  private surgePhase = 0;
  private nextDustAt = 0;

  private mashBarFill!: Phaser.GameObjects.Rectangle;
  private mashBarGroup: Phaser.GameObjects.GameObject[] = [];
  private tugMarker!: Phaser.GameObjects.Rectangle;
  private tugFillRight!: Phaser.GameObjects.Rectangle;
  private tugFillLeft!: Phaser.GameObjects.Rectangle;
  private spectators: { sprite: Phaser.GameObjects.Sprite; prefix: string; baseY: number }[] = [];

  constructor() {
    super('Bump');
  }

  create() {
    generateTextures(this);
    this.mode = 'pick';
    this.menuOpen = false;
    this.ignoreClicksUntil = 0;
    this.tug = 0;
    this.mash = 0;
    this.surgePhase = Math.random() * Math.PI * 2;

    const cx = this.cameras.main.width / 2;
    const viewW = this.cameras.main.width;
    const viewH = this.cameras.main.height;
    this.cameras.main.setBackgroundColor('#2a2440');

    // Cozy arena hall: back wall, bunting, floor band below the platform.
    this.add.rectangle(cx, 90, viewW, 180, 0x3d3560);
    this.add.rectangle(cx, 280, viewW, 220, 0x352e55);
    this.add.rectangle(cx, viewH - 60, viewW, 140, 0x4a4370);
    for (let i = 0; i < 8; i++) {
      this.add.rectangle(50 + i * 100, 70, 40, 8, i % 2 === 0 ? 0xff7fab : 0xffe066);
    }

    // The platform — fall off either end and the bout is over.
    this.add.rectangle(cx, FALL_FLOOR_Y + 12, viewW, 6, 0x1a1a2e).setDepth(1);
    this.add.rectangle(cx - PLATFORM_HALF + 30, PLATFORM_Y + 70, 26, 90, 0x5d4037).setDepth(2);
    this.add.rectangle(cx + PLATFORM_HALF - 30, PLATFORM_Y + 70, 26, 90, 0x5d4037).setDepth(2);
    this.add
      .rectangle(cx, PLATFORM_Y + 14, PLATFORM_HALF * 2, 28, 0xc9a06a)
      .setStrokeStyle(3, 0x5d4037)
      .setDepth(3);
    this.add.rectangle(cx, PLATFORM_Y + 3, PLATFORM_HALF * 2 - 8, 6, 0xe0c9a6).setDepth(3);
    // Centre ring mark.
    this.add.rectangle(cx, PLATFORM_Y + 14, 8, 28, 0xb0855a).setDepth(3);

    this.petSprite = this.add
      .sprite(cx - CHAR_GAP, PLATFORM_Y, petTextureKey(State.data.petSpecies, 'idle1'))
      .setOrigin(0.5, 1)
      .setScale(2.1)
      .setDepth(10);
    this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));

    this.spawnOpponent();
    this.spawnSpectators();

    const title = this.add
      .text(140, 16, 'BUMP!', { ...FONT, fontSize: '18px', color: '#ffe066' })
      .setScrollFactor(0);
    this.diffText = this.add
      .text(20, 44, '', { ...FONT, fontSize: '14px', color: '#a8e6cf' })
      .setScrollFactor(0);
    this.vsText = this.add
      .text(cx, 96, '', { ...FONT, fontSize: '16px', color: '#ffb3d1' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30);
    this.feedbackText = this.add
      .text(cx, 150, '', { ...FONT, fontSize: '26px', color: '#ffe066' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30);
    this.hintText = this.add
      .text(cx, viewH - 20, 'Wait for “PUSH!” — then mash tap / click / Space!', {
        ...FONT,
        fontSize: '12px',
        color: '#c8c8dc',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.buildMashBar(cx);
    this.buildTugBar(cx, viewH);

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
    markAsUi(this, title, this.diffText, this.vsText, this.feedbackText, this.hintText, this.backBtn);

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
      this.handlePress();
    });

    this.layoutFighters();
    this.openDifficultyMenu();
  }

  /** Random villager opponent (any with loaded textures). */
  private spawnOpponent() {
    const available = NPC_PREFIXES.filter(
      (prefix) => this.textures.exists(`${prefix}-idle`) && this.textures.exists(`${prefix}-sad`),
    );
    this.oppPrefix = available.length
      ? available[Phaser.Math.Between(0, available.length - 1)]!
      : 'bong';
    this.oppName = npcDisplayName(this.oppPrefix);
    const cx = this.cameras.main.width / 2;
    const oppClassic = this.oppPrefix === 'cinna' ? 1.7 : 2;
    const oppScale = miniteenDrawScale(this, this.oppPrefix, oppClassic);
    this.oppSprite = this.add
      .sprite(cx + CHAR_GAP, PLATFORM_Y, `${this.oppPrefix}-idle`)
      .setOrigin(0.5, 1)
      .setScale(oppScale)
      .setFlipX(true)
      .setDepth(9);
    const bounce = `${this.oppPrefix}-bounce`;
    if (this.anims.exists(bounce)) this.oppSprite.play(bounce);
  }

  /** Crowd along both ends of the platform — hops on big shoves / outcome. */
  private spawnSpectators() {
    this.spectators = [];
    const cx = this.cameras.main.width / 2;
    const available = NPC_PREFIXES.filter(
      (prefix) =>
        prefix !== this.oppPrefix &&
        this.textures.exists(`${prefix}-idle`) &&
        this.textures.exists(`${prefix}-happy`),
    );
    if (available.length === 0) return;
    Phaser.Utils.Array.Shuffle(available);
    const slots: { x: number; y: number; flip: boolean; scale: number }[] = [
      { x: cx - PLATFORM_HALF - 52, y: PLATFORM_Y + 8, flip: false, scale: 1.45 },
      { x: cx + PLATFORM_HALF + 52, y: PLATFORM_Y + 8, flip: true, scale: 1.45 },
      { x: cx - PLATFORM_HALF - 98, y: PLATFORM_Y - 18, flip: false, scale: 1.2 },
      { x: cx + PLATFORM_HALF + 98, y: PLATFORM_Y - 16, flip: true, scale: 1.2 },
      { x: cx - PLATFORM_HALF - 28, y: PLATFORM_Y - 36, flip: false, scale: 1.1 },
      { x: cx + PLATFORM_HALF + 28, y: PLATFORM_Y - 34, flip: true, scale: 1.1 },
    ];
    const count = Math.min(slots.length, available.length, Phaser.Math.Between(4, 6));
    for (let i = 0; i < count; i++) {
      const prefix = available[i]!;
      const slot = slots[i]!;
      const classic = prefix === 'cinna' ? slot.scale * 0.85 : slot.scale;
      const scale = miniteenDrawScale(this, prefix, classic);
      const sprite = this.add
        .sprite(slot.x, slot.y, `${prefix}-idle`)
        .setOrigin(0.5, 1)
        .setScale(scale)
        .setFlipX(slot.flip)
        .setDepth(4);
      const bounce = `${prefix}-bounce`;
      if (this.anims.exists(bounce)) sprite.play(bounce);
      this.spectators.push({ sprite, prefix, baseY: slot.y });
    }
  }

  private spectatorsCheer(big = false) {
    for (const s of this.spectators) {
      const happy = `${s.prefix}-happy`;
      if (this.textures.exists(happy)) {
        s.sprite.stop();
        s.sprite.setTexture(happy);
      }
      this.tweens.add({
        targets: s.sprite,
        y: s.baseY - Phaser.Math.Between(big ? 14 : 8, big ? 22 : 14),
        duration: Phaser.Math.Between(160, 240),
        yoyo: true,
        repeat: big ? Phaser.Math.Between(2, 3) : 1,
        ease: 'Sine.easeOut',
        onComplete: () => {
          s.sprite.setY(s.baseY);
          const bounce = `${s.prefix}-bounce`;
          if (this.anims.exists(bounce)) s.sprite.play(bounce);
          else if (this.textures.exists(`${s.prefix}-idle`)) s.sprite.setTexture(`${s.prefix}-idle`);
        },
      });
    }
  }

  private spectatorsBoo() {
    for (const s of this.spectators) {
      const sad = `${s.prefix}-sad`;
      if (this.textures.exists(sad)) {
        s.sprite.stop();
        s.sprite.setTexture(sad);
      }
      this.tweens.add({
        targets: s.sprite,
        angle: Phaser.Math.Between(-8, 8),
        duration: 280,
        yoyo: true,
        onComplete: () => {
          s.sprite.setAngle(0);
          const bounce = `${s.prefix}-bounce`;
          if (this.anims.exists(bounce)) s.sprite.play(bounce);
          else if (this.textures.exists(`${s.prefix}-idle`)) s.sprite.setTexture(`${s.prefix}-idle`);
        },
      });
    }
  }

  /** "MASH" meter — fills with taps, drains fast; boosts every shove. */
  private buildMashBar(cx: number) {
    const y = 196;
    const frame = this.add
      .rectangle(cx, y, 232, 22, 0x1a1a2e, 0.9)
      .setStrokeStyle(2, 0xffe066)
      .setScrollFactor(0)
      .setDepth(40);
    this.mashBarFill = this.add
      .rectangle(cx - 112, y, 0, 14, 0xffe066)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(41);
    const label = this.add
      .text(cx, y - 24, 'MASH!', { ...FONT, fontSize: '13px', color: '#ffe066' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(41);
    this.mashBarGroup = [frame, this.mashBarFill, label];
    markAsUi(this, frame, this.mashBarFill, label);
    this.setMashBarVisible(false);
  }

  private setMashBarVisible(on: boolean) {
    for (const o of this.mashBarGroup) (o as Phaser.GameObjects.Rectangle).setVisible(on);
  }

  /** Bottom tug-of-war bar — marker all the way right = opponent topples. */
  private buildTugBar(cx: number, viewH: number) {
    const y = viewH - 52;
    const track = this.add
      .rectangle(cx, y, BAR_TRAVEL * 2 + 20, 20, 0x1a1a2e, 0.92)
      .setStrokeStyle(2, 0xffb3d1)
      .setScrollFactor(0)
      .setDepth(40);
    this.tugFillRight = this.add
      .rectangle(cx, y, 0, 12, 0x56c596)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(41);
    // Shapes don't recompute origin offsets when width changes — keep
    // origin 0 and slide x left instead (see layoutFighters).
    this.tugFillLeft = this.add
      .rectangle(cx, y, 0, 12, 0xff6b6b)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(41);
    const centre = this.add
      .rectangle(cx, y, 3, 20, 0xc8c8dc)
      .setScrollFactor(0)
      .setDepth(42);
    this.tugMarker = this.add
      .rectangle(cx, y, 10, 28, 0xffe066)
      .setStrokeStyle(2, 0x1a1a2e)
      .setScrollFactor(0)
      .setDepth(43);
    // Faces at each end: their side (left) vs yours (right).
    const oppFace = this.add
      .image(cx - BAR_TRAVEL - 34, y, `${this.oppPrefix}-idle`)
      .setScrollFactor(0)
      .setDepth(42);
    oppFace.setScale(Math.min(1.4, 30 / Math.max(oppFace.width, oppFace.height)));
    const petFace = this.add
      .image(cx + BAR_TRAVEL + 34, y, petTextureKey(State.data.petSpecies, 'idle1'))
      .setScrollFactor(0)
      .setDepth(42);
    petFace.setScale(Math.min(1.4, 30 / Math.max(petFace.width, petFace.height)));
    markAsUi(this, track, this.tugFillRight, this.tugFillLeft, centre, this.tugMarker, oppFace, petFace);
  }

  private openDifficultyMenu() {
    this.menuOpen = true;
    const option = (d: BumpDifficulty) => {
      const tired = !State.hasEnergy(BUMP_ENERGY_COST[d]);
      return {
        label: `${DIFFICULTY[d].label}${tired ? ' — too tired!' : ''}`,
        disabled: tired,
        onSelect: () => this.startBout(d),
      };
    };
    const menu = new Menu(
      this,
      'Bump!',
      [option('easy'), option('medium'), option('hard')],
      {
        subtitle: `Push ${this.oppName} off the platform — harder foes push back harder!`,
        face: `${this.oppPrefix}-idle`,
      },
    );
    menu.onClose = () => {
      this.menuOpen = false;
      this.ignoreClicksUntil = this.time.now + 250;
      // Menu fires onClose BEFORE onSelect — wait a tick so a pick can land;
      // only leave if the picker really was dismissed without choosing.
      this.time.delayedCall(0, () => {
        if (this.mode === 'pick') this.scene.start('WestPark', { spawn: 'bump' });
      });
    };
  }

  private startBout(d: BumpDifficulty) {
    this.difficulty = d;
    // Pay the bout's energy up front — walking away doesn't refund it.
    State.spendEnergy(BUMP_ENERGY_COST[d]);
    this.mode = 'ready';
    this.diffText.setText(`Difficulty: ${DIFFICULTY[d].label}`);
    this.vsText.setText(`${State.data.petName || 'Your pet'}  VS  ${this.oppName}`);
    this.flashFeedback('Get ready…', '#c8c8dc', 0);

    this.time.delayedCall(900, () => {
      if (this.mode !== 'ready') return;
      this.mode = 'wait';
      // Drop any press held through the ready beat.
      Phaser.Input.Keyboard.JustDown(this.keySpace);
      this.flashFeedback('Wait for it…', '#c8c8dc', 0);
      this.armPushSignal();
    });
  }

  /** Random stare-down, then the PUSH! signal. */
  private armPushSignal() {
    this.time.delayedCall(Phaser.Math.Between(1100, 2600), () => {
      if (this.mode !== 'wait') return;
      this.mode = 'push';
      this.mash = 0;
      this.setMashBarVisible(true);
      this.feedbackText.setText('PUSH!!').setColor('#ffe066').setAlpha(1).setScale(1.6);
      this.tweens.add({ targets: this.feedbackText, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.feedbackText, alpha: 0.35, duration: 380, delay: 900, yoyo: true, repeat: -1 });
      this.hintText.setText('MASH tap / click / Space — fill the bar, shove them off!');
      this.spectatorsCheer(false);
    });
  }

  /** Tap / click / Space — shove during push; jumping the gun costs ground. */
  private handlePress() {
    if (this.mode === 'push') {
      this.mash = Math.min(1, this.mash + MASH_GAIN);
      this.tug = Math.min(1.05, this.tug + TAP_IMPULSE_BASE + TAP_IMPULSE_MASH_BONUS * this.mash);
      // A little lunge sells the shove.
      this.petSprite.setScale(2.2, 2.05);
      this.tweens.add({ targets: this.petSprite, scaleX: 2.1, scaleY: 2.1, duration: 120 });
      return;
    }
    if (this.mode === 'wait') {
      this.tug = Math.max(-0.6, this.tug - FALSE_START_PENALTY);
      this.flashFeedback('Too soon! Hold…', '#ffb3d1');
      const happy = `${this.oppPrefix}-happy`;
      if (this.textures.exists(happy)) {
        this.oppSprite.setTexture(happy);
        this.time.delayedCall(500, () => {
          if (this.mode === 'wait' && this.anims.exists(`${this.oppPrefix}-bounce`)) {
            this.oppSprite.play(`${this.oppPrefix}-bounce`);
          }
        });
      }
    }
  }

  private flashFeedback(msg: string, color: string, fadeDelay = 900) {
    this.tweens.killTweensOf(this.feedbackText);
    this.feedbackText.setText(msg).setColor(color).setAlpha(1).setScale(1);
    if (fadeDelay > 0) {
      this.tweens.add({ targets: this.feedbackText, alpha: 0, duration: 500, delay: fadeDelay });
    }
  }

  /** Place fighters + bar widgets for the current tug value. */
  private layoutFighters() {
    const cx = this.cameras.main.width / 2;
    const contactX = cx + this.tug * TUG_TRAVEL;
    this.petSprite.x = contactX - CHAR_GAP;
    this.oppSprite.x = contactX + CHAR_GAP;

    this.tugMarker.x = cx + this.tug * BAR_TRAVEL;
    this.tugFillRight.width = Math.max(0, this.tug) * BAR_TRAVEL;
    this.tugFillLeft.width = Math.max(0, -this.tug) * BAR_TRAVEL;
    this.tugFillLeft.x = cx - this.tugFillLeft.width;
    this.mashBarFill.width = this.mash * 224;
  }

  /** Dust kicked up at the contact point while both are digging in. */
  private puffDust(contactX: number) {
    if (!this.textures.exists('smoke') || this.time.now < this.nextDustAt) return;
    this.nextDustAt = this.time.now + 220;
    const s = this.add
      .image(contactX + Phaser.Math.Between(-8, 8), PLATFORM_Y - 4, 'smoke')
      .setScale(0.5)
      .setAlpha(0.5)
      .setDepth(12);
    this.tweens.add({
      targets: s,
      y: PLATFORM_Y - Phaser.Math.Between(18, 34),
      x: s.x + Phaser.Math.Between(-14, 14),
      alpha: 0,
      scale: 1,
      duration: 500,
      onComplete: () => s.destroy(),
    });
  }

  private win() {
    this.mode = 'won';
    this.setMashBarVisible(false);
    this.tweens.killTweensOf(this.feedbackText);
    this.feedbackText.setAlpha(0);
    this.backBtn.setVisible(false);
    const reward = State.rewardBumpWin(this.difficulty);

    const cx = this.cameras.main.width / 2;
    // Opponent topples off the right end of the platform.
    this.oppSprite.stop();
    if (this.textures.exists(`${this.oppPrefix}-sad`)) this.oppSprite.setTexture(`${this.oppPrefix}-sad`);
    this.tweens.add({
      targets: this.oppSprite,
      x: cx + PLATFORM_HALF + 46,
      angle: 100,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.oppSprite,
          y: FALL_FLOOR_Y + 26,
          alpha: 0.35,
          duration: 380,
          ease: 'Quad.easeIn',
        });
      },
    });

    this.petSprite.setAngle(0).stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'happy'));
    this.tweens.add({
      targets: this.petSprite,
      y: PLATFORM_Y - 26,
      duration: 200,
      yoyo: true,
      repeat: 2,
      ease: 'Quad.easeOut',
    });
    toast(this, cx, 180, `+${reward.coins} coins!`, '#a8e6cf');
    this.spectatorsCheer(true);
    this.time.delayedCall(1100, () => this.showResultPanel(true, reward));
  }

  private lose() {
    this.mode = 'lost';
    this.setMashBarVisible(false);
    this.tweens.killTweensOf(this.feedbackText);
    this.feedbackText.setAlpha(0);
    this.backBtn.setVisible(false);
    State.settleBumpLoss();

    const cx = this.cameras.main.width / 2;
    // Your pet topples off the left end.
    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'sad'));
    this.tweens.add({
      targets: this.petSprite,
      x: cx - PLATFORM_HALF - 46,
      angle: -100,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.petSprite,
          y: FALL_FLOOR_Y + 26,
          duration: 380,
          ease: 'Quad.easeIn',
        });
      },
    });

    this.oppSprite.setAngle(0);
    const happy = `${this.oppPrefix}-happy`;
    if (this.textures.exists(happy)) {
      this.oppSprite.stop();
      this.oppSprite.setTexture(happy);
    }
    this.tweens.add({
      targets: this.oppSprite,
      y: PLATFORM_Y - 20,
      duration: 200,
      yoyo: true,
      repeat: 2,
      ease: 'Quad.easeOut',
    });
    this.spectatorsBoo();
    this.time.delayedCall(1100, () => this.showResultPanel(false, { coins: 0, happiness: 0 }));
  }

  private showResultPanel(won: boolean, reward: { coins: number; happiness: number }) {
    this.mode = 'done';
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;

    const panel = this.add
      .rectangle(cx, cy, 470, 250, 0x2a2440, 0.97)
      .setStrokeStyle(3, 0xffb3d1)
      .setScrollFactor(0)
      .setDepth(1600)
      .setInteractive();
    const title = this.add
      .text(cx, cy - 78, won ? `${this.oppName} toppled!` : `${State.data.petName || 'Your pet'} fell!`, {
        ...FONT,
        fontSize: '22px',
        color: won ? '#ffe066' : '#ff6b6b',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601);

    const face = this.add
      .image(cx, cy - 36, petTextureKey(State.data.petSpecies, won ? 'happy' : 'sad'))
      .setScrollFactor(0)
      .setDepth(1601);
    face.setScale(Math.min(3, 52 / Math.max(face.width, face.height)));

    const line = won
      ? `${DIFFICULTY[this.difficulty].label} win · +${reward.coins} coins · +${reward.happiness} happy`
      : `So close — try Easy for a gentler shove!`;
    const rewardText = this.add
      .text(cx, cy + 8, line, { ...FONT, fontSize: '15px' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601);

    const again = this.add
      .text(cx - 120, cy + 84, won ? '[ Bump again ]' : '[ Rematch ]', {
        ...FONT,
        fontSize: '18px',
        color: '#a8e6cf',
        padding: { x: 10, y: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    again.on('pointerdown', () => {
      if (!State.hasEnergy(MIN_GAME_ENERGY)) {
        toast(this, cx, cy - 130, 'Too tired to play — needs a nap!', '#ffb3d1');
        return;
      }
      this.scene.restart();
    });
    const leave = this.add
      .text(cx + 130, cy + 84, '[ Back outside ]', {
        ...FONT,
        fontSize: '18px',
        color: '#ffb3d1',
        padding: { x: 10, y: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    leave.on('pointerdown', () => this.scene.start('WestPark', { spawn: 'bump' }));
    markAsUi(this, panel, title, face, rewardText, again, leave);
  }

  private requestLeave() {
    if (this.mode !== 'wait' && this.mode !== 'push' && this.mode !== 'ready') {
      this.scene.start('WestPark', { spawn: 'bump' });
      return;
    }
    this.menuOpen = true;
    const menu = new Menu(
      this,
      'Leave Bump?',
      [
        { label: 'Keep pushing', onSelect: () => undefined },
        {
          label: 'Back outside',
          onSelect: () => this.scene.start('WestPark', { spawn: 'bump' }),
        },
      ],
      'Walking away forfeits the bout',
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

    if (this.mode === 'won' || this.mode === 'lost' || this.mode === 'done') return;

    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this.handlePress();
    }

    if (this.mode !== 'push') {
      this.layoutFighters();
      return;
    }

    const dt = deltaMs / 1000;
    this.mash = Math.max(0, this.mash - MASH_DRAIN_PER_S * dt);

    // Opponent pressure with a slow surge cycle — hard mode surges can
    // out-shove a steady mash, so bank ground while the surge is low.
    const surge = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(this.time.now / 800 + this.surgePhase));
    this.tug -= DIFFICULTY[this.difficulty].pressure * surge * dt;
    this.tug = Phaser.Math.Clamp(this.tug, -1.05, 1.05);

    // Struggle: both lean into the contact point, shaking with effort.
    const wobble = Math.sin(this.time.now / 45) * (2 + this.mash * 4);
    this.petSprite.setAngle(9 + wobble);
    this.oppSprite.setAngle(-(9 + wobble * surge));
    this.layoutFighters();
    const cx = this.cameras.main.width / 2;
    this.puffDust(cx + this.tug * TUG_TRAVEL);

    if (this.tug >= 1) {
      this.win();
    } else if (this.tug <= -1) {
      this.lose();
    }
  }
}
