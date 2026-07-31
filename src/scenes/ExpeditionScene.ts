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
  energyCost,
  offeredAbilities,
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
const FONT_LG = { fontFamily: 'monospace', fontSize: '18px', color: '#ffe066' };

const POSES = ['idle', 'windup', 'strike', 'special', 'hurt', 'enraged', 'down'] as const;
export type BossPose = (typeof POSES)[number];

export function expeditionBossTextureKey(id: ExpeditionBossId, pose: BossPose): string {
  return `exp-${id}-${pose}`;
}

type Mode = 'pick-boss' | 'pick-diff' | 'battle' | 'won' | 'lost';

/**
 * Expedition — Clair Obscur-style single-combatant duel on the East Green.
 *
 * Your turn: pick an ability (offer is a pure function of mana), then land
 * taps as a needle sweeps a ring. Their turn: dodge (X / left) or parry
 * (C / right) a chain of timed hits.
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
  private bossSprite!: Phaser.GameObjects.Image;
  private bossNameText!: Phaser.GameObjects.Text;
  private bossPhaseText!: Phaser.GameObjects.Text;
  private bossHpFill!: Phaser.GameObjects.Rectangle;
  private bossHpLabel!: Phaser.GameObjects.Text;
  private petNameText!: Phaser.GameObjects.Text;
  private petHpFill!: Phaser.GameObjects.Rectangle;
  private petHpLabel!: Phaser.GameObjects.Text;
  private manaText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private chargeText!: Phaser.GameObjects.Text;
  private stanceText!: Phaser.GameObjects.Text;

  private ringGfx!: Phaser.GameObjects.Graphics;
  private abilityRow!: Phaser.GameObjects.Container;
  private abilityButtons: {
    bg: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    ability: AbilityDef | null;
  }[] = [];
  private dodgeZone!: Phaser.GameObjects.Rectangle;
  private parryZone!: Phaser.GameObjects.Rectangle;
  private dodgeLabel!: Phaser.GameObjects.Text;
  private parryLabel!: Phaser.GameObjects.Text;
  private hitCue!: Phaser.GameObjects.Rectangle;

  private sweepLayout: SweepLayout | null = null;
  private needleDeg = 0;
  private sweepElapsed = 0;
  private sweepActive = false;
  private chainStartAt = 0;
  private tellEndsAt = 0;
  private pendingHitIndex = 0;
  private inputLockedUntil = 0;
  private seed = 1;

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
    this.cameras.main.setBackgroundColor('#0f1a26');

    // Arena backdrop — cool canvas hall.
    this.add.rectangle(cx, 80, viewW, 160, 0x1a2838);
    this.add.rectangle(cx, viewH / 2, viewW, viewH, 0x152030).setDepth(0);
    this.add.rectangle(cx, viewH - 70, viewW, 140, 0x0e1824).setDepth(1);
    // Soft vignette bars.
    this.add.rectangle(cx, 8, viewW, 4, 0x7ed6a8).setDepth(2);
    this.add.rectangle(cx, viewH - 4, viewW, 4, 0xff7fab).setDepth(2);

    // Boss (top-right).
    this.bossSprite = this.add
      .image(viewW - 90, 150, expeditionBossTextureKey('gustave', 'idle'))
      .setDepth(5)
      .setScale(2.4);
    this.ensureBossTexture(this.bossSprite, 'gustave', 'idle');

    // Pet (bottom-left).
    const petKey = petTextureKey(State.data.petSpecies, 'idle1');
    this.petSprite = this.add
      .sprite(90, viewH - 160, petKey)
      .setDepth(5)
      .setScale(petDrawScale(this, State.data.petSpecies) * 1.35);

    // HUD texts.
    this.bossNameText = this.add.text(16, 16, '', { ...FONT_LG, color: '#ffb3d1' }).setDepth(20);
    this.bossPhaseText = this.add.text(16, 40, '', { ...FONT_SM, color: '#a8e6cf' }).setDepth(20);
    this.add.rectangle(16, 66, 220, 12, 0x3d3d5c).setOrigin(0, 0.5).setDepth(20);
    this.bossHpFill = this.add.rectangle(16, 66, 220, 12, 0xff6b6b).setOrigin(0, 0.5).setDepth(21);
    this.bossHpLabel = this.add.text(242, 58, '', FONT_SM).setDepth(20);

    this.petNameText = this.add
      .text(16, viewH - 120, State.data.petName || 'Pet', { ...FONT, color: '#a8e6cf' })
      .setDepth(20);
    this.add.rectangle(16, viewH - 96, 200, 12, 0x3d3d5c).setOrigin(0, 0.5).setDepth(20);
    this.petHpFill = this.add.rectangle(16, viewH - 96, 200, 12, 0x7ed6a8).setOrigin(0, 0.5).setDepth(21);
    this.petHpLabel = this.add.text(222, viewH - 104, '', FONT_SM).setDepth(20);
    this.manaText = this.add.text(16, viewH - 78, '', { ...FONT_SM, color: '#74b9ff' }).setDepth(20);
    this.chargeText = this.add.text(viewW - 200, 40, '', { ...FONT_SM, color: '#ffe066' }).setDepth(20);
    this.stanceText = this.add.text(viewW - 200, 58, '', { ...FONT_SM, color: '#ffb3d1' }).setDepth(20);
    this.statusText = this.add
      .text(cx, viewH / 2 - 120, '', { ...FONT, color: '#efe8ff' })
      .setOrigin(0.5)
      .setDepth(25);

    this.ringGfx = this.add.graphics().setDepth(15);
    this.hitCue = this.add
      .rectangle(cx, viewH / 2 - 40, 48, 48, 0xffffff, 0)
      .setDepth(16)
      .setStrokeStyle(3, 0xffffff);

    // Ability row (3 slots).
    this.abilityRow = this.add.container(0, 0).setDepth(30);
    this.abilityButtons = [];
    for (let i = 0; i < 3; i++) {
      const bg = this.add
        .rectangle(0, 0, 150, 44, 0x2e4258)
        .setStrokeStyle(2, 0x5d7a90)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(0, 0, '', { ...FONT_SM, color: '#efe8ff' }).setOrigin(0.5);
      this.abilityRow.add([bg, label]);
      const slot = { bg, label, ability: null as AbilityDef | null };
      this.abilityButtons.push(slot);
      bg.on('pointerdown', () => {
        if (this.mode !== 'battle' || !this.combat || this.combat.combatPhase !== 'your-turn') return;
        if (this.time.now < this.ignoreClicksUntil) return;
        if (slot.ability) this.chooseAbility(slot.ability);
      });
    }
    markAsUi(this, this.abilityRow);

    // Dodge / parry halves — only live on their turn.
    this.dodgeZone = this.add
      .rectangle(viewW * 0.25, viewH - 36, viewW * 0.48, 56, 0x1a3a4a, 0.55)
      .setStrokeStyle(2, 0x5dade2)
      .setDepth(28)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.parryZone = this.add
      .rectangle(viewW * 0.75, viewH - 36, viewW * 0.48, 56, 0x3a1a2a, 0.55)
      .setStrokeStyle(2, 0xff7fab)
      .setDepth(28)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.dodgeLabel = this.add
      .text(viewW * 0.25, viewH - 36, '← DODGE  X', { ...FONT, color: '#5dade2' })
      .setOrigin(0.5)
      .setDepth(29)
      .setVisible(false);
    this.parryLabel = this.add
      .text(viewW * 0.75, viewH - 36, 'PARRY  C →', { ...FONT, color: '#ff7fab' })
      .setOrigin(0.5)
      .setDepth(29)
      .setVisible(false);
    this.dodgeZone.on('pointerdown', () => this.tryDefense('dodge'));
    this.parryZone.on('pointerdown', () => this.tryDefense('parry'));

    // Back chip.
    const back = this.add
      .text(viewW - 16, 16, '← Back', { ...FONT_SM, color: '#a89bc4' })
      .setOrigin(1, 0)
      .setDepth(40)
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
      // Left/right halves for defense when zones are live.
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

  private ensureBossTexture(
    sprite: Phaser.GameObjects.Image,
    id: ExpeditionBossId,
    pose: BossPose,
  ) {
    const key = expeditionBossTextureKey(id, pose);
    if (this.textures.exists(key)) {
      sprite.setTexture(key);
      return;
    }
    // Fallback plate: coloured silhouette so the fight is playable without
    // Imagine plates (Boot may still be missing assets on first boot).
    const fallback = `exp-fallback-${id}-${pose}`;
    if (!this.textures.exists(fallback)) {
      const g = this.make.graphics({ x: 0, y: 0 });
      const colors: Record<ExpeditionBossId, number> = {
        gustave: 0xc4a574,
        maelle: 0xc45c5c,
        renoir: 0xd8d0c8,
      };
      const poseTint: Record<BossPose, number> = {
        idle: 0xffffff,
        windup: 0xffe066,
        strike: 0xffb3d1,
        special: 0xff4444,
        hurt: 0xaaaaaa,
        enraged: 0xff6b6b,
        down: 0x555555,
      };
      const base = colors[id];
      g.fillStyle(base, 1);
      g.fillRoundedRect(4, 4, 32, 48, 6);
      g.fillStyle(poseTint[pose], 0.35);
      g.fillRoundedRect(4, 4, 32, 48, 6);
      g.lineStyle(2, 0x1a1a2e, 1);
      g.strokeRoundedRect(4, 4, 32, 48, 6);
      // Face dots.
      g.fillStyle(0x1a1a2e, 1);
      g.fillCircle(14, 18, 2);
      g.fillCircle(26, 18, 2);
      g.generateTexture(fallback, 40, 56);
      g.destroy();
    }
    sprite.setTexture(fallback);
  }

  private setBossPose(pose: BossPose) {
    if (!this.combat) return;
    // Phase III idle uses enraged when standing.
    const p = pose === 'idle' && this.combat.phase === 3 ? 'enraged' : pose;
    this.ensureBossTexture(this.bossSprite, this.combat.bossId, p);
  }

  private openBossMenu() {
    this.mode = 'pick-boss';
    this.menuOpen = true;
    this.reopeningPicker = false;
    const options = BOSS_ORDER.map((id) => {
      const boss = BOSSES[id];
      const hp = scaledBossHp(boss.baseHp, 'normal');
      const beaten =
        (['easy', 'normal', 'hard'] as const).some((d) => State.expeditionWinCount(id, d) > 0);
      return {
        label: `${boss.name} · ${hp} HP${beaten ? ' ✓' : ''} — ${boss.blurb}`,
        onSelect: () => {
          this.bossId = id;
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
    this.refreshHud();
    this.showAbilityRow(true);
    this.showDefenseHalves(false);
    toast(
      this,
      this.cameras.main.width / 2,
      110,
      `−${cost} energy · ${BOSSES[this.bossId].name} · ${difficulty}`,
      '#ffe066',
    );
    this.statusText.setText('Your turn — pick an ability');
  }

  private layoutAbilityRow() {
    const viewW = this.cameras.main.width;
    const viewH = this.cameras.main.height;
    const y = viewH - 48;
    const gap = 12;
    const w = 150;
    const total = 3 * w + 2 * gap;
    const startX = (viewW - total) / 2 + w / 2;
    this.abilityButtons.forEach((slot, i) => {
      const x = startX + i * (w + gap);
      slot.bg.setPosition(x, y);
      slot.label.setPosition(x, y);
    });
  }

  private showAbilityRow(show: boolean) {
    this.abilityRow.setVisible(show);
    if (!show || !this.combat) return;
    const offer = offeredAbilities(this.combat.mana);
    this.abilityButtons.forEach((slot, i) => {
      const ability = offer[i] ?? null;
      slot.ability = ability;
      if (!ability) {
        slot.bg.setVisible(false);
        slot.label.setVisible(false);
        return;
      }
      slot.bg.setVisible(true);
      slot.label.setVisible(true);
      const diamond = ability.mana === 0 ? '0 ◆' : `${ability.mana} ◆`;
      slot.label.setText(`${ability.name}\n${diamond}`);
      slot.bg.setFillStyle(ability.mana === 0 ? 0x2e4a3a : 0x2e4258);
    });
  }

  private showDefenseHalves(show: boolean) {
    this.dodgeZone.setVisible(show);
    this.parryZone.setVisible(show);
    this.dodgeLabel.setVisible(show);
    this.parryLabel.setVisible(show);
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
    this.statusText.setText(`${ability.name} — tap the arcs!`);
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'happy'));
    this.refreshHud();
  }

  private handleSweepTap() {
    if (!this.combat || !this.sweepLayout || !this.sweepActive) return;
    const result = onSweepTap(this.combat, this.needleDeg);
    if (result.kind === 'hit' || result.kind === 'perfect') {
      this.flashDamageNumber(
        this.bossSprite.x,
        this.bossSprite.y - 40,
        result.damage,
        result.kind === 'perfect' ? '#ffe066' : '#efe8ff',
      );
      this.setBossPose('hurt');
      this.time.delayedCall(180, () => {
        if (this.sweepActive) this.setBossPose('idle');
      });
    }
  }

  private endSweep() {
    if (!this.combat || !this.sweepActive) return;
    this.sweepActive = false;
    const result = finishSweep(this.combat);
    this.sweepLayout = null;
    this.ringGfx.clear();
    this.flashDamageNumber(
      this.bossSprite.x,
      this.bossSprite.y - 60,
      result.totalDamage,
      result.bravo ? '#ffe066' : '#ffb3d1',
    );
    if (result.bravo) {
      toast(this, this.cameras.main.width / 2, 140, 'Bravo!', '#ffe066');
    }
    this.refreshHud();
    if (result.won) {
      this.onWin();
      return;
    }
    this.statusText.setText('…');
    this.time.delayedCall(450, () => this.startBossTurn());
  }

  private startBossTurn() {
    if (!this.combat) return;
    this.seed += 1;
    const { attack, chain, tellMs } = beginBossTurn(this.combat, this.seed);
    this.setBossPose('windup');
    this.showAbilityRow(false);
    this.showDefenseHalves(false);
    this.statusText.setText(`${attack.name} — ${chain.length} hits`);
    this.refreshHud();
    this.tellEndsAt = this.time.now + tellMs;
    this.pendingHitIndex = 0;
    // After tell, open the chain.
    this.time.delayedCall(tellMs, () => {
      if (!this.combat || this.combat.combatPhase === 'won' || this.combat.combatPhase === 'lost') {
        return;
      }
      startChainHits(this.combat);
      this.chainStartAt = this.time.now;
      this.showDefenseHalves(true);
      this.scheduleHits();
    });
  }

  private scheduleHits() {
    if (!this.combat) return;
    const chain = this.combat.chain;
    for (let i = 0; i < chain.length; i++) {
      const hit = chain[i]!;
      this.time.delayedCall(hit.atMs, () => {
        if (!this.combat || this.combat.combatPhase !== 'their-turn-hit') return;
        if (this.pendingHitIndex !== i) return;
        this.resolveCurrentHit('none');
      });
      // Colour cue slightly before the hit lands.
      this.time.delayedCall(Math.max(0, hit.atMs - 120), () => {
        if (!this.combat || this.combat.combatPhase !== 'their-turn-hit') return;
        const color = hit.kind === 'gradient' ? 0xff3333 : 0xffffff;
        this.hitCue.setStrokeStyle(4, color);
        this.hitCue.setFillStyle(color, 0.15);
        this.tweens.add({
          targets: this.hitCue,
          scaleX: 1.4,
          scaleY: 1.4,
          alpha: 0.2,
          duration: 140,
          yoyo: true,
          onComplete: () => {
            this.hitCue.setScale(1);
            this.hitCue.setFillStyle(0xffffff, 0);
          },
        });
      });
    }
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

    const windows = defenseWindows(this.combat.difficulty, this.combat.phase);
    const expectedAt = this.chainStartAt + hit.atMs;
    const offset = this.time.now - expectedAt;
    // If auto-timeout fired with action none, offset is ~0 from schedule — treat
    // as a miss by using a large offset when the player never pressed.
    const inputOffset = action === 'none' ? 9999 : offset;
    // Clamp "good enough" presses to window maths.
    void windows;

    this.setBossPose(hit.kind === 'gradient' ? 'special' : 'strike');
    const result = resolveDefense(this.combat, action, inputOffset);

    if (result.success) {
      if (action === 'dodge') {
        this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'jump'));
        toast(this, this.cameras.main.width / 2, 160, 'Dodge!', '#5dade2');
      } else {
        this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'walk2'));
        const tag = result.perfect ? 'Perfect Parry!' : 'Parry!';
        toast(this, this.cameras.main.width / 2, 160, tag, '#ff7fab');
      }
    } else {
      this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'sad'));
      if (result.damageTaken > 0) {
        this.flashDamageNumber(
          this.petSprite.x,
          this.petSprite.y - 30,
          result.damageTaken,
          '#ff6b6b',
        );
        this.cameras.main.shake(80, 0.004);
      }
    }

    this.pendingHitIndex += 1;
    this.inputLockedUntil = this.time.now + 80;
    this.refreshHud();

    if (this.pendingHitIndex >= this.combat.chain.length) {
      this.showDefenseHalves(false);
      this.time.delayedCall(280, () => this.endBossChain());
    }
  }

  private endBossChain() {
    if (!this.combat) return;
    const result = finishBossChain(this.combat);
    if (result.counterDmg > 0) {
      this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'happy'));
      this.setBossPose('hurt');
      this.flashDamageNumber(
        this.bossSprite.x,
        this.bossSprite.y - 50,
        result.counterDmg,
        '#ffe066',
      );
      toast(
        this,
        this.cameras.main.width / 2,
        140,
        result.allPerfect ? 'Perfect Counter!' : 'Counter!',
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
    this.time.delayedCall(500, () => {
      if (!this.combat) return;
      this.setBossPose('idle');
      this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'idle1'));
      this.showAbilityRow(true);
      this.statusText.setText('Your turn — pick an ability');
      this.refreshHud();
    });
  }

  private onWin() {
    if (!this.combat || this.mode === 'won') return;
    this.mode = 'won';
    this.sweepActive = false;
    this.showAbilityRow(false);
    this.showDefenseHalves(false);
    this.setBossPose('down');
    this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
    const flawless = this.combat.petHp >= this.combat.petMaxHp;
    const reward = State.rewardExpeditionWin(this.bossId, this.difficulty, flawless);
    this.statusText.setText(
      `Victory! +${reward.coins} coins · +${reward.happiness} happy${flawless ? ' · Flawless!' : ''}`,
    );
    this.time.delayedCall(1600, () => {
      this.menuOpen = true;
      const menu = new Menu(
        this,
        'Expedition clear!',
        [
          {
            label: 'Fight again',
            onSelect: () => {
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
        this.leave();
      };
    });
  }

  private onLoss() {
    if (!this.combat || this.mode === 'lost') return;
    this.mode = 'lost';
    this.sweepActive = false;
    this.showAbilityRow(false);
    this.showDefenseHalves(false);
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'sad'));
    this.setBossPose('enraged');
    State.settleExpeditionLoss();
    this.statusText.setText('Defeated… energy spent. Rest and try again.');
    this.time.delayedCall(1400, () => {
      this.menuOpen = true;
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
        this.leave();
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
    this.bossHpFill.width = 220 * bossFrac;
    this.bossHpLabel.setText(`${c.bossHp}/${c.bossMaxHp}`);
    const petFrac = c.petMaxHp > 0 ? c.petHp / c.petMaxHp : 0;
    this.petHpFill.width = 200 * petFrac;
    this.petHpLabel.setText(`${c.petHp}/${c.petMaxHp}`);
    const filled = '◆'.repeat(c.mana);
    const empty = '◇'.repeat(MANA_CAP - c.mana);
    this.manaText.setText(`mana ${filled}${empty}  ${c.mana}/${MANA_CAP}`);
    if (c.bossId === 'gustave') {
      this.chargeText.setText(`Charge ${'●'.repeat(c.charge)}${'○'.repeat(3 - c.charge)}`);
      this.stanceText.setText('');
    } else if (c.bossId === 'maelle') {
      this.chargeText.setText('');
      this.stanceText.setText(`Stance: ${c.stance}`);
    } else {
      this.chargeText.setText(c.lastChainFullyParried ? 'Canvas held' : 'Canvas active');
      this.stanceText.setText('');
    }
  }

  private flashDamageNumber(x: number, y: number, amount: number, color: string) {
    const t = this.add
      .text(x, y, `−${amount}`, { fontFamily: 'monospace', fontSize: '20px', color })
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 700,
      onComplete: () => t.destroy(),
    });
  }

  private drawSweepRing() {
    this.ringGfx.clear();
    if (!this.sweepActive || !this.sweepLayout) return;
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2 - 20;
    const r = 78;
    this.ringGfx.lineStyle(4, 0x3a5068, 1);
    this.ringGfx.strokeCircle(cx, cy, r);
    for (const arc of this.sweepLayout.arcs) {
      let color = 0x5dade2;
      if (arc.result === 'perfect') color = 0xffe066;
      else if (arc.result === 'hit') color = 0xa8e6cf;
      else if (arc.result === 'miss') color = 0x555555;
      this.ringGfx.lineStyle(10, color, arc.consumed ? 0.45 : 0.95);
      this.drawArc(cx, cy, r, arc.startDeg, arc.widthDeg);
    }
    // Needle.
    const rad = Phaser.Math.DegToRad(this.needleDeg - 90);
    const nx = cx + Math.cos(rad) * (r - 4);
    const ny = cy + Math.sin(rad) * (r - 4);
    this.ringGfx.fillStyle(0xffe066, 1);
    this.ringGfx.fillCircle(nx, ny, 6);
    this.ringGfx.lineStyle(2, 0xffffff, 0.8);
    this.ringGfx.lineBetween(cx, cy, nx, ny);
  }

  private drawArc(cx: number, cy: number, r: number, startDeg: number, widthDeg: number) {
    // Phaser arcs use radians, 0 = east, clockwise positive in some modes —
    // we treat 0° as top (12 o'clock) and sweep clockwise with the needle.
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

    if (this.combat.combatPhase === 'their-turn-hit') {
      if (Phaser.Input.Keyboard.JustDown(this.keyX)) this.tryDefense('dodge');
      if (Phaser.Input.Keyboard.JustDown(this.keyC)) this.tryDefense('parry');
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) && !this.menuOpen) this.leave();
  }
}
