import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State } from '../systems/GameState';
import { GAME_MIN_ENERGY, tooTiredMessage } from '../systems/gameEnergy';
import { Menu, toast } from '../systems/UI';
import { bindGameActivity } from '../systems/multiplayerGameActivity';
import { attachCameraZoom, markAsUi, type CameraZoom } from '../systems/cameraZoom';
import { petAnimKey, petDrawScale, petTextureKey } from '../systems/pets';
import {
  BOSS_ORDER,
  BOSSES,
  EXPEDITION_REWARDS,
  MANA_CAP,
  ABILITIES,
  canAffordAbility,
  energyCost,
  scaledBossHp,
  type AbilityDef,
  type ExpeditionBossId,
  type ExpeditionDifficulty,
} from '../systems/expeditionRules';
import {
  beginAbility,
  beginBossTurn,
  createCombat,
  finishBossChain,
  finishSweep,
  onSweepTap,
  resolveDefense,
  startChainHits,
  type CombatState,
  type DefenseAction,
} from '../systems/expeditionCombat';
import { buildSweep, type SweepLayout } from '../systems/expeditionSweep';
import { defenseWindows } from '../systems/expeditionRules';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };
const FONT_SM = { fontFamily: 'monospace', fontSize: '12px', color: '#c8c8dc' };
const FONT_LG = { fontFamily: 'monospace', fontSize: '20px', color: '#ffe066' };
const FONT_XL = { fontFamily: 'monospace', fontSize: '28px', color: '#efe8ff' };

/** Boss display height in arena (56×80 art). */
const BOSS_DISPLAY_H = 168;
/** Fixed radius of every incoming-hit circle (same tap-read area). */
const HIT_CIRCLE_R = 36;
/** How far from arena centre the hit circles sit. */
const HIT_RING_R = 88;
/** Max hits we pre-build slots for (chains cap at 6). */
const HIT_SLOT_MAX = 6;

const POSES = ['idle', 'windup', 'strike', 'special', 'hurt', 'enraged', 'down'] as const;
export type BossPose = (typeof POSES)[number];

export function expeditionBossTextureKey(id: ExpeditionBossId, pose: BossPose): string {
  return `exp-${id}-${pose}`;
}

type Mode = 'pick-boss' | 'pick-diff' | 'battle' | 'won' | 'lost';

/**
 * Expedition — Clair Obscur-style single-combatant duel on the East Green.
 *
 * Your turn: pick an ability, land taps on a rotating-ring QTE.
 * Their turn: left half / X dodges; right half / C parries. Parry is tighter
 * but pays mana and full-chain parries fire a counter.
 */
export class ExpeditionScene extends Phaser.Scene {
  private mode: Mode = 'pick-boss';
  private bossId: ExpeditionBossId = 'gustave';
  private difficulty: ExpeditionDifficulty = 'normal';
  private combat: CombatState | null = null;
  private cameraZoom!: CameraZoom;
  private menuOpen = false;
  private reopeningPicker = false;
  private ignoreClicksUntil = 0;

  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyC!: Phaser.Input.Keyboard.Key;

  private petSprite!: Phaser.GameObjects.Sprite;
  private petHomeX = 0;
  private petHomeY = 0;
  private bossSprite!: Phaser.GameObjects.Image;
  private bossHomeX = 0;
  private bossHomeY = 0;

  private bossNameText!: Phaser.GameObjects.Text;
  private bossPhaseText!: Phaser.GameObjects.Text;
  private bossHpFill!: Phaser.GameObjects.Rectangle;
  private bossHpLabel!: Phaser.GameObjects.Text;
  private phasePips: Phaser.GameObjects.Rectangle[] = [];
  private petNameText!: Phaser.GameObjects.Text;
  private petHpFill!: Phaser.GameObjects.Rectangle;
  private petHpLabel!: Phaser.GameObjects.Text;
  private manaText!: Phaser.GameObjects.Text;
  private chargeText!: Phaser.GameObjects.Text;
  private stanceText!: Phaser.GameObjects.Text;

  private turnBanner!: Phaser.GameObjects.Text;
  private turnBannerBg!: Phaser.GameObjects.Rectangle;
  private statusText!: Phaser.GameObjects.Text;
  private hitCounterText!: Phaser.GameObjects.Text;
  private hitTypeText!: Phaser.GameObjects.Text;
  /** Big floating attack name during wind-up / chain. */
  private attackNameText!: Phaser.GameObjects.Text;
  private attackNameBg!: Phaser.GameObjects.Rectangle;
  /** Chain preview: one pip per upcoming hit (white = normal, red = gradient). */
  private chainPipRow!: Phaser.GameObjects.Container;
  private chainPips: Phaser.GameObjects.Rectangle[] = [];
  private screenFlash!: Phaser.GameObjects.Rectangle;
  private edgeFlashL!: Phaser.GameObjects.Rectangle;
  private edgeFlashR!: Phaser.GameObjects.Rectangle;
  private countdownText!: Phaser.GameObjects.Text;

  private ringGfx!: Phaser.GameObjects.Graphics;
  private ringHint!: Phaser.GameObjects.Text;
  private abilityRow!: Phaser.GameObjects.Container;
  private abilityButtons: {
    bg: Phaser.GameObjects.Rectangle;
    costBadge: Phaser.GameObjects.Rectangle;
    costText: Phaser.GameObjects.Text;
    label: Phaser.GameObjects.Text;
    ability: AbilityDef | null;
  }[] = [];

  private dodgeZone!: Phaser.GameObjects.Rectangle;
  private parryZone!: Phaser.GameObjects.Rectangle;
  private dodgeLabel!: Phaser.GameObjects.Text;
  private parryLabel!: Phaser.GameObjects.Text;
  private dodgeSub!: Phaser.GameObjects.Text;
  private parrySub!: Phaser.GameObjects.Text;
  private defensePulse?: Phaser.Tweens.Tween;

  private hitCue!: Phaser.GameObjects.Rectangle;
  private timingBarBg!: Phaser.GameObjects.Rectangle;
  private timingBarFill!: Phaser.GameObjects.Rectangle;
  private fxGfx!: Phaser.GameObjects.Graphics;
  /**
   * One circle per chain slot near the centre. Same radius always — only
   * position and colour (white / red) change per hit.
   */
  private hitCircles: {
    ring: Phaser.GameObjects.Arc;
    fill: Phaser.GameObjects.Arc;
    label: Phaser.GameObjects.Text;
    x: number;
    y: number;
  }[] = [];
  private activeHitSlot = -1;
  private dodgeBurst?: Phaser.GameObjects.Arc;
  private parryBurst?: Phaser.GameObjects.Arc;

  private sweepLayout: SweepLayout | null = null;
  private needleDeg = 0;
  private sweepElapsed = 0;
  private sweepActive = false;
  private chainStartAt = 0;
  private pendingHitIndex = 0;
  private inputLockedUntil = 0;
  private seed = 1;
  private nextHitAt = 0;

  constructor() {
    super('Expedition');
  }

  create() {
    bindGameActivity(this, 'Expedition');
    generateTextures(this);
    this.mode = 'pick-boss';
    this.menuOpen = false;
    this.combat = null;
    this.seed = (Math.random() * 1e9) | 0;

    const viewW = this.cameras.main.width;
    const viewH = this.cameras.main.height;
    const cx = viewW / 2;
    this.cameras.main.setBackgroundColor('#0c1420');

    // Belle Époque arena — dark canvas hall with gold trim.
    this.add.rectangle(cx, viewH / 2, viewW, viewH, 0x121c2a).setDepth(0);
    this.add.rectangle(cx, 70, viewW, 140, 0x1a2434).setDepth(0);
    this.add.rectangle(cx, viewH - 90, viewW, 180, 0x0a1018).setDepth(1);
    // Gold frame rails.
    this.add.rectangle(cx, 6, viewW - 16, 6, 0xc9a227).setDepth(2);
    this.add.rectangle(cx, viewH - 6, viewW - 16, 6, 0xc9a227).setDepth(2);
    this.add.rectangle(8, viewH / 2, 6, viewH - 20, 0xc9a227).setDepth(2);
    this.add.rectangle(viewW - 8, viewH / 2, 6, viewH - 20, 0xc9a227).setDepth(2);
    // Soft stage oval under fighters.
    const stage = this.add.graphics().setDepth(3);
    stage.fillStyle(0x1e2a3a, 0.85);
    stage.fillEllipse(cx, viewH * 0.55, viewW * 0.72, 48);

    // Boss (top-right).
    this.bossHomeX = viewW - 110;
    this.bossHomeY = 175;
    this.bossSprite = this.add.image(this.bossHomeX, this.bossHomeY, expeditionBossTextureKey('gustave', 'idle')).setDepth(8);
    this.ensureBossTexture(this.bossSprite, 'gustave', 'idle');
    this.fitBossSprite();

    // Pet (bottom-left).
    this.petHomeX = 100;
    this.petHomeY = viewH - 175;
    const petKey = petTextureKey(State.data.petSpecies, 'idle1');
    this.petSprite = this.add
      .sprite(this.petHomeX, this.petHomeY, petKey)
      .setDepth(8)
      .setScale(petDrawScale(this, State.data.petSpecies) * 1.5);

    // ── Boss HUD ──
    this.bossNameText = this.add.text(20, 18, '', { ...FONT_LG, color: '#ffb3d1' }).setDepth(30);
    this.bossPhaseText = this.add.text(20, 44, '', { ...FONT_SM, color: '#a8e6cf' }).setDepth(30);
    this.add.rectangle(20, 74, 260, 14, 0x2a2030).setOrigin(0, 0.5).setDepth(30).setStrokeStyle(1, 0x5a4060);
    this.bossHpFill = this.add.rectangle(20, 74, 260, 14, 0xe74c5c).setOrigin(0, 0.5).setDepth(31);
    this.bossHpLabel = this.add.text(288, 66, '', { ...FONT_SM, color: '#ffb3d1' }).setDepth(30);
    // Phase pips.
    this.phasePips = [];
    for (let i = 0; i < 3; i++) {
      const pip = this.add
        .rectangle(22 + i * 18, 92, 12, 8, 0x3d3d5c)
        .setOrigin(0, 0.5)
        .setDepth(30)
        .setStrokeStyle(1, 0xc9a227);
      this.phasePips.push(pip);
    }

    // ── Pet HUD ──
    this.petNameText = this.add
      .text(20, viewH - 138, State.data.petName || 'Pet', { ...FONT, color: '#a8e6cf' })
      .setDepth(30);
    this.add.rectangle(20, viewH - 114, 220, 14, 0x1a2a28).setOrigin(0, 0.5).setDepth(30).setStrokeStyle(1, 0x3a6058);
    this.petHpFill = this.add.rectangle(20, viewH - 114, 220, 14, 0x5ed6a0).setOrigin(0, 0.5).setDepth(31);
    this.petHpLabel = this.add.text(248, viewH - 122, '', { ...FONT_SM, color: '#a8e6cf' }).setDepth(30);
    this.manaText = this.add.text(20, viewH - 96, '', { ...FONT_SM, color: '#74b9ff' }).setDepth(30);
    this.chargeText = this.add.text(viewW - 210, 44, '', { ...FONT_SM, color: '#ffe066' }).setDepth(30);
    this.stanceText = this.add.text(viewW - 210, 62, '', { ...FONT_SM, color: '#ffb3d1' }).setDepth(30);

    // ── Turn banner ──
    this.turnBannerBg = this.add
      .rectangle(cx, 118, 320, 36, 0x0a1018, 0.88)
      .setStrokeStyle(2, 0xc9a227)
      .setDepth(35)
      .setVisible(false);
    this.turnBanner = this.add
      .text(cx, 118, '', { ...FONT_XL, fontSize: '22px', color: '#ffe066' })
      .setOrigin(0.5)
      .setDepth(36)
      .setVisible(false);
    this.statusText = this.add
      .text(cx, 150, '', { ...FONT, color: '#efe8ff' })
      .setOrigin(0.5)
      .setDepth(35);
    this.hitCounterText = this.add
      .text(cx, viewH / 2 - 118, '', { ...FONT_LG, color: '#efe8ff' })
      .setOrigin(0.5)
      .setDepth(36)
      .setVisible(false);
    this.hitTypeText = this.add
      .text(cx, viewH / 2 - 78, '', { ...FONT_XL, fontSize: '28px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(36)
      .setVisible(false);

    // Attack name plate — huge so the boss move is unmissable.
    this.attackNameBg = this.add
      .rectangle(cx, 168, 380, 42, 0x1a0a12, 0.92)
      .setStrokeStyle(3, 0xff7fab)
      .setDepth(34)
      .setVisible(false);
    this.attackNameText = this.add
      .text(cx, 168, '', { ...FONT_XL, fontSize: '20px', color: '#ffb3d1' })
      .setOrigin(0.5)
      .setDepth(35)
      .setVisible(false);

    // Chain pips under the attack name.
    this.chainPipRow = this.add.container(cx, 198).setDepth(35).setVisible(false);
    this.chainPips = [];

    // Full-screen impact flash + side edge warnings.
    this.screenFlash = this.add
      .rectangle(cx, viewH / 2, viewW, viewH, 0xffffff, 0)
      .setDepth(45)
      .setVisible(false);
    this.edgeFlashL = this.add
      .rectangle(24, viewH / 2, 36, viewH, 0x5dade2, 0)
      .setDepth(37)
      .setVisible(false);
    this.edgeFlashR = this.add
      .rectangle(viewW - 24, viewH / 2, 36, viewH, 0xff7fab, 0)
      .setDepth(37)
      .setVisible(false);
    this.countdownText = this.add
      .text(cx, viewH / 2 + 36, '', { ...FONT_XL, fontSize: '32px', color: '#ffe066' })
      .setOrigin(0.5)
      .setDepth(36)
      .setVisible(false);

    this.ringGfx = this.add.graphics().setDepth(20);
    this.ringHint = this.add
      .text(cx, viewH / 2 + 70, '', { ...FONT_LG, color: '#ffe066' })
      .setOrigin(0.5)
      .setDepth(21)
      .setVisible(false);
    this.fxGfx = this.add.graphics().setDepth(40);

    // Kept as a soft centre guide; real hits use per-slot circles below.
    this.hitCue = this.add
      .rectangle(cx, viewH / 2 - 10, 24, 24, 0xffffff, 0)
      .setDepth(18)
      .setStrokeStyle(2, 0x3a5068)
      .setVisible(false);

    // Individual hit circles around the centre — same radius every time.
    this.hitCircles = [];
    for (let i = 0; i < HIT_SLOT_MAX; i++) {
      const ang = Phaser.Math.DegToRad(-90 + (i / HIT_SLOT_MAX) * 360);
      const hx = cx + Math.cos(ang) * HIT_RING_R;
      const hy = viewH / 2 - 10 + Math.sin(ang) * HIT_RING_R;
      const fill = this.add
        .circle(hx, hy, HIT_CIRCLE_R, 0xffffff, 0.08)
        .setStrokeStyle(4, 0xffffff, 0.9)
        .setDepth(22)
        .setVisible(false);
      const ring = this.add
        .circle(hx, hy, HIT_CIRCLE_R + 10, 0xffffff, 0)
        .setStrokeStyle(3, 0xffe066, 0)
        .setDepth(23)
        .setVisible(false);
      const label = this.add
        .text(hx, hy, `${i + 1}`, { ...FONT_LG, fontSize: '18px', color: '#ffffff' })
        .setOrigin(0.5)
        .setDepth(24)
        .setVisible(false);
      this.hitCircles.push({ ring, fill, label, x: hx, y: hy });
    }
    // Parry / dodge success bursts (UI).
    this.dodgeBurst = this.add
      .circle(viewW * 0.25, viewH - 52, 20, 0x5dade2, 0)
      .setStrokeStyle(4, 0x5dade2, 1)
      .setDepth(41)
      .setVisible(false);
    this.parryBurst = this.add
      .circle(viewW * 0.75, viewH - 52, 20, 0xffe066, 0)
      .setStrokeStyle(4, 0xffe066, 1)
      .setDepth(41)
      .setVisible(false);

    // Timing approach bar (fills toward the hit) — thicker, harder to miss.
    this.timingBarBg = this.add
      .rectangle(cx, viewH / 2 + 100, 280, 16, 0x1a1a2e, 0.95)
      .setDepth(19)
      .setStrokeStyle(2, 0xc9a227)
      .setVisible(false);
    this.timingBarFill = this.add
      .rectangle(cx - 140, viewH / 2 + 100, 0, 16, 0xffffff)
      .setOrigin(0, 0.5)
      .setDepth(20)
      .setVisible(false);

    // Full skill roster (all six) — unaffordable ones stay visible but dimmed.
    this.abilityRow = this.add.container(0, 0).setDepth(40);
    this.abilityButtons = [];
    for (let i = 0; i < ABILITIES.length; i++) {
      const bg = this.add
        .rectangle(0, 0, 128, 48, 0x243448)
        .setStrokeStyle(2, 0xc9a227)
        .setInteractive({ useHandCursor: true });
      const costBadge = this.add.rectangle(0, 0, 34, 16, 0x0a1018).setStrokeStyle(1, 0x74b9ff);
      const costText = this.add.text(0, 0, '', { ...FONT_SM, fontSize: '11px', color: '#74b9ff' }).setOrigin(0.5);
      const label = this.add
        .text(0, 0, '', { ...FONT_SM, fontSize: '12px', color: '#efe8ff', align: 'center' })
        .setOrigin(0.5);
      this.abilityRow.add([bg, costBadge, costText, label]);
      const slot = { bg, costBadge, costText, label, ability: null as AbilityDef | null };
      this.abilityButtons.push(slot);
      bg.on('pointerover', () => {
        if (!slot.ability || !this.combat) return;
        if (!canAffordAbility(slot.ability, this.combat.mana)) return;
        bg.setFillStyle(0x3a5068);
      });
      bg.on('pointerout', () => {
        if (!slot.ability || !this.combat) return;
        this.styleAbilitySlot(slot, canAffordAbility(slot.ability, this.combat.mana));
      });
      bg.on('pointerdown', () => {
        if (this.mode !== 'battle' || !this.combat || this.combat.combatPhase !== 'your-turn') return;
        if (this.time.now < this.ignoreClicksUntil) return;
        if (!slot.ability) return;
        if (!canAffordAbility(slot.ability, this.combat.mana)) {
          toast(
            this,
            this.cameras.main.width / 2,
            this.cameras.main.height - 130,
            `Need ${slot.ability.mana} mana`,
            '#ffb3d1',
          );
          return;
        }
        this.chooseAbility(slot.ability);
      });
    }
    markAsUi(this, this.abilityRow);

    // Dodge / parry — large left/right halves.
    const zoneH = 88;
    const zoneY = viewH - 52;
    this.dodgeZone = this.add
      .rectangle(viewW * 0.25, zoneY, viewW * 0.46, zoneH, 0x0d3a55, 0.82)
      .setStrokeStyle(3, 0x5dade2)
      .setDepth(38)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.parryZone = this.add
      .rectangle(viewW * 0.75, zoneY, viewW * 0.46, zoneH, 0x4a1530, 0.82)
      .setStrokeStyle(3, 0xff7fab)
      .setDepth(38)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.dodgeLabel = this.add
      .text(viewW * 0.25, zoneY - 12, '←  DODGE', { ...FONT_XL, fontSize: '22px', color: '#5dade2' })
      .setOrigin(0.5)
      .setDepth(39)
      .setVisible(false);
    this.dodgeSub = this.add
      .text(viewW * 0.25, zoneY + 14, 'X  ·  wide window  ·  safe', { ...FONT_SM, color: '#8ecae6' })
      .setOrigin(0.5)
      .setDepth(39)
      .setVisible(false);
    this.parryLabel = this.add
      .text(viewW * 0.75, zoneY - 12, 'PARRY  →', { ...FONT_XL, fontSize: '22px', color: '#ff7fab' })
      .setOrigin(0.5)
      .setDepth(39)
      .setVisible(false);
    this.parrySub = this.add
      .text(viewW * 0.75, zoneY + 14, 'C  ·  tight  ·  +mana  ·  counter', { ...FONT_SM, color: '#ffb3d1' })
      .setOrigin(0.5)
      .setDepth(39)
      .setVisible(false);
    this.dodgeZone.on('pointerdown', () => this.tryDefense('dodge'));
    this.parryZone.on('pointerdown', () => this.tryDefense('parry'));

    // Back chip.
    const back = this.add
      .text(viewW - 20, 18, '← Back', { ...FONT_SM, color: '#a89bc4' })
      .setOrigin(1, 0)
      .setDepth(50)
      .setInteractive({ useHandCursor: true });
    markAsUi(this, back);
    back.on('pointerdown', () => this.leave());

    const kb = this.input.keyboard!;
    this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyX = kb.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.keyC = kb.addKey(Phaser.Input.Keyboard.KeyCodes.C);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.mode !== 'battle' || !this.combat) return;
      if (this.time.now < this.ignoreClicksUntil) return;
      if (this.combat.combatPhase === 'sweep' && this.sweepActive) {
        this.handleSweepTap();
        return;
      }
      if (this.combat.combatPhase === 'their-turn-hit') {
        const action: DefenseAction = pointer.x < viewW / 2 ? 'dodge' : 'parry';
        this.tryDefense(action);
      }
    });

    this.cameraZoom = attachCameraZoom(this, {
      kind: 'game',
      isBlocked: () => this.menuOpen,
      onPinchStart: () => {
        this.ignoreClicksUntil = this.time.now + 200;
      },
    });
    this.layoutAbilityRow();
    this.openBossMenu();
  }

  private leave() {
    this.scene.start('EastPark', { spawn: 'expedition' });
  }

  private fitBossSprite() {
    const tex = this.bossSprite.texture;
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const h = (src as HTMLImageElement).height || (src as HTMLCanvasElement).height || 80;
    this.bossSprite.setScale(BOSS_DISPLAY_H / Math.max(1, h));
    this.bossSprite.setOrigin(0.5, 1);
  }

  private ensureBossTexture(
    sprite: Phaser.GameObjects.Image,
    id: ExpeditionBossId,
    pose: BossPose,
  ) {
    const key = expeditionBossTextureKey(id, pose);
    if (this.textures.exists(key)) {
      sprite.setTexture(key);
      this.fitBossSprite();
      return;
    }
    const fallback = `exp-fallback-${id}-${pose}`;
    if (!this.textures.exists(fallback)) {
      const g = this.make.graphics({ x: 0, y: 0 });
      const colors: Record<ExpeditionBossId, number> = {
        gustave: 0xc4a574,
        maelle: 0xc45c5c,
        renoir: 0xd8d0c8,
      };
      g.fillStyle(colors[id], 1);
      g.fillRoundedRect(6, 6, 44, 68, 8);
      g.lineStyle(2, 0x1a1a2e, 1);
      g.strokeRoundedRect(6, 6, 44, 68, 8);
      g.fillStyle(0x1a1a2e, 1);
      g.fillCircle(20, 28, 3);
      g.fillCircle(36, 28, 3);
      g.generateTexture(fallback, 56, 80);
      g.destroy();
    }
    sprite.setTexture(fallback);
    this.fitBossSprite();
  }

  private setBossPose(pose: BossPose) {
    if (!this.combat) return;
    const p = pose === 'idle' && this.combat.phase === 3 ? 'enraged' : pose;
    this.ensureBossTexture(this.bossSprite, this.combat.bossId, p);
  }

  private setTurnBanner(text: string, color: string, show: boolean) {
    this.turnBannerBg.setVisible(show);
    this.turnBanner.setVisible(show);
    if (show) {
      this.turnBanner.setText(text).setColor(color);
      this.turnBanner.setScale(1.15);
      this.tweens.add({ targets: this.turnBanner, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
  }

  private openBossMenu() {
    this.mode = 'pick-boss';
    this.menuOpen = true;
    this.reopeningPicker = false;
    this.setTurnBanner('', '', false);
    this.showAbilityRow(false);
    this.showDefenseHalves(false);
    const options = BOSS_ORDER.map((id) => {
      const boss = BOSSES[id];
      const hp = scaledBossHp(boss.baseHp, 'normal');
      const beaten = (['easy', 'normal', 'hard'] as const).some((d) => State.expeditionWinCount(id, d) > 0);
      return {
        label: `${boss.name} · ${hp} HP${beaten ? ' ✓' : ''} — ${boss.blurb}`,
        onSelect: () => {
          this.bossId = id;
          this.ensureBossTexture(this.bossSprite, id, 'idle');
          this.openDifficultyMenu();
        },
      };
    });
    const menu = new Menu(this, 'Expedition', options, {
      subtitle: 'Pick an Expeditioner · then difficulty',
    });
    menu.onClose = () => {
      this.menuOpen = false;
      this.ignoreClicksUntil = this.time.now + 250;
      this.time.delayedCall(0, () => {
        // Selecting a boss sets mode to pick-diff before close — don't leave.
        if (this.mode === 'pick-boss' && !this.reopeningPicker) this.leave();
      });
    };
  }

  private openDifficultyMenu() {
    this.mode = 'pick-diff';
    this.menuOpen = true;
    this.reopeningPicker = true;
    const boss = BOSSES[this.bossId];
    const option = (difficulty: ExpeditionDifficulty) => {
      const cell = EXPEDITION_REWARDS[this.bossId][difficulty];
      const tired = !State.hasEnergy(cell.energy);
      const wins = State.expeditionWinCount(this.bossId, difficulty);
      const label = [
        difficulty[0]!.toUpperCase() + difficulty.slice(1),
        `${cell.energy} energy`,
        `${cell.coins} coins`,
        wins > 0 ? `✓×${wins}` : '',
        tired ? '— too tired!' : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return {
        label,
        disabled: tired,
        onSelect: () => this.beginBattle(difficulty),
      };
    };
    const minE = GAME_MIN_ENERGY.Expedition;
    const rested = State.hasEnergy(minE);
    const menu = new Menu(
      this,
      `${boss.name}`,
      [option('easy'), option('normal'), option('hard')],
      {
        subtitle: rested
          ? `HP ${scaledBossHp(boss.baseHp, 'normal')} base · Flawless +50% coins`
          : tooTiredMessage(State.data.petName, minE),
      },
    );
    menu.onClose = () => {
      this.menuOpen = false;
      this.ignoreClicksUntil = this.time.now + 250;
      this.time.delayedCall(0, () => {
        if (this.mode === 'pick-diff') {
          this.reopeningPicker = false;
          this.openBossMenu();
        }
      });
    };
  }

  private beginBattle(difficulty: ExpeditionDifficulty) {
    const cost = energyCost(this.bossId, difficulty);
    if (!State.hasEnergy(cost)) {
      this.menuOpen = false;
      this.reopeningPicker = true;
      this.time.delayedCall(0, () => this.openDifficultyMenu());
      return;
    }
    State.spendEnergy(cost);
    this.difficulty = difficulty;
    this.combat = createCombat(this.bossId, difficulty);
    this.mode = 'battle';
    this.menuOpen = false;
    this.setBossPose('idle');
    this.resetPetPose();
    this.refreshHud();
    this.enterYourTurn();
    toast(
      this,
      this.cameras.main.width / 2,
      175,
      `−${cost} energy · ${BOSSES[this.bossId].name} · ${difficulty}`,
      '#ffe066',
    );
  }

  private enterYourTurn() {
    this.setTurnBanner('YOUR TURN', '#a8e6cf', true);
    this.statusText.setText('All skills listed — grey ones need more mana · Nibble is free');
    this.showAbilityRow(true);
    this.showDefenseHalves(false);
    this.hideHitUi();
    this.hideAttackPreview();
    this.ringHint.setVisible(false);
  }

  private layoutAbilityRow() {
    const viewW = this.cameras.main.width;
    const viewH = this.cameras.main.height;
    // Two rows of three so every skill stays readable.
    const cols = 3;
    const gapX = 10;
    const w = 128;
    const totalW = cols * w + (cols - 1) * gapX;
    const startX = (viewW - totalW) / 2 + w / 2;
    const row0Y = viewH - 100;
    const row1Y = viewH - 48;
    this.abilityButtons.forEach((slot, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (w + gapX);
      const y = row === 0 ? row0Y : row1Y;
      slot.bg.setPosition(x, y);
      slot.label.setPosition(x, y + 6);
      slot.costBadge.setPosition(x, y - 14);
      slot.costText.setPosition(x, y - 14);
    });
  }

  private styleAbilitySlot(
    slot: {
      bg: Phaser.GameObjects.Rectangle;
      costBadge: Phaser.GameObjects.Rectangle;
      costText: Phaser.GameObjects.Text;
      label: Phaser.GameObjects.Text;
      ability: AbilityDef | null;
    },
    affordable: boolean,
  ) {
    const ability = slot.ability;
    if (!ability) return;
    if (affordable) {
      const free = ability.mana === 0;
      slot.bg.setFillStyle(free ? 0x1e3a2e : 0x243448).setAlpha(1);
      slot.bg.setStrokeStyle(2, free ? 0x5ed6a0 : 0xc9a227);
      slot.label.setColor('#efe8ff').setAlpha(1);
      slot.costText.setColor(free ? '#a8e6cf' : '#74b9ff').setAlpha(1);
      slot.costBadge.setStrokeStyle(1, free ? 0x5ed6a0 : 0x74b9ff).setAlpha(1);
      slot.bg.setInteractive({ useHandCursor: true });
    } else {
      slot.bg.setFillStyle(0x1a1a28).setAlpha(0.55);
      slot.bg.setStrokeStyle(2, 0x3d3d5c);
      slot.label.setColor('#6a6a80').setAlpha(0.75);
      slot.costText.setColor('#6a6a80').setAlpha(0.75);
      slot.costBadge.setStrokeStyle(1, 0x3d3d5c).setAlpha(0.75);
    }
  }

  private showAbilityRow(show: boolean) {
    this.abilityRow.setVisible(show);
    if (!show || !this.combat) return;
    const mana = this.combat.mana;
    this.abilityButtons.forEach((slot, i) => {
      const ability = ABILITIES[i] ?? null;
      slot.ability = ability;
      const vis = Boolean(ability);
      slot.bg.setVisible(vis);
      slot.label.setVisible(vis);
      slot.costBadge.setVisible(vis);
      slot.costText.setVisible(vis);
      if (!ability) return;
      slot.label.setText(ability.name);
      slot.costText.setText(ability.mana === 0 ? 'FREE' : `${ability.mana}◆`);
      this.styleAbilitySlot(slot, canAffordAbility(ability, mana));
    });
  }

  private showDefenseHalves(show: boolean) {
    this.dodgeZone.setVisible(show);
    this.parryZone.setVisible(show);
    this.dodgeLabel.setVisible(show);
    this.parryLabel.setVisible(show);
    this.dodgeSub.setVisible(show);
    this.parrySub.setVisible(show);
    this.defensePulse?.stop();
    if (show) {
      this.dodgeZone.setAlpha(0.82);
      this.parryZone.setAlpha(0.82);
      this.defensePulse = this.tweens.add({
        targets: [this.dodgeZone, this.parryZone],
        alpha: 0.95,
        duration: 420,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private hideHitUi() {
    this.hitCue.setVisible(false);
    this.hitCounterText.setVisible(false);
    this.hitTypeText.setVisible(false);
    this.timingBarBg.setVisible(false);
    this.timingBarFill.setVisible(false);
    this.countdownText.setVisible(false);
    this.edgeFlashL.setVisible(false).setAlpha(0);
    this.edgeFlashR.setVisible(false).setAlpha(0);
    this.activeHitSlot = -1;
    for (const slot of this.hitCircles) {
      this.tweens.killTweensOf(slot.fill);
      this.tweens.killTweensOf(slot.ring);
      slot.fill.setVisible(false).setScale(1).setAlpha(1);
      slot.ring.setVisible(false).setScale(1).setAlpha(0);
      slot.label.setVisible(false);
    }
  }

  /** Lay out N equal circles near the centre for this chain. */
  private layoutHitCircles(count: number, kinds: Array<'normal' | 'gradient'>) {
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2 - 10;
    const n = Math.min(count, HIT_SLOT_MAX);
    for (let i = 0; i < HIT_SLOT_MAX; i++) {
      const slot = this.hitCircles[i]!;
      if (i >= n) {
        slot.fill.setVisible(false);
        slot.ring.setVisible(false);
        slot.label.setVisible(false);
        continue;
      }
      // Evenly around centre so each hit owns a different screen patch.
      const ang = Phaser.Math.DegToRad(-90 + (i / n) * 360 + 180 / n);
      const hx = cx + Math.cos(ang) * HIT_RING_R;
      const hy = cy + Math.sin(ang) * HIT_RING_R;
      slot.x = hx;
      slot.y = hy;
      const isGrad = kinds[i] === 'gradient';
      const color = isGrad ? 0xff3333 : 0xffffff;
      slot.fill.setPosition(hx, hy).setRadius(HIT_CIRCLE_R);
      slot.fill.setFillStyle(color, 0.1).setStrokeStyle(4, color, 0.75);
      slot.fill.setVisible(true).setScale(1).setAlpha(0.55);
      slot.ring.setPosition(hx, hy).setRadius(HIT_CIRCLE_R + 12);
      slot.ring.setStrokeStyle(3, 0xffe066, 0).setVisible(true).setAlpha(0);
      slot.label
        .setPosition(hx, hy)
        .setText(isGrad ? '!' : `${i + 1}`)
        .setColor(isGrad ? '#ff6666' : '#efe8ff')
        .setVisible(true)
        .setAlpha(0.7);
    }
  }

  private activateHitCircle(index: number, kind: 'normal' | 'gradient', preMs: number) {
    const slot = this.hitCircles[index];
    if (!slot) return;
    this.activeHitSlot = index;
    const isGrad = kind === 'gradient';
    const color = isGrad ? 0xff3333 : 0xffffff;
    // Dim siblings; light this one.
    this.hitCircles.forEach((s, i) => {
      if (i === index) return;
      if (s.fill.visible) s.fill.setAlpha(0.25);
      s.label.setAlpha(0.35);
    });
    slot.fill.setFillStyle(color, 0.28).setStrokeStyle(6, color, 1).setAlpha(1).setScale(0.7);
    slot.label.setAlpha(1).setColor(isGrad ? '#ff4444' : '#ffffff');
    slot.ring.setStrokeStyle(4, isGrad ? 0xff6666 : 0xffe066, 1).setAlpha(1).setScale(0.6);
    this.tweens.killTweensOf(slot.fill);
    this.tweens.killTweensOf(slot.ring);
    this.tweens.add({
      targets: slot.fill,
      scale: 1.15,
      duration: preMs,
      ease: 'Cubic.easeOut',
    });
    this.tweens.add({
      targets: slot.ring,
      scale: 1.45,
      alpha: 0.15,
      duration: preMs,
      ease: 'Cubic.easeOut',
    });
    // Move countdown onto this circle.
    this.countdownText.setPosition(slot.x, slot.y - HIT_CIRCLE_R - 22).setVisible(true);
  }

  private resolveHitCircle(index: number, success: boolean) {
    const slot = this.hitCircles[index];
    if (!slot) return;
    this.tweens.killTweensOf(slot.fill);
    this.tweens.killTweensOf(slot.ring);
    slot.fill.setFillStyle(success ? 0x5ed6a0 : 0x555555, 0.5);
    slot.fill.setStrokeStyle(4, success ? 0xa8e6cf : 0x333333, 0.8);
    slot.fill.setScale(0.9).setAlpha(0.5);
    slot.ring.setAlpha(0);
    slot.label.setText(success ? '✓' : '✗').setColor(success ? '#a8e6cf' : '#888899');
  }

  private hideAttackPreview() {
    this.attackNameBg.setVisible(false);
    this.attackNameText.setVisible(false);
    this.chainPipRow.setVisible(false);
    this.chainPips.forEach((p) => p.destroy());
    this.chainPips = [];
    this.chainPipRow.removeAll(true);
  }

  /** Show the boss move name + a pip per hit in the chain (red = gradient). */
  private showAttackPreview(name: string, kinds: Array<'normal' | 'gradient'>) {
    this.attackNameBg.setVisible(true);
    this.attackNameText.setVisible(true).setText(name.toUpperCase());
    this.attackNameText.setScale(1.2);
    this.tweens.add({ targets: this.attackNameText, scale: 1, duration: 200, ease: 'Back.easeOut' });

    this.chainPips.forEach((p) => p.destroy());
    this.chainPips = [];
    this.chainPipRow.removeAll(true);
    this.chainPipRow.setVisible(true);
    const gap = 22;
    const start = -((kinds.length - 1) * gap) / 2;
    kinds.forEach((kind, i) => {
      const color = kind === 'gradient' ? 0xff3333 : 0xffffff;
      const pip = this.add
        .rectangle(start + i * gap, 0, 16, 16, color)
        .setStrokeStyle(2, kind === 'gradient' ? 0xffaaaa : 0xc9a227);
      this.chainPipRow.add(pip);
      this.chainPips.push(pip);
    });
  }

  private markChainPipResolved(index: number, success: boolean) {
    const pip = this.chainPips[index];
    if (!pip) return;
    pip.setFillStyle(success ? 0x5ed6a0 : 0x555555);
    pip.setAlpha(0.55);
    pip.setScale(0.75);
  }

  /** Slash / projectile line from A → B, then optional impact flash. */
  private flyAttackLine(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: number,
    onArrive?: () => void,
  ) {
    const line = this.add.graphics().setDepth(42);
    const mid = { t: 0 };
    this.tweens.add({
      targets: mid,
      t: 1,
      duration: 120,
      ease: 'Cubic.easeIn',
      onUpdate: () => {
        line.clear();
        const x = fromX + (toX - fromX) * mid.t;
        const y = fromY + (toY - fromY) * mid.t;
        line.lineStyle(6, color, 1);
        line.lineBetween(fromX, fromY, x, y);
        line.fillStyle(color, 1);
        line.fillCircle(x, y, 8);
        // Trail wedge.
        line.lineStyle(3, 0xffffff, 0.5);
        line.lineBetween(fromX, fromY, x, y);
      },
      onComplete: () => {
        line.destroy();
        onArrive?.();
      },
    });
  }

  private flashScreen(color: number, peakAlpha = 0.45, ms = 140) {
    this.tweens.killTweensOf(this.screenFlash);
    this.screenFlash.setVisible(true).setFillStyle(color, 1).setAlpha(peakAlpha);
    this.tweens.add({
      targets: this.screenFlash,
      alpha: 0,
      duration: ms,
      onComplete: () => {
        this.screenFlash.setVisible(false).setAlpha(1);
      },
    });
  }

  private chooseAbility(ability: AbilityDef) {
    if (!this.combat || this.combat.combatPhase !== 'your-turn') return;
    if (ability.mana > 0 && this.combat.mana < ability.mana) return;
    this.seed += 1;
    const sweep = buildSweep(ability.id, this.difficulty, this.seed);
    beginAbility(this.combat, ability, sweep);
    this.sweepLayout = this.combat.sweep;
    this.needleDeg = 0;
    this.sweepElapsed = 0;
    this.sweepActive = true;
    this.showAbilityRow(false);
    this.hideAttackPreview();
    this.setTurnBanner('TAP THE ARCS!', '#ffe066', true);
    this.statusText.setText(`${ability.name} — Space / click when the needle is in a blue arc`);
    this.ringHint.setText('TAP!').setVisible(true);
    // Announce the skill so the cast is obvious.
    this.attackNameBg.setVisible(true).setStrokeStyle(3, 0xc9a227);
    this.attackNameText.setVisible(true).setText(ability.name.toUpperCase()).setColor('#ffe066');
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'happy'));
    this.refreshHud();
  }

  private handleSweepTap() {
    if (!this.combat || !this.sweepLayout || !this.sweepActive) return;
    const result = onSweepTap(this.combat, this.needleDeg);
    if (result.kind === 'hit' || result.kind === 'perfect') {
      const perfect = result.kind === 'perfect';
      const color = perfect ? 0xffe066 : 0xa8e6cf;
      // Obvious pet → boss projectile.
      this.flyAttackLine(
        this.petSprite.x + 20,
        this.petSprite.y - 30,
        this.bossSprite.x,
        this.bossSprite.y - BOSS_DISPLAY_H * 0.55,
        color,
        () => {
          this.flashScreen(perfect ? 0xffe066 : 0xffffff, 0.28, 100);
          this.flashDamageNumber(
            this.bossSprite.x,
            this.bossSprite.y - BOSS_DISPLAY_H - 10,
            result.damage,
            perfect ? '#ffe066' : '#efe8ff',
          );
        },
      );
      this.setBossPose('hurt');
      this.tweens.add({
        targets: this.bossSprite,
        x: this.bossHomeX + 14,
        duration: 55,
        yoyo: true,
      });
      this.time.delayedCall(160, () => {
        if (this.sweepActive) this.setBossPose('idle');
      });
      this.tweens.add({
        targets: this.petSprite,
        x: this.petHomeX + 28,
        duration: 80,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    } else if (result.kind === 'miss' && result.reason === 'between') {
      // Soft miss feedback so tapping feels responsive.
      toast(this, this.cameras.main.width / 2, this.cameras.main.height / 2 + 90, 'miss', '#888899');
    }
  }

  private endSweep() {
    if (!this.combat || !this.sweepActive) return;
    this.sweepActive = false;
    const result = finishSweep(this.combat);
    this.sweepLayout = null;
    this.ringGfx.clear();
    this.ringHint.setVisible(false);
    this.hideAttackPreview();
    this.flashDamageNumber(
      this.bossSprite.x,
      this.bossSprite.y - BOSS_DISPLAY_H - 20,
      result.totalDamage,
      result.bravo ? '#ffe066' : '#ffb3d1',
    );
    if (result.bravo) {
      this.flashScreen(0xffe066, 0.35, 220);
      toast(this, this.cameras.main.width / 2, 170, 'Bravo! +1 mana', '#ffe066');
    }
    this.refreshHud();
    if (result.won) {
      this.onWin();
      return;
    }
    this.statusText.setText('');
    this.time.delayedCall(420, () => this.startBossTurn());
  }

  private startBossTurn() {
    if (!this.combat) return;
    this.seed += 1;
    const { attack, chain, tellMs, canvasHeal } = beginBossTurn(this.combat, this.seed);
    this.setBossPose('windup');
    this.showAbilityRow(false);
    this.showDefenseHalves(false);
    this.setTurnBanner('INCOMING!', '#ff7fab', true);
    const gradCount = chain.filter((h) => h.kind === 'gradient').length;
    this.statusText.setText(
      canvasHeal > 0
        ? `Canvas +${canvasHeal} HP!  ·  ${attack.name} · ${chain.length} hits`
        : `WIND-UP · ${chain.length} hit${chain.length === 1 ? '' : 's'}${gradCount ? ` · ${gradCount} RED` : ''}`,
    );
    // Name + pip strip + per-hit circles near centre.
    const kinds = chain.map((h) => h.kind);
    this.showAttackPreview(attack.name, kinds);
    this.layoutHitCircles(chain.length, kinds);
    this.refreshHud();
    this.pendingHitIndex = 0;
    // Boss grows / glows during tell.
    const baseSx = this.bossSprite.scaleX;
    const baseSy = this.bossSprite.scaleY;
    this.tweens.add({
      targets: this.bossSprite,
      scaleX: baseSx * 1.14,
      scaleY: baseSy * 1.14,
      duration: Math.max(200, tellMs * 0.85),
      yoyo: true,
    });
    this.bossSprite.setTint(0xffccaa);
    this.time.delayedCall(tellMs, () => {
      this.bossSprite.clearTint();
      if (!this.combat || this.combat.combatPhase === 'won' || this.combat.combatPhase === 'lost') {
        return;
      }
      startChainHits(this.combat);
      this.chainStartAt = this.time.now;
      this.setTurnBanner('NOW!', '#ffe066', true);
      this.statusText.setText('← X DODGE (wide)    C PARRY → (tight, +mana)    RED = dodge only');
      this.showDefenseHalves(true);
      this.scheduleHits();
    });
  }

  private scheduleHits() {
    if (!this.combat) return;
    const chain = this.combat.chain;
    const windows = defenseWindows(this.combat.difficulty, this.combat.phase);
    // Auto-miss only after the widest defense window closes — otherwise a late
    // but valid input is stolen and applied to the next hit (CodeRabbit).
    const autoMissSlack = windows.dodgeMs + 16;
    const PRE_MS = 320;
    for (let i = 0; i < chain.length; i++) {
      const hit = chain[i]!;
      this.time.delayedCall(hit.atMs + autoMissSlack, () => {
        if (!this.combat || this.combat.combatPhase !== 'their-turn-hit') return;
        if (this.pendingHitIndex !== i) return;
        this.resolveCurrentHit('none');
      });
      const pre = Math.max(0, hit.atMs - PRE_MS);
      this.time.delayedCall(pre, () => {
        if (!this.combat || this.combat.combatPhase !== 'their-turn-hit') return;
        if (this.pendingHitIndex > i) return;
        this.showHitCue(hit.kind, i, chain.length, hit.atMs, PRE_MS);
      });
    }
  }

  private showHitCue(
    kind: 'normal' | 'gradient',
    index: number,
    total: number,
    hitAtMs: number,
    preMs: number,
  ) {
    const isGrad = kind === 'gradient';
    const color = isGrad ? 0xff3333 : 0xffffff;
    // Highlight the pip about to fire.
    this.chainPips.forEach((pip, i) => {
      if (i === index) {
        pip.setScale(1.35);
        pip.setStrokeStyle(3, 0xffe066);
      } else if (i > index) {
        pip.setScale(1);
      }
    });

    // Activate this hit's own circle near the centre.
    this.activateHitCircle(index, kind, preMs);

    this.hitCounterText.setVisible(true).setText(`HIT  ${index + 1}  /  ${total}`);
    this.hitTypeText
      .setVisible(true)
      .setText(isGrad ? '⚠  DODGE ONLY  ⚠' : '◆  PARRY  or  DODGE  ◆')
      .setColor(isGrad ? '#ff4444' : '#efe8ff')
      .setScale(1.15);
    this.tweens.add({ targets: this.hitTypeText, scale: 1, duration: 160, ease: 'Back.easeOut' });

    this.countdownText.setColor(isGrad ? '#ff4444' : '#ffe066');

    // Side edge: blue = dodge, pink = parry; gradient only lights left.
    this.edgeFlashL.setVisible(true).setFillStyle(0x5dade2, isGrad ? 0.55 : 0.28);
    this.edgeFlashR.setVisible(true).setFillStyle(0xff7fab, isGrad ? 0.08 : 0.4);
    if (isGrad) {
      this.dodgeZone.setStrokeStyle(6, 0x5dade2);
      this.parryZone.setStrokeStyle(2, 0x442233);
      this.parryZone.setAlpha(0.35);
      this.dodgeZone.setAlpha(1);
      this.tweens.add({
        targets: this.edgeFlashL,
        alpha: 0.85,
        duration: 100,
        yoyo: true,
        repeat: 2,
      });
      this.pulseDefenseZone(this.dodgeZone, 0x5dade2);
    } else {
      this.dodgeZone.setStrokeStyle(4, 0x5dade2);
      this.parryZone.setStrokeStyle(4, 0xff7fab);
      this.dodgeZone.setAlpha(0.9);
      this.parryZone.setAlpha(0.9);
      this.pulseDefenseZone(this.dodgeZone, 0x5dade2);
      this.pulseDefenseZone(this.parryZone, 0xff7fab);
    }

    this.timingBarBg.setVisible(true);
    this.timingBarFill.setVisible(true).setFillStyle(color);
    this.timingBarFill.width = 0;
    this.nextHitAt = this.chainStartAt + hitAtMs;
  }

  private pulseDefenseZone(zone: Phaser.GameObjects.Rectangle, color: number) {
    this.tweens.add({
      targets: zone,
      scaleX: 1.04,
      scaleY: 1.08,
      duration: 120,
      yoyo: true,
      repeat: 1,
    });
    void color;
  }

  private tryDefense(action: DefenseAction) {
    if (!this.combat || this.combat.combatPhase !== 'their-turn-hit') return;
    if (this.time.now < this.inputLockedUntil) return;
    this.resolveCurrentHit(action);
  }

  private resolveCurrentHit(action: DefenseAction) {
    if (!this.combat || this.combat.combatPhase !== 'their-turn-hit') return;
    const hit = this.combat.chain[this.pendingHitIndex];
    if (!hit) return;
    const hitIndex = this.pendingHitIndex;

    const expectedAt = this.chainStartAt + hit.atMs;
    const offset = this.time.now - expectedAt;
    const inputOffset = action === 'none' ? 9999 : offset;
    void defenseWindows(this.combat.difficulty, this.combat.phase);

    this.setBossPose(hit.kind === 'gradient' ? 'special' : 'strike');
    // Big boss lunge + slash flying at the pet.
    this.tweens.add({
      targets: this.bossSprite,
      x: this.bossHomeX - 36,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeIn',
    });
    const slashColor = hit.kind === 'gradient' ? 0xff3333 : 0xffffff;
    this.flyAttackLine(
      this.bossSprite.x - 10,
      this.bossSprite.y - BOSS_DISPLAY_H * 0.55,
      this.petSprite.x + 10,
      this.petSprite.y - 20,
      slashColor,
    );

    const result = resolveDefense(this.combat, action, inputOffset);
    this.markChainPipResolved(hitIndex, result.success);
    this.resolveHitCircle(hitIndex, result.success);

    if (result.success) {
      if (action === 'dodge') this.playDodgeAnim();
      else this.playParryAnim(result.perfect);
    } else {
      this.flashScreen(hit.kind === 'gradient' ? 0xff2222 : 0xff6666, 0.4, 160);
      this.playHitTakenAnim(result.damageTaken);
    }

    this.pendingHitIndex += 1;
    this.inputLockedUntil = this.time.now + 90;
    this.refreshHud();
    // Keep resolved circles; clear active cue chrome only.
    this.hitCounterText.setVisible(false);
    this.hitTypeText.setVisible(false);
    this.timingBarBg.setVisible(false);
    this.timingBarFill.setVisible(false);
    this.countdownText.setVisible(false);
    this.edgeFlashL.setVisible(false).setAlpha(0);
    this.edgeFlashR.setVisible(false).setAlpha(0);
    this.activeHitSlot = -1;

    if (this.pendingHitIndex >= this.combat.chain.length) {
      this.showDefenseHalves(false);
      this.time.delayedCall(380, () => this.endBossChain());
    }
  }

  /** UI burst on the dodge half + pet slide. */
  private playDodgeAnim() {
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'jump'));
    // Zone UI: fill flash + expanding ring.
    this.dodgeZone.setFillStyle(0x1a6a9a, 0.95);
    this.tweens.add({
      targets: this.dodgeZone,
      alpha: 0.55,
      duration: 220,
      onComplete: () => {
        this.dodgeZone.setFillStyle(0x0d3a55, 0.82).setAlpha(0.9);
      },
    });
    if (this.dodgeBurst) {
      this.dodgeBurst
        .setVisible(true)
        .setPosition(this.dodgeZone.x, this.dodgeZone.y)
        .setScale(0.4)
        .setAlpha(1)
        .setStrokeStyle(5, 0x5dade2, 1);
      this.tweens.killTweensOf(this.dodgeBurst);
      this.tweens.add({
        targets: this.dodgeBurst,
        scale: 2.4,
        alpha: 0,
        duration: 280,
        ease: 'Cubic.easeOut',
        onComplete: () => this.dodgeBurst?.setVisible(false),
      });
    }
    this.dodgeLabel.setScale(1.2);
    this.tweens.add({ targets: this.dodgeLabel, scale: 1, duration: 180, ease: 'Back.easeOut' });

    const trail = this.add
      .image(this.petSprite.x, this.petSprite.y, this.petSprite.texture.key)
      .setScale(this.petSprite.scaleX)
      .setAlpha(0.45)
      .setTint(0x5dade2)
      .setDepth(7);
    this.tweens.add({
      targets: this.petSprite,
      x: this.petHomeX - 42,
      y: this.petHomeY - 16,
      duration: 110,
      yoyo: true,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.petSprite.setPosition(this.petHomeX, this.petHomeY);
      },
    });
    this.tweens.add({
      targets: trail,
      x: this.petHomeX - 50,
      alpha: 0,
      duration: 220,
      onComplete: () => trail.destroy(),
    });
    this.fxGfx.clear();
    this.fxGfx.lineStyle(3, 0x5dade2, 0.9);
    this.fxGfx.strokeCircle(this.petHomeX - 20, this.petHomeY - 20, 18);
    this.time.delayedCall(200, () => this.fxGfx.clear());
    toast(this, this.cameras.main.width / 2, 175, 'DODGE!', '#5dade2');
  }

  /** UI burst on the parry half + pet flash. */
  private playParryAnim(perfect: boolean) {
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'walk2'));
    this.petSprite.setTint(perfect ? 0xffe066 : 0xffb3d1);
    // Zone UI.
    this.parryZone.setFillStyle(perfect ? 0x6a4a10 : 0x6a2040, 0.95);
    this.tweens.add({
      targets: this.parryZone,
      alpha: 0.55,
      duration: 220,
      onComplete: () => {
        this.parryZone.setFillStyle(0x4a1530, 0.82).setAlpha(0.9);
      },
    });
    if (this.parryBurst) {
      this.parryBurst
        .setVisible(true)
        .setPosition(this.parryZone.x, this.parryZone.y)
        .setScale(0.4)
        .setAlpha(1)
        .setStrokeStyle(5, perfect ? 0xffe066 : 0xff7fab, 1);
      this.tweens.killTweensOf(this.parryBurst);
      this.tweens.add({
        targets: this.parryBurst,
        scale: 2.6,
        alpha: 0,
        duration: 300,
        ease: 'Cubic.easeOut',
        onComplete: () => this.parryBurst?.setVisible(false),
      });
    }
    this.parryLabel.setScale(1.2);
    this.tweens.add({ targets: this.parryLabel, scale: 1, duration: 180, ease: 'Back.easeOut' });

    this.tweens.add({
      targets: this.petSprite,
      x: this.petHomeX + 28,
      duration: 90,
      yoyo: true,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.petSprite.clearTint();
        this.petSprite.setPosition(this.petHomeX, this.petHomeY);
      },
    });
    const cx = this.petHomeX + 30;
    const cy = this.petHomeY - 24;
    this.fxGfx.clear();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const len = perfect ? 28 : 18;
      this.fxGfx.lineStyle(2, perfect ? 0xffe066 : 0xff7fab, 1);
      this.fxGfx.lineBetween(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    }
    this.fxGfx.lineStyle(4, 0xffffff, 0.85);
    this.fxGfx.strokeCircle(cx, cy, perfect ? 22 : 16);
    this.time.delayedCall(180, () => this.fxGfx.clear());
    toast(
      this,
      this.cameras.main.width / 2,
      175,
      perfect ? 'PERFECT PARRY! +2◆' : 'PARRY! +1◆',
      perfect ? '#ffe066' : '#ff7fab',
    );
  }

  private playHitTakenAnim(damage: number) {
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'sad'));
    this.petSprite.setTint(0xff4444);
    this.tweens.add({
      targets: this.petSprite,
      x: this.petHomeX - 16,
      duration: 60,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.petSprite.clearTint();
        this.petSprite.setPosition(this.petHomeX, this.petHomeY);
      },
    });
    if (damage > 0) {
      this.flashDamageNumber(this.petSprite.x, this.petSprite.y - 36, damage, '#ff6b6b');
      this.cameras.main.shake(90, 0.005);
    }
  }

  private resetPetPose() {
    this.petSprite.clearTint();
    this.petSprite.setPosition(this.petHomeX, this.petHomeY);
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'idle1'));
  }

  private endBossChain() {
    if (!this.combat) return;
    this.hideAttackPreview();
    this.hideHitUi();
    const result = finishBossChain(this.combat);
    if (result.counterDmg > 0) {
      this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'happy'));
      this.setBossPose('hurt');
      // Counter dash.
      this.tweens.add({
        targets: this.petSprite,
        x: this.bossHomeX - 40,
        duration: 140,
        yoyo: true,
        ease: 'Cubic.easeIn',
        onComplete: () => this.petSprite.setPosition(this.petHomeX, this.petHomeY),
      });
      this.flashDamageNumber(
        this.bossSprite.x,
        this.bossSprite.y - BOSS_DISPLAY_H - 10,
        result.counterDmg,
        '#ffe066',
      );
      toast(
        this,
        this.cameras.main.width / 2,
        165,
        result.allPerfect ? 'PERFECT COUNTER!' : 'COUNTER!',
        '#ffe066',
      );
    }
    this.refreshHud();
    if (result.lost) {
      this.onLoss();
      return;
    }
    if (result.won) {
      this.onWin();
      return;
    }
    this.time.delayedCall(520, () => {
      if (!this.combat) return;
      this.setBossPose('idle');
      this.resetPetPose();
      this.enterYourTurn();
      this.refreshHud();
    });
  }

  private onWin() {
    if (!this.combat || this.mode === 'won') return;
    this.mode = 'won';
    this.sweepActive = false;
    this.showAbilityRow(false);
    this.showDefenseHalves(false);
    this.hideHitUi();
    this.setBossPose('down');
    this.setTurnBanner('VICTORY!', '#ffe066', true);
    this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
    const flawless = this.combat.petHp >= this.combat.petMaxHp;
    const reward = State.rewardExpeditionWin(this.bossId, this.difficulty, flawless);
    this.statusText.setText(
      `+${reward.coins} coins · +${reward.happiness} happy${flawless ? ' · Flawless!' : ''}`,
    );
    this.time.delayedCall(1600, () => {
      this.menuOpen = true;
      let stayInScene = false;
      const menu = new Menu(
        this,
        'Expedition clear!',
        [
          {
            label: 'Fight again',
            onSelect: () => {
              stayInScene = true;
              this.menuOpen = false;
              this.openBossMenu();
            },
          },
          { label: 'Back outside', onSelect: () => this.leave() },
        ],
        {
          subtitle: `${BOSSES[this.bossId].name} · ${this.difficulty}${flawless ? ' · Flawless' : ''}`,
        },
      );
      menu.onClose = () => {
        this.menuOpen = false;
        // Menu.close always fires onClose after onSelect — don't leave on retry.
        if (!stayInScene && this.mode === 'won') this.leave();
      };
    });
  }

  private onLoss() {
    if (!this.combat || this.mode === 'lost') return;
    this.mode = 'lost';
    this.sweepActive = false;
    this.showAbilityRow(false);
    this.showDefenseHalves(false);
    this.hideHitUi();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'sad'));
    this.setBossPose('enraged');
    this.setTurnBanner('DEFEATED', '#ff6b6b', true);
    State.settleExpeditionLoss();
    this.statusText.setText('Energy spent. Rest and try again.');
    this.time.delayedCall(1400, () => {
      this.menuOpen = true;
      let stayInScene = false;
      const canRetry = State.hasEnergy(GAME_MIN_ENERGY.Expedition);
      const menu = new Menu(
        this,
        'Expedition lost',
        [
          ...(canRetry
            ? [
                {
                  label: 'Try again',
                  onSelect: () => {
                    stayInScene = true;
                    this.menuOpen = false;
                    this.openBossMenu();
                  },
                },
              ]
            : []),
          { label: 'Back outside', onSelect: () => this.leave() },
        ],
        {
          subtitle: canRetry
            ? 'Energy already spent · small happiness ding'
            : tooTiredMessage(State.data.petName, GAME_MIN_ENERGY.Expedition),
        },
      );
      menu.onClose = () => {
        this.menuOpen = false;
        if (!stayInScene && this.mode === 'lost') this.leave();
      };
    });
  }

  private refreshHud() {
    if (!this.combat) return;
    const c = this.combat;
    const boss = BOSSES[c.bossId];
    this.bossNameText.setText(boss.name.toUpperCase());
    const phaseDef = boss.phases.find((p) => p.phase === c.phase);
    this.bossPhaseText.setText(
      `Act ${['I', 'II', 'III'][c.phase - 1]} — ${phaseDef?.title ?? ''}`,
    );
    const bossFrac = c.bossMaxHp > 0 ? c.bossHp / c.bossMaxHp : 0;
    this.bossHpFill.width = 260 * bossFrac;
    this.bossHpLabel.setText(`${c.bossHp} / ${c.bossMaxHp}`);
    // Phase pips: lit for current and past.
    this.phasePips.forEach((pip, i) => {
      const phase = (i + 1) as 1 | 2 | 3;
      pip.setFillStyle(c.phase >= phase ? 0xc9a227 : 0x3d3d5c);
    });
    const petFrac = c.petMaxHp > 0 ? c.petHp / c.petMaxHp : 0;
    this.petHpFill.width = 220 * petFrac;
    this.petHpLabel.setText(`${c.petHp} / ${c.petMaxHp}`);
    const filled = '◆'.repeat(c.mana);
    const empty = '◇'.repeat(MANA_CAP - c.mana);
    this.manaText.setText(`MANA  ${filled}${empty}  ${c.mana}/${MANA_CAP}`);
    if (c.bossId === 'gustave') {
      this.chargeText.setText(`CHARGE  ${'●'.repeat(c.charge)}${'○'.repeat(3 - c.charge)}`);
      this.stanceText.setText('');
    } else if (c.bossId === 'maelle') {
      this.chargeText.setText('');
      this.stanceText.setText(`STANCE  ${c.stance.toUpperCase()}`);
    } else {
      this.chargeText.setText(c.lastChainFullyParried ? 'CANVAS  held' : 'CANVAS  active');
      this.stanceText.setText('');
    }
  }

  private flashDamageNumber(x: number, y: number, amount: number, color: string) {
    const t = this.add
      .text(x, y, `−${amount}`, { fontFamily: 'monospace', fontSize: '22px', color, stroke: '#0a1018', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(55);
    this.tweens.add({
      targets: t,
      y: y - 48,
      alpha: 0,
      duration: 750,
      onComplete: () => t.destroy(),
    });
  }

  private drawSweepRing() {
    this.ringGfx.clear();
    if (!this.sweepActive || !this.sweepLayout) return;
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2 - 10;
    const r = 88;
    // Outer track.
    this.ringGfx.lineStyle(6, 0x2a3a4a, 1);
    this.ringGfx.strokeCircle(cx, cy, r);
    this.ringGfx.lineStyle(2, 0xc9a227, 0.5);
    this.ringGfx.strokeCircle(cx, cy, r + 8);
    for (const arc of this.sweepLayout.arcs) {
      let color = 0x5dade2;
      if (arc.result === 'perfect') color = 0xffe066;
      else if (arc.result === 'hit') color = 0xa8e6cf;
      else if (arc.result === 'miss') color = 0x444455;
      this.ringGfx.lineStyle(14, color, arc.consumed ? 0.4 : 1);
      this.drawArc(cx, cy, r, arc.startDeg, arc.widthDeg);
      // Perfect band highlight.
      if (!arc.consumed) {
        this.ringGfx.lineStyle(4, 0xffe066, 0.55);
        const half = arc.perfectHalfWidthDeg;
        this.drawArc(cx, cy, r, arc.perfectCenterDeg - half, half * 2);
      }
    }
    // Needle.
    const rad = Phaser.Math.DegToRad(this.needleDeg - 90);
    const nx = cx + Math.cos(rad) * (r - 2);
    const ny = cy + Math.sin(rad) * (r - 2);
    this.ringGfx.lineStyle(3, 0xffffff, 0.9);
    this.ringGfx.lineBetween(cx, cy, nx, ny);
    this.ringGfx.fillStyle(0xffe066, 1);
    this.ringGfx.fillCircle(nx, ny, 8);
    this.ringGfx.fillStyle(0xffffff, 1);
    this.ringGfx.fillCircle(cx, cy, 5);
  }

  private drawArc(cx: number, cy: number, r: number, startDeg: number, widthDeg: number) {
    const start = Phaser.Math.DegToRad(startDeg - 90);
    const end = Phaser.Math.DegToRad(startDeg + widthDeg - 90);
    this.ringGfx.beginPath();
    this.ringGfx.arc(cx, cy, r, start, end, false);
    this.ringGfx.strokePath();
  }

  update(_time: number, delta: number) {
    if (this.mode !== 'battle' || !this.combat) {
      if (Phaser.Input.Keyboard.JustDown(this.keyEsc) && !this.menuOpen) this.leave();
      return;
    }

    if (this.sweepActive && this.sweepLayout) {
      this.sweepElapsed += delta;
      const speed = this.sweepLayout.needleSpeedDegPerSec;
      this.needleDeg = (this.sweepElapsed / 1000) * speed;
      if (this.needleDeg >= 360) {
        this.needleDeg = 360;
        this.drawSweepRing();
        this.endSweep();
      } else {
        this.drawSweepRing();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keySpace)) this.handleSweepTap();
    }

    // Timing bar + countdown pulse toward next hit.
    if (
      this.combat.combatPhase === 'their-turn-hit' &&
      this.timingBarFill.visible &&
      this.nextHitAt > 0
    ) {
      const remain = this.nextHitAt - this.time.now;
      const window = 320;
      const t = Phaser.Math.Clamp(1 - remain / window, 0, 1);
      this.timingBarFill.width = 280 * t;
      if (this.countdownText.visible) {
        if (remain > 200) this.countdownText.setText('3');
        else if (remain > 100) this.countdownText.setText('2');
        else if (remain > 0) this.countdownText.setText('1');
        else this.countdownText.setText('!');
      }
    }

    if (this.combat.combatPhase === 'their-turn-hit') {
      if (Phaser.Input.Keyboard.JustDown(this.keyX)) this.tryDefense('dodge');
      if (Phaser.Input.Keyboard.JustDown(this.keyC)) this.tryDefense('parry');
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) && !this.menuOpen) this.leave();
  }
}
