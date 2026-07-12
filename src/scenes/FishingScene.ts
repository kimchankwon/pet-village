import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { ITEMS, State } from '../systems/GameState';
import { Menu, toast } from '../systems/UI';
import { isUiBlocked } from '../systems/nav';
import { petAnimKey, petTextureKey } from '../systems/pets';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };

type Mode = 'ready' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'catch' | 'done';

type FishTier = 'oceanfish-common' | 'oceanfish-uncommon' | 'oceanfish-rare';

const FISH_TIERS: {
  id: FishTier;
  weight: number;
  sizeMin: number;
  sizeMax: number;
  fight: number;
  label: string;
}[] = [
  { id: 'oceanfish-common', weight: 55, sizeMin: 12, sizeMax: 28, fight: 0.55, label: 'common' },
  { id: 'oceanfish-uncommon', weight: 30, sizeMin: 26, sizeMax: 48, fight: 0.85, label: 'uncommon' },
  { id: 'oceanfish-rare', weight: 15, sizeMin: 44, sizeMax: 78, fight: 1.15, label: 'rare' },
];

/**
 * Shore fishing minigame — cast → bite → reel tension. Catch = food item only
 * (no coins). Structure mirrors PaperTossScene.
 */
export class FishingScene extends Phaser.Scene {
  private mode: Mode = 'ready';
  private backBtn!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private petSprite!: Phaser.GameObjects.Sprite;
  private bobber!: Phaser.GameObjects.Image;
  private rod!: Phaser.GameObjects.Image;
  private biteBang!: Phaser.GameObjects.Text;
  private tensionFill!: Phaser.GameObjects.Rectangle;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private patienceFill!: Phaser.GameObjects.Rectangle;
  private meterRoot!: Phaser.GameObjects.Container;
  private menuOpen = false;
  private ignoreClicksUntil = 0;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private holding = false;
  private castPower = 0.55;
  private dragStart: { x: number; y: number; t: number } | null = null;
  private biteAt = 0;
  private biteDeadline = 0;
  private tension = 0;
  private progress = 0;
  private patience = 100;
  private fishFight = 0.7;
  private pendingFish: (typeof FISH_TIERS)[number] | null = null;
  private pendingSize = 0;
  private waterY = 310;
  private bobberHome = { x: 420, y: 360 };

  constructor() {
    super('Fishing');
  }

  create() {
    generateTextures(this);
    this.mode = 'ready';
    this.menuOpen = false;
    this.ignoreClicksUntil = 0;
    this.holding = false;
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

    this.bobber = this.add.image(210, 400, 'bobber').setScale(1.6).setDepth(15).setVisible(false);
    this.biteBang = this.add
      .text(0, 0, '!', { ...FONT, fontSize: '36px', color: '#ffe066', stroke: '#1a1a2e', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    this.buildMeters(cx);

    this.add.text(140, 16, 'SHORE FISHING', { ...FONT, fontSize: '18px', color: '#ffe066' });
    this.statusText = this.add.text(20, 44, '', FONT);
    this.bestText = this.add
      .text(viewW - 20, 16, `Best: ${State.data.biggestCatch || 0}cm`, { ...FONT, color: '#c8c8dc' })
      .setOrigin(1, 0);
    this.hintText = this.add
      .text(cx, viewH - 28, 'Tap / Space to cast · Hold to reel · Release when tension climbs', {
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
      if (this.mode === 'ready') {
        this.dragStart = { x: p.x, y: p.y, t: this.time.now };
      } else if (this.mode === 'bite') {
        this.hook();
      } else if (this.mode === 'reeling') {
        this.holding = true;
      } else if (this.mode === 'catch' || this.mode === 'done') {
        // panels handle their own buttons
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.menuOpen || isUiBlocked()) return;
      if (this.mode === 'ready' && this.dragStart) {
        const held = this.time.now - this.dragStart.t;
        const drag = Phaser.Math.Distance.Between(this.dragStart.x, this.dragStart.y, p.x, p.y);
        this.castPower = Phaser.Math.Clamp(0.4 + held / 900 + drag / 400, 0.35, 1);
        this.dragStart = null;
        this.cast();
      } else if (this.mode === 'reeling') {
        this.holding = false;
      }
    });

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
    this.meterRoot.add([bg, tLabel, tTrack, this.tensionFill, pLabel, pTrack, this.progressFill, wLabel, wTrack, this.patienceFill]);
  }

  private setReady() {
    this.mode = 'ready';
    this.holding = false;
    this.bobber.setVisible(false);
    this.biteBang.setVisible(false);
    this.meterRoot.setVisible(false);
    this.rod.setAngle(-18);
    this.statusText.setText('Ready to cast');
    this.hintText.setText('Tap / Space to cast · Short hold adds a little power');
    this.bestText.setText(`Best: ${State.data.biggestCatch || 0}cm`);
  }

  private cast() {
    if (this.mode !== 'ready') return;
    this.mode = 'casting';
    this.statusText.setText('Casting…');
    const reach = 180 + this.castPower * 160;
    const targetX = 250 + reach;
    const targetY = this.waterY + Phaser.Math.Between(-10, 40);
    this.bobberHome = { x: targetX, y: targetY };
    this.bobber.setPosition(200, 400).setVisible(true).setAlpha(1).setScale(1.6);
    this.tweens.add({
      targets: this.rod,
      angle: -55,
      duration: 180,
      yoyo: true,
    });
    this.tweens.add({
      targets: this.bobber,
      x: targetX,
      y: targetY,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => this.beginWait(),
    });
  }

  private beginWait() {
    this.mode = 'waiting';
    this.statusText.setText('Waiting for a bite…');
    this.hintText.setText('Watch the bobber — tap / Space when you see !');
    this.pendingFish = this.rollFish();
    this.fishFight = this.pendingFish.fight;
    const delay = Phaser.Math.Between(1400, 4200);
    this.biteAt = this.time.now + delay;
    // Idle bob
    this.tweens.add({
      targets: this.bobber,
      y: this.bobberHome.y + 6,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private rollFish() {
    const total = FISH_TIERS.reduce((s, t) => s + t.weight, 0);
    let roll = Math.random() * total;
    for (const tier of FISH_TIERS) {
      roll -= tier.weight;
      if (roll <= 0) return tier;
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
    this.biteDeadline = this.time.now + 900;
    this.tweens.add({
      targets: this.bobber,
      y: this.bobberHome.y + 22,
      duration: 120,
      yoyo: true,
      repeat: 3,
    });
  }

  private hook() {
    if (this.mode !== 'bite') return;
    this.biteBang.setVisible(false);
    this.tweens.killTweensOf(this.bobber);
    this.mode = 'reeling';
    this.tension = 18;
    this.progress = 0;
    this.patience = 100;
    this.holding = false;
    this.meterRoot.setVisible(true);
    this.statusText.setText('Reeling — hold to pull, release to ease tension');
    this.hintText.setText('Hold = reel in · Release = cool the line');
    this.updateMeters();
  }

  private missBite() {
    this.mode = 'ready';
    this.biteBang.setVisible(false);
    this.tweens.killTweensOf(this.bobber);
    this.bobber.setVisible(false);
    toast(this, this.cameras.main.width / 2, 200, 'got away…', '#8a8a9e');
    this.time.delayedCall(500, () => this.setReady());
  }

  private snapLine() {
    this.mode = 'ready';
    this.holding = false;
    this.meterRoot.setVisible(false);
    this.bobber.setVisible(false);
    this.biteBang.setVisible(false);
    toast(this, this.cameras.main.width / 2, 200, 'Line snapped!', '#ff6b6b');
    this.time.delayedCall(600, () => this.setReady());
  }

  private fishEscaped() {
    this.mode = 'ready';
    this.holding = false;
    this.meterRoot.setVisible(false);
    this.bobber.setVisible(false);
    toast(this, this.cameras.main.width / 2, 200, 'Fish got tired of waiting…', '#8a8a9e');
    this.time.delayedCall(600, () => this.setReady());
  }

  private landFish() {
    const tier = this.pendingFish ?? FISH_TIERS[0]!;
    const size = Math.round(
      Phaser.Math.Between(tier.sizeMin, tier.sizeMax) * (0.85 + this.castPower * 0.3),
    );
    this.pendingSize = size;
    this.mode = 'catch';
    this.holding = false;
    this.meterRoot.setVisible(false);
    this.bobber.setVisible(false);
    this.biteBang.setVisible(false);

    State.addItem(tier.id);
    const isBest = State.recordCatch(size);

    this.petSprite.stop();
    this.petSprite.setTexture(petTextureKey(State.data.petSpecies, 'happy'));
    this.time.delayedCall(1100, () => {
      if (this.petSprite.active) this.petSprite.play(petAnimKey(State.data.petSpecies, 'bounce'));
    });

    toast(this, this.cameras.main.width / 2, 160, isBest ? 'New best catch!' : 'Nice catch!', '#a8e6cf');
    this.showCatchCard(tier.id, size, isBest);
  }

  private showCatchCard(itemId: string, size: number, isBest: boolean) {
    this.mode = 'done';
    this.backBtn.setVisible(false);
    const def = ITEMS[itemId]!;
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;
    this.add.rectangle(cx, cy, 420, 260, 0x2a2440).setStrokeStyle(3, 0xffb3d1).setDepth(1600);
    this.add
      .text(cx, cy - 90, 'You caught a fish!', { ...FONT, fontSize: '22px', color: '#ffe066' })
      .setOrigin(0.5)
      .setDepth(1601);
    this.add.image(cx, cy - 28, def.texture).setScale(3.2).setDepth(1601);
    this.add
      .text(cx, cy + 36, `${def.name} — ${size}cm`, { ...FONT, fontSize: '16px' })
      .setOrigin(0.5)
      .setDepth(1601);
    this.add
      .text(cx, cy + 62, isBest ? `Personal best!  Best: ${State.data.biggestCatch}cm` : `Best: ${State.data.biggestCatch}cm`, {
        ...FONT,
        fontSize: '13px',
        color: '#c8c8dc',
      })
      .setOrigin(0.5)
      .setDepth(1601);
    this.add
      .text(cx, cy + 88, 'Added to inventory — feed your pet!', {
        ...FONT,
        fontSize: '12px',
        color: '#a8e6cf',
      })
      .setOrigin(0.5)
      .setDepth(1601);

    const again = this.add
      .text(cx - 110, cy + 118, '[ Cast again ]', { ...FONT, fontSize: '16px', color: '#a8e6cf', padding: { x: 8, y: 6 } })
      .setOrigin(0.5)
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
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    leave.on('pointerdown', () => this.scene.start('Shore', { spawn: 'fishing' }));
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

    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      if (this.mode === 'ready') {
        this.castPower = 0.65;
        this.cast();
      } else if (this.mode === 'bite') {
        this.hook();
      }
    }
    if (this.mode === 'reeling') {
      this.holding = this.keySpace.isDown || this.input.activePointer.isDown;
    }

    if (this.mode === 'waiting' && this.time.now >= this.biteAt) {
      this.startBite();
    } else if (this.mode === 'bite' && this.time.now >= this.biteDeadline) {
      this.missBite();
    } else if (this.mode === 'reeling') {
      // Fish fight pulses tension upward even when not holding.
      const fightPulse = (0.55 + Math.sin(this.time.now / 280) * 0.45) * this.fishFight;
      if (this.holding) {
        this.progress += 28 * dt * (1.1 - this.tension / 220);
        this.tension += (38 + fightPulse * 22) * dt;
      } else {
        this.tension = Math.max(0, this.tension - 42 * dt);
        this.progress += 4 * dt;
      }
      this.patience -= (7 + this.fishFight * 4) * dt;
      this.tension = Phaser.Math.Clamp(this.tension, 0, 100);
      this.progress = Phaser.Math.Clamp(this.progress, 0, 100);
      this.updateMeters();

      // Bobber tug while fighting
      this.bobber.x = this.bobberHome.x + Math.sin(this.time.now / 90) * (4 + this.tension / 20);
      this.bobber.y = this.bobberHome.y + 10 + Math.cos(this.time.now / 70) * 3;

      if (this.tension >= 100) this.snapLine();
      else if (this.patience <= 0) this.fishEscaped();
      else if (this.progress >= 100) this.landFish();
    }
  }
}
