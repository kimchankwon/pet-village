import Phaser from 'phaser';
import { State } from './GameState';
import { toast } from './UI';
import { characterDepth } from './depth';
import { petAnimKey, petTextureKey, type PetPose } from './pets';
import { petLine } from './petDialog';
import { ACCESSORIES, ACCESSORY_LAYOUT, SPECIES_ACCESSORY_NUDGE, type AccessoryId } from './accessories';

/**
 * Companion that stays a short distance *behind* the player along their
 * recent travel direction — never glued to their side (which caused the
 * pet to flip in front/behind when the player stood still and flipped).
 */
export class Pet {
  sprite: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;
  private followX: number;
  private followY: number;
  /** Unit vector pointing from player toward the pet's preferred slot (behind). */
  private trailX = 0;
  private trailY = 1;
  private facingLeft = false;
  private readonly ARRIVE = 4;
  private readonly FOLLOW_DIST = 46;
  private emotionUntil = 0;
  private accessorySprites: Phaser.GameObjects.Image[] = [];
  private accessoryIds: AccessoryId[] = [];
  /** When true, update() skips follow — used for bed tuck / scripted walks. */
  private holdFollow = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.followX = x;
    this.followY = y;
    this.sprite = scene.add.sprite(x, y, this.tex('idle1')).setScale(1.5);
    this.sprite.setDepth(characterDepth(this.sprite));
    this.sprite.play(this.anim('bounce'));
    this.refreshAccessories();
    this.updateMood();
  }

  private species() {
    return State.data.petSpecies;
  }

  private tex(pose: PetPose) {
    return petTextureKey(this.species(), pose);
  }

  private anim(kind: 'bounce' | 'walk') {
    return petAnimKey(this.species(), kind);
  }

  /** Rebuild equipped accessory overlays (call after equip changes). */
  refreshAccessories() {
    for (const img of this.accessorySprites) img.destroy();
    this.accessorySprites = [];
    this.accessoryIds = [];
    for (const id of State.equippedAccessoryIds()) {
      const def = ACCESSORIES[id];
      if (!def) continue;
      if (!this.scene.textures.exists(def.texture)) continue;
      const layout = ACCESSORY_LAYOUT[id];
      const scale = this.sprite.scaleX * (layout?.scale ?? 1);
      const img = this.scene.add
        .image(this.sprite.x, this.sprite.y, def.texture)
        .setScale(scale)
        .setFlipX(this.facingLeft);
      this.accessorySprites.push(img);
      this.accessoryIds.push(id);
    }
    this.syncAccessories();
  }

  private syncAccessories() {
    const depth = characterDepth(this.sprite) + 1;
    const nudges = SPECIES_ACCESSORY_NUDGE[this.species()];
    for (let i = 0; i < this.accessorySprites.length; i++) {
      const img = this.accessorySprites[i]!;
      const id = this.accessoryIds[i]!;
      const layout = ACCESSORY_LAYOUT[id];
      // Per-species nudge is authored in native px; scale it to world px.
      const nudge = nudges?.[id];
      const nx = (nudge?.x ?? 0) * this.sprite.scaleX;
      const ny = (nudge?.y ?? 0) * this.sprite.scaleX;
      const ox = ((layout?.offsetX ?? 0) + nx) * (this.facingLeft ? -1 : 1);
      const oy = (layout?.offsetY ?? 0) + ny;
      const scale = this.sprite.scaleX * (layout?.scale ?? 1);
      img.setPosition(this.sprite.x + ox, this.sprite.y + oy);
      img.setScale(scale);
      img.setFlipX(this.facingLeft);
      img.setDepth(depth);
      img.setVisible(this.sprite.visible);
      img.setAlpha(this.sprite.alpha);
    }
  }

  /**
   * @param playerX player world x
   * @param playerY player world y
   * @param playerVx player velocity x (px/s)
   * @param playerVy player velocity y (px/s)
   */
  update(playerX: number, playerY: number, playerVx: number, playerVy: number) {
    if (this.holdFollow) {
      this.sprite.setDepth(characterDepth(this.sprite));
      this.syncAccessories();
      return;
    }
    const dt = Math.min(this.scene.game.loop.delta / 1000, 0.05);
    const prevX = this.sprite.x;
    const speed = Math.hypot(playerVx, playerVy);
    const moving = speed > 12;

    if (moving) {
      // Behind = opposite of travel direction. Ease so sharp turns don't yank.
      const behindX = -playerVx / speed;
      const behindY = -playerVy / speed;
      const turn = 1 - Math.exp(-5 * dt);
      this.trailX += (behindX - this.trailX) * turn;
      this.trailY += (behindY - this.trailY) * turn;
      const tlen = Math.hypot(this.trailX, this.trailY) || 1;
      this.trailX /= tlen;
      this.trailY /= tlen;
    }

    const slotX = playerX + this.trailX * this.FOLLOW_DIST;
    const slotY = playerY + this.trailY * this.FOLLOW_DIST + 4;

    const slotRate = moving ? 8 : 3.5;
    const slotT = 1 - Math.exp(-slotRate * dt);
    this.followX += (slotX - this.followX) * slotT;
    this.followY += (slotY - this.followY) * slotT;

    const dx = this.followX - this.sprite.x;
    const dy = this.followY - this.sprite.y;
    const dist = Math.hypot(dx, dy);

    let petMoving = false;
    if (dist > this.ARRIVE) {
      const base = moving ? 170 : 95;
      const boost = Phaser.Math.Clamp((dist - 50) * 2.2, 0, 160);
      const step = Math.min((base + boost) * dt, dist);
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;
      petMoving = step > 0.35;
    } else {
      this.sprite.x = this.followX;
      this.sprite.y = this.followY;
    }

    this.sprite.setDepth(characterDepth(this.sprite));

    if (this.scene.time.now < this.emotionUntil) {
      this.syncAccessories();
      return;
    }

    const movedX = this.sprite.x - prevX;
    if (movedX < -1.0) this.facingLeft = true;
    else if (movedX > 1.0) this.facingLeft = false;
    this.sprite.setFlipX(this.facingLeft);

    // Walk while the player is moving (pet rides the follow slot) or while
    // catching up — otherwise it stays on bounce even when trotting along.
    if (petMoving || moving) {
      this.sprite.play(this.anim('walk'), true);
    } else {
      this.applyExpression();
    }
    this.syncAccessories();
  }

  /**
   * Idle face for the current needs: sad when hungry/unhappy, dozing when
   * out of energy, bouncing otherwise.
   */
  private applyExpression() {
    const expr = State.petExpression();
    if (expr === 'hungry' || expr === 'sad') {
      if (this.sprite.anims.isPlaying) this.sprite.stop();
      if (this.sprite.texture.key !== this.tex('sad')) this.sprite.setTexture(this.tex('sad'));
    } else if (expr === 'tired') {
      if (this.sprite.anims.isPlaying) this.sprite.stop();
      if (this.sprite.texture.key !== this.tex('sleep')) this.sprite.setTexture(this.tex('sleep'));
    } else {
      this.sprite.play(this.anim('bounce'), true);
    }
  }

  updateMood() {
    if (this.scene.time.now < this.emotionUntil) return;
    this.applyExpression();
    this.syncAccessories();
  }

  /** The pet says something fitting its needs/personality. */
  speak() {
    const line = petLine();
    toast(this.scene, this.sprite.x, this.sprite.y - 30, line, '#ffe6f2');
    const expr = State.petExpression();
    if (expr === 'happy') {
      this.showEmotion('happy', 1000);
      this.emitHearts();
    } else if (expr === 'ok') {
      this.showEmotion('happy', 900);
    }
    // Needy pets keep their hungry/tired/sad face while they talk.
  }

  showEmotion(pose: Extract<PetPose, 'happy' | 'sleep' | 'jump'>, ms: number) {
    this.emotionUntil = this.scene.time.now + ms;
    this.sprite.stop();
    this.sprite.setTexture(this.tex(pose));
    this.syncAccessories();
  }

  /** Pause player-follow so the scene can script a walk / sleep. */
  pauseFollow() {
    this.holdFollow = true;
    this.emotionUntil = 0;
  }

  /** Resume following; snaps the follow slot to the current sprite. */
  resumeFollow() {
    this.holdFollow = false;
    this.followX = this.sprite.x;
    this.followY = this.sprite.y;
    this.emotionUntil = 0;
  }

  /** Walk to a world point while follow is paused. Plays walk, then idle/bounce. */
  walkTo(x: number, y: number, onArrive: () => void) {
    this.pauseFollow();
    const dist = Math.hypot(x - this.sprite.x, y - this.sprite.y);
    const duration = Phaser.Math.Clamp(dist * 6, 280, 1200);
    this.facingLeft = x < this.sprite.x;
    this.sprite.setFlipX(this.facingLeft);
    this.sprite.play(this.anim('walk'), true);
    this.scene.tweens.add({
      targets: this.sprite,
      x,
      y,
      duration,
      ease: 'Linear',
      onUpdate: () => {
        this.sprite.setDepth(characterDepth(this.sprite));
        this.syncAccessories();
      },
      onComplete: () => {
        this.sprite.stop();
        this.followX = x;
        this.followY = y;
        onArrive();
        this.syncAccessories();
      },
    });
  }

  emitHearts() {
    for (let i = 0; i < 3; i++) {
      const h = this.scene.add
        .image(this.sprite.x + Phaser.Math.Between(-14, 14), this.sprite.y - 10, 'heart')
        .setDepth(1500);
      this.scene.tweens.add({
        targets: h,
        y: h.y - 40 - i * 8,
        alpha: 0,
        duration: 900 + i * 200,
        onComplete: () => h.destroy(),
      });
    }
  }

  celebrate(msg: string) {
    toast(this.scene, this.sprite.x, this.sprite.y - 24, msg, '#ffb3d1');
    this.showEmotion('happy', 1400);
    this.emitHearts();
  }
}
