import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State } from '../systems/GameState';
import {
  buildGetTrack,
  GET_CATCH_HALF_WIDTH,
  GET_DIFFICULTIES,
  GET_ENERGY_COST,
  GET_TAP_DISTANCE,
  getGetBowlScaleX,
  getGetNoteTexture,
  getGetTravelDistance,
  type GetDifficulty,
  type GetEvent,
} from '../systems/getGameRules';
import { petAnimKey, petTextureKey } from '../systems/pets';
import { Menu, toast } from '../systems/UI';
import { isUiBlocked } from '../systems/nav';
import { attachCameraZoom, markAsUi, type CameraZoom } from '../systems/cameraZoom';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };
const SESSION_BEST_KEY = 'getSessionBest';

type Mode = 'pick' | 'playing' | 'failed' | 'cleared';
type FallingObject = {
  event: GetEvent;
  sprite: Phaser.GameObjects.Image;
  crossedBowl: boolean;
};

const NOTE_TINTS = [0xffe066, 0xffb3d1, 0xa8e6cf, 0x87ceeb];

/**
 * Get — a catch-the-beat game where the selected pet carries a bowl.
 * Catch every note, move away from poop, and never let a note hit the floor.
 */
export class GetScene extends Phaser.Scene {
  private mode: Mode = 'pick';
  private difficulty: GetDifficulty = 'easy';
  private menuOpen = false;
  private ignoreClicksUntil = 0;
  private cameraZoom!: CameraZoom;

  private catcher!: Phaser.GameObjects.Sprite;
  private bowl!: Phaser.GameObjects.Image;
  private bowlScaleX = 1;
  private bowlY = 470;
  private floorY = 540;
  private spawnY = 74;
  private minX = 70;
  private maxX = 730;
  private tapTargetX: number | null = null;
  private pointerDirection = 0;
  private pointerId: number | null = null;
  private pointerStartCatcherX = 0;
  private lastMoveDirection = 1;

  private track: GetEvent[] = [];
  private nextEvent = 0;
  private falling: FallingObject[] = [];
  private runStartedAt = 0;
  private score = 0;

  private titleText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private backBtn!: Phaser.GameObjects.Text;
  private keyLeft!: Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('Get');
  }

  create() {
    generateTextures(this);
    this.mode = 'pick';
    this.menuOpen = false;
    this.ignoreClicksUntil = 0;
    this.pointerDirection = 0;
    this.pointerId = null;
    this.tapTargetX = null;
    this.nextEvent = 0;
    this.falling = [];
    this.score = 0;

    const viewW = this.cameras.main.width;
    const viewH = this.cameras.main.height;
    const cx = viewW / 2;
    this.minX = 64;
    this.maxX = viewW - 64;
    // Keep the playable drop distance stable on tall phones. Expanding it to
    // the full portrait canvas would silently invalidate the tested timings.
    const arenaHeight = Math.min(474, Math.max(360, viewH - 126));
    this.spawnY = Math.max(78, Math.round((viewH - arenaHeight) / 2));
    this.floorY = this.spawnY + arenaHeight;

    this.cameras.main.setBackgroundColor('#171326');
    this.add.rectangle(cx, viewH / 2, viewW, viewH, 0x28234b);
    this.add.rectangle(cx, 44, viewW, 88, 0x3d3560);
    this.add.rectangle(
      cx,
      this.floorY + (viewH - this.floorY) / 2,
      viewW,
      Math.max(50, viewH - this.floorY),
      0x4a4370,
    );
    this.add.rectangle(cx, this.floorY, viewW, 5, 0x151227).setDepth(2);
    for (let i = 0; i < Math.ceil(viewW / 80); i++) {
      const x = 36 + i * 80;
      const y = this.spawnY + 42 + (i % 3) * 96;
      this.add.circle(x, y, 2 + (i % 2), i % 2 ? 0xffe066 : 0x87ceeb, 0.6);
    }

    this.catcher = this.add
      .sprite(cx, this.floorY - 42, petTextureKey(State.data.petSpecies, 'idle1'))
      .setScale(2.2)
      .setDepth(12);
    if (this.catcher.displayHeight > 86) {
      const scale = this.catcher.scaleX * (86 / this.catcher.displayHeight);
      this.catcher.setScale(scale);
    }
    this.catcher.y = this.floorY - this.catcher.displayHeight / 2 - 2;
    this.bowlY = this.catcher.y - this.catcher.displayHeight / 2 - 5;
    this.bowl = this.add.image(cx, this.bowlY, 'catch-bowl').setDepth(14);
    this.catcher.play(petAnimKey(State.data.petSpecies, 'bounce'));

    this.titleText = this.add
      .text(138, 14, 'GET', { ...FONT, fontSize: '20px', color: '#ffe066' })
      .setScrollFactor(0);
    this.scoreText = this.add.text(18, 48, 'Notes: 0', { ...FONT, fontSize: '16px' }).setScrollFactor(0);
    this.modeText = this.add
      .text(viewW - 52, 16, 'Pick a mode', { ...FONT, color: '#a8e6cf' })
      .setOrigin(1, 0)
      .setScrollFactor(0);
    this.hintText = this.add
      .text(cx, viewH - 18, '← → / A D · tap or hold either side', {
        ...FONT,
        fontSize: '12px',
        color: '#c8c8dc',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30);
    this.backBtn = this.add
      .text(12, 8, '[ Back ]', {
        ...FONT,
        fontSize: '18px',
        color: '#ffb3d1',
        padding: { x: 8, y: 8 },
      })
      .setScrollFactor(0)
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    this.backBtn.on('pointerdown', () => {
      this.ignoreClicksUntil = this.time.now + 180;
      this.requestLeave();
    });

    const leftZone = this.add
      .text(24, viewH - 84, '◀ LEFT', { ...FONT, fontSize: '14px', color: '#87ceeb' })
      .setScrollFactor(0)
      .setDepth(30)
      .setAlpha(0.7);
    const rightZone = this.add
      .text(viewW - 50, viewH - 84, 'RIGHT ▶', { ...FONT, fontSize: '14px', color: '#87ceeb' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(30)
      .setAlpha(0.7);
    markAsUi(
      this,
      this.titleText,
      this.scoreText,
      this.modeText,
      this.hintText,
      this.backBtn,
      leftZone,
      rightZone,
    );

    const keyboard = this.input.keyboard!;
    this.keyLeft = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keyRight = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyEsc = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.cameraZoom = attachCameraZoom(this, {
      kind: 'game',
      isBlocked: () => this.menuOpen || isUiBlocked(),
      onPinchStart: () => {
        this.pointerDirection = 0;
        this.pointerId = null;
        this.tapTargetX = null;
      },
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (
        this.mode !== 'playing' ||
        this.menuOpen ||
        this.time.now < this.ignoreClicksUntil ||
        pointer.y < 76 ||
        this.cameraZoom.ownsPointer(pointer) ||
        this.cameraZoom.isPinching()
      ) {
        return;
      }
      const direction = pointer.x < viewW / 2 ? -1 : 1;
      this.pointerId = pointer.id;
      this.pointerDirection = direction;
      this.pointerStartCatcherX = this.catcher.x;
      this.tapTargetX = Phaser.Math.Clamp(
        this.catcher.x + direction * GET_TAP_DISTANCE,
        this.minX,
        this.maxX,
      );
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.pointerId || !pointer.isDown) return;
      this.pointerDirection = pointer.x < viewW / 2 ? -1 : 1;
      if (Math.abs(this.catcher.x - this.pointerStartCatcherX) < 2) {
        this.tapTargetX = Phaser.Math.Clamp(
          this.catcher.x + this.pointerDirection * GET_TAP_DISTANCE,
          this.minX,
          this.maxX,
        );
      }
    });
    const stopPointer = (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.pointerId) return;
      // A quick tap still travels one step at the normal movement speed.
      // A held press stops where it was released instead of snapping back
      // toward the tap target captured on pointerdown.
      if (Math.abs(this.catcher.x - this.pointerStartCatcherX) >= 2) this.tapTargetX = null;
      this.pointerDirection = 0;
      this.pointerId = null;
    };
    this.input.on('pointerup', stopPointer);
    this.input.on('pointerupoutside', stopPointer);

    this.time.addEvent({
      delay: 60_000,
      loop: true,
      callback: () => {
        State.decay(1 / 60);
        State.save();
      },
    });

    this.openDifficultyMenu();
  }

  private openDifficultyMenu() {
    this.mode = 'pick';
    this.menuOpen = true;
    const option = (difficulty: GetDifficulty) => {
      const cfg = GET_DIFFICULTIES[difficulty];
      const energyCost = GET_ENERGY_COST[difficulty];
      const tired = !State.hasEnergy(energyCost);
      return {
        label: `${cfg.label} · ${cfg.fallSpeed}px/s · ${energyCost} energy${tired ? ' — too tired!' : ''}`,
        disabled: tired,
        onSelect: () => this.beginRun(difficulty),
      };
    };
    const menu = new Menu(
      this,
      'Get!',
      [option('easy'), option('normal'), option('hard')],
      { subtitle: 'Energy is spent per run · catch every note · dodge poop' },
    );
    menu.onClose = () => {
      this.menuOpen = false;
      this.ignoreClicksUntil = this.time.now + 250;
      this.time.delayedCall(0, () => {
        if (this.mode === 'pick') this.scene.start('EastPark', { spawn: 'get' });
      });
    };
  }

  private beginRun(difficulty: GetDifficulty) {
    const energyCost = GET_ENERGY_COST[difficulty];
    if (!State.hasEnergy(energyCost)) {
      this.menuOpen = false;
      this.time.delayedCall(0, () => this.openDifficultyMenu());
      return;
    }
    State.spendEnergy(energyCost);
    this.difficulty = difficulty;
    this.bowlScaleX = getGetBowlScaleX(difficulty);
    this.bowl.setScale(this.bowlScaleX, 1);
    this.mode = 'playing';
    this.menuOpen = false;
    this.score = 0;
    this.nextEvent = 0;
    this.falling.forEach((object) => object.sprite.destroy());
    this.falling = [];
    this.track = buildGetTrack(difficulty, {
      minX: this.minX,
      maxX: this.maxX,
      spawnY: this.spawnY,
      catchY: this.bowlY,
    });
    this.runStartedAt = this.time.now;
    this.catcher.setTexture(petTextureKey(State.data.petSpecies, 'idle1'));
    this.catcher.play(petAnimKey(State.data.petSpecies, 'bounce'));
    this.modeText.setText(`${GET_DIFFICULTIES[difficulty].label} · ${GET_DIFFICULTIES[difficulty].fallSpeed}px/s`);
    this.updateScore();
    toast(
      this,
      this.cameras.main.width / 2,
      126,
      `-${energyCost} energy · catch notes · dodge poop!`,
      '#ffe066',
    );
  }

  private spawnEvent(event: GetEvent) {
    const sprite = this.add
      .image(event.x, this.spawnY, event.kind === 'note' ? getGetNoteTexture() : 'poop')
      .setDepth(10);
    if (event.kind === 'note') {
      sprite.setTint(Phaser.Utils.Array.GetRandom(NOTE_TINTS));
    }
    this.falling.push({ event, sprite, crossedBowl: false });
  }

  private updateScore() {
    const target = GET_DIFFICULTIES[this.difficulty].notesToClear;
    const best = Number(this.registry.get(SESSION_BEST_KEY) ?? 0);
    this.scoreText.setText(`Notes: ${this.score}/${target} · Best: ${best}`);
  }

  private catchNote(object: FallingObject) {
    this.score++;
    const best = Number(this.registry.get(SESSION_BEST_KEY) ?? 0);
    if (this.score > best) this.registry.set(SESSION_BEST_KEY, this.score);
    this.updateScore();
    object.sprite.destroy();
    toast(this, this.catcher.x, this.bowlY - 30, `♪ ${this.score}`, '#ffe066');
    this.tweens.add({
      targets: this.bowl,
      scaleX: { from: this.bowlScaleX * 1.12, to: this.bowlScaleX },
      scaleY: { from: 0.88, to: 1 },
      duration: 130,
    });
  }

  private fail(reason: string) {
    if (this.mode !== 'playing') return;
    this.mode = 'failed';
    this.pointerDirection = 0;
    this.tapTargetX = null;
    this.catcher.stop();
    this.catcher.setTexture(petTextureKey(State.data.petSpecies, 'sad'));
    this.showEndPanel('Try again!', reason, '#ff6b6b', 'Try again');
  }

  private clearTrack() {
    if (this.mode !== 'playing') return;
    this.mode = 'cleared';
    this.pointerDirection = 0;
    this.tapTargetX = null;
    this.catcher.stop();
    this.catcher.setTexture(petTextureKey(State.data.petSpecies, 'happy'));
    const reward = State.rewardGetWin(this.difficulty);
    this.showEndPanel(
      `${GET_DIFFICULTIES[this.difficulty].label} cleared!`,
      `You caught all ${this.score} music notes.\n+${reward.coins} coins · +${reward.happiness} happiness`,
      '#ffe066',
      'Play again',
    );
  }

  private showEndPanel(title: string, summary: string, color: string, retryLabel: string) {
    this.backBtn.setVisible(false);
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;
    const panel = this.add
      .rectangle(cx, cy, 470, 226, 0x2a2440, 0.98)
      .setStrokeStyle(3, 0xffb3d1)
      .setScrollFactor(0)
      .setDepth(1600)
      .setInteractive();
    const heading = this.add
      .text(cx, cy - 66, title, { ...FONT, fontSize: '22px', color })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601);
    const detail = this.add
      .text(cx, cy - 20, summary, { ...FONT, fontSize: '16px', color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601);
    const retry = this.add
      .text(cx - 118, cy + 62, `[ ${retryLabel} ]`, {
        ...FONT,
        fontSize: '18px',
        color: '#a8e6cf',
        padding: { x: 8, y: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    // Match Bump/Paper Toss: every new run returns to difficulty selection.
    retry.on('pointerdown', () => this.scene.restart());
    const leave = this.add
      .text(cx + 128, cy + 62, '[ Back outside ]', {
        ...FONT,
        fontSize: '18px',
        color: '#ffb3d1',
        padding: { x: 8, y: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1601)
      .setInteractive({ useHandCursor: true });
    leave.on('pointerdown', () => this.scene.start('EastPark', { spawn: 'get' }));
    markAsUi(this, panel, heading, detail, retry, leave);
  }

  private requestLeave() {
    if (this.mode === 'pick' || this.mode === 'failed' || this.mode === 'cleared') {
      this.scene.start('EastPark', { spawn: 'get' });
      return;
    }
    this.menuOpen = true;
    const menu = new Menu(
      this,
      'Leave Get?',
      [
        { label: 'Keep playing', onSelect: () => {} },
        { label: 'Back outside', onSelect: () => this.scene.start('EastPark', { spawn: 'get' }) },
      ],
      'This track will end',
    );
    menu.onClose = () => {
      this.menuOpen = false;
      this.ignoreClicksUntil = this.time.now + 250;
    };
  }

  private moveCatcher(deltaMs: number) {
    const keyboardDirection =
      (this.keyLeft.isDown || this.keyA.isDown ? -1 : 0) +
      (this.keyRight.isDown || this.keyD.isDown ? 1 : 0);
    let direction = Phaser.Math.Clamp(keyboardDirection + this.pointerDirection, -1, 1);
    if (keyboardDirection !== 0) this.tapTargetX = null;

    if (direction === 0 && this.tapTargetX != null) {
      const remaining = this.tapTargetX - this.catcher.x;
      if (Math.abs(remaining) < 2) this.tapTargetX = null;
      else direction = Math.sign(remaining);
    }

    // Falling objects use the same uncapped elapsed time through runStartedAt.
    // Keeping movement on that clock preserves the track's reachability proof
    // even if a frame stalls for longer than 50 ms.
    const distance = getGetTravelDistance(deltaMs);
    if (direction !== 0) {
      let nextX = this.catcher.x + direction * distance;
      if (this.pointerDirection === 0 && this.tapTargetX != null) {
        nextX = direction < 0 ? Math.max(nextX, this.tapTargetX) : Math.min(nextX, this.tapTargetX);
      }
      this.catcher.x = Phaser.Math.Clamp(nextX, this.minX, this.maxX);
      this.lastMoveDirection = direction;
      this.catcher.setFlipX(direction < 0);
      if (this.catcher.anims.currentAnim?.key !== petAnimKey(State.data.petSpecies, 'walk')) {
        this.catcher.play(petAnimKey(State.data.petSpecies, 'walk'));
      }
    } else if (this.catcher.anims.currentAnim?.key !== petAnimKey(State.data.petSpecies, 'bounce')) {
      this.catcher.play(petAnimKey(State.data.petSpecies, 'bounce'));
      this.catcher.setFlipX(this.lastMoveDirection < 0);
    }
    this.bowl.x = this.catcher.x;
  }

  update(_time: number, deltaMs: number) {
    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) && !this.menuOpen && !isUiBlocked()) {
      this.requestLeave();
      return;
    }
    if (this.mode !== 'playing' || this.menuOpen || isUiBlocked()) return;

    this.moveCatcher(deltaMs);
    const elapsedMs = this.time.now - this.runStartedAt;
    while (this.nextEvent < this.track.length && this.track[this.nextEvent]!.spawnMs <= elapsedMs) {
      this.spawnEvent(this.track[this.nextEvent]!);
      this.nextEvent++;
    }

    const fallSpeed = GET_DIFFICULTIES[this.difficulty].fallSpeed;
    const survivors: FallingObject[] = [];
    for (const object of this.falling) {
      const previousY = object.sprite.y;
      object.sprite.y = this.spawnY + ((elapsedMs - object.event.spawnMs) / 1000) * fallSpeed;
      object.sprite.angle += (object.event.kind === 'note' ? 55 : -28) * (deltaMs / 1000);

      if (!object.crossedBowl && previousY <= this.bowlY && object.sprite.y >= this.bowlY) {
        object.crossedBowl = true;
        const overlapsBowl =
          Math.abs(object.sprite.x - this.bowl.x) <= GET_CATCH_HALF_WIDTH[this.difficulty];
        if (object.event.kind === 'note' && overlapsBowl) {
          this.catchNote(object);
          continue;
        }
        if (object.event.kind === 'poop' && overlapsBowl) {
          object.sprite.destroy();
          this.fail('You collected poop. Keep it out of the bowl!');
          return;
        }
      }

      if (object.sprite.y >= this.floorY - object.sprite.displayHeight / 2) {
        object.sprite.destroy();
        if (object.event.kind === 'note') {
          this.fail('A music note hit the floor.');
          return;
        }
        continue;
      }
      survivors.push(object);
    }
    this.falling = survivors;

    if (this.nextEvent >= this.track.length && this.falling.length === 0) this.clearTrack();
  }
}
