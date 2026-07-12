import Phaser from 'phaser';
import { characterDepth } from './depth';

export interface NpcTalkCallbacks {
  /** Menu fully closed — the scene should re-enable input. */
  onClose: () => void;
  /** A follow-up menu is opening — keep the scene's menu flag up. */
  keepMenuOpen: () => void;
  /** Equipped/owned pet accessories changed (e.g. a gift). */
  onAccessoriesChanged?: () => void;
}

export interface WandererOptions {
  /** Display name used in the interact prompt. */
  name: string;
  /**
   * Texture/animation prefix: expects `<prefix>-idle|walk1|walk2|happy|sad|jump`
   * textures and `<prefix>-bounce` / `<prefix>-walk` animations.
   */
  texPrefix: string;
  waypoints: { x: number; y: number }[];
  scale?: number;
  speed?: number;
  pauseMs?: [number, number];
}

/**
 * A town NPC that wanders between waypoints, pausing at each one.
 * Subclasses override `talk()` to open their dialogue menu.
 */
export class WandererNpc {
  sprite: Phaser.GameObjects.Sprite;
  readonly name: string;
  protected scene: Phaser.Scene;
  protected readonly prefix: string;
  private waypoints: { x: number; y: number }[];
  private destIndex = 0;
  private pauseUntil = 0;
  /** While set, update() leaves the sprite alone so emotes/hops play out. */
  private emoteUntil = 0;
  private facingLeft = false;
  private readonly speed: number;
  private readonly pauseMs: [number, number];
  /** Off-map / mid enter-exit — hidden from interact prompts. */
  private present = true;
  private transit: { x: number; y: number; onDone: () => void } | null = null;
  /** True while a dialogue menu with this NPC is open — don't wander away. */
  private conversing = false;
  /** Nested Menu depth so follow-up dialogues keep the freeze. */
  private talkDepth = 0;

  constructor(scene: Phaser.Scene, opts: WandererOptions) {
    this.scene = scene;
    this.name = opts.name;
    this.prefix = opts.texPrefix;
    this.waypoints = opts.waypoints;
    this.speed = opts.speed ?? 50;
    this.pauseMs = opts.pauseMs ?? [1400, 3200];
    const start = opts.waypoints[0] ?? { x: 400, y: 400 };
    this.sprite = scene.add.sprite(start.x, start.y, `${this.prefix}-idle`).setScale(opts.scale ?? 1.55);
    this.sprite.setDepth(characterDepth(this.sprite));
    this.playBounce();
    this.pickNext();
  }

  isPresent() {
    return this.present && this.sprite.active;
  }

  canInteract() {
    return this.isPresent() && !this.transit;
  }

  destroy() {
    this.transit = null;
    this.present = false;
    this.sprite.destroy();
  }

  /** Walk to an off-map point, then invoke onDone (caller destroys). */
  walkOff(dest: { x: number; y: number }, onDone: () => void) {
    this.transit = { x: dest.x, y: dest.y, onDone };
    this.pauseUntil = 0;
    this.emoteUntil = 0;
  }

  /** Appear at an edge and walk toward first home waypoint. */
  appearFrom(start: { x: number; y: number }, onDone: () => void) {
    const home = this.waypoints[0] ?? { x: 400, y: 400 };
    this.sprite.setPosition(start.x, start.y);
    this.sprite.setVisible(true);
    this.sprite.setAlpha(1);
    this.present = true;
    this.transit = {
      x: home.x,
      y: home.y,
      onDone: () => {
        this.transit = null;
        this.playBounce();
        onDone();
      },
    };
  }

  /** Idle portrait texture for dialogue windows. */
  faceKey() {
    return `${this.prefix}-idle`;
  }

  /**
   * Open this NPC's dialogue. Freezes wandering until the full menu chain
   * closes (including nested follow-ups opened via `keepMenuOpen`).
   * Subclasses implement the menu in `openTalk`.
   */
  talk(cbs: NpcTalkCallbacks) {
    this.pushTalk();
    this.openTalk({
      ...cbs,
      // First Menu closes before onSelect runs, which would clear the freeze;
      // re-push so nested gift/shop menus keep the NPC still.
      keepMenuOpen: () => {
        this.pushTalk();
        cbs.keepMenuOpen();
      },
      onClose: () => {
        this.popTalk();
        cbs.onClose();
      },
    });
  }

  private pushTalk() {
    this.talkDepth += 1;
    this.conversing = true;
    if (this.talkDepth === 1) this.playBounce();
  }

  private popTalk() {
    this.talkDepth = Math.max(0, this.talkDepth - 1);
    if (this.talkDepth === 0) this.conversing = false;
  }

  /** Build the dialogue menu. Called by `talk` after freezing movement. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected openTalk(_cbs: NpcTalkCallbacks) {}

  private lastLineIdx = -1;

  /** Random line that never repeats the previous one for this NPC. */
  protected pickLine(lines: string[]): string {
    if (lines.length <= 1) return lines[0] ?? '';
    let idx = Phaser.Math.Between(0, lines.length - 1);
    if (idx === this.lastLineIdx) idx = (idx + 1) % lines.length;
    this.lastLineIdx = idx;
    return lines[idx]!;
  }

  private pickNext() {
    if (this.waypoints.length < 2) return;
    let next = this.destIndex;
    while (next === this.destIndex) {
      next = Phaser.Math.Between(0, this.waypoints.length - 1);
    }
    this.destIndex = next;
  }

  protected playBounce() {
    this.sprite.play(`${this.prefix}-bounce`, true);
  }

  /** Show a one-off pose, then resume bouncing. */
  protected emote(pose: 'happy' | 'sad' | 'jump', ms = 1000) {
    this.emoteUntil = this.scene.time.now + ms;
    this.sprite.stop();
    this.sprite.setTexture(`${this.prefix}-${pose}`);
    this.scene.time.delayedCall(ms, () => {
      if (this.sprite.active) this.playBounce();
    });
  }

  /** Little hop with the jump pose. */
  protected hop(height = 24) {
    // Cover the full up+down tween so update() can't move the sprite
    // (or restart walk/bounce) mid-air.
    this.emoteUntil = this.scene.time.now + 900;
    this.sprite.stop();
    this.sprite.setTexture(`${this.prefix}-jump`);
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - height,
      duration: 420,
      yoyo: true,
      onComplete: () => {
        if (this.sprite.active) this.playBounce();
      },
    });
  }

  update() {
    if (!this.sprite.active) return;

    // Entering / leaving the map — walk straight to transit target.
    if (this.transit) {
      const dx = this.transit.x - this.sprite.x;
      const dy = this.transit.y - this.sprite.y;
      const dist = Math.hypot(dx, dy);
      const dt = Math.min(this.scene.game.loop.delta / 1000, 0.05);
      if (dist < 8) {
        const done = this.transit.onDone;
        this.transit = null;
        done();
        return;
      }
      const step = Math.min(this.speed * 1.35 * dt, dist);
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;
      if (dx < -0.5) this.facingLeft = true;
      else if (dx > 0.5) this.facingLeft = false;
      this.sprite.setFlipX(this.facingLeft);
      this.sprite.play(`${this.prefix}-walk`, true);
      this.sprite.setDepth(characterDepth(this.sprite));
      return;
    }

    // An emote/hop is playing — leave texture, animation and position be.
    if (this.scene.time.now < this.emoteUntil) {
      this.sprite.setDepth(characterDepth(this.sprite));
      return;
    }

    // Dialogue open — idle bounce in place (emotes/hops still work above).
    if (this.conversing) {
      if (this.sprite.anims.currentAnim?.key !== `${this.prefix}-bounce`) {
        this.playBounce();
      }
      this.sprite.setDepth(characterDepth(this.sprite));
      return;
    }

    if (this.scene.time.now < this.pauseUntil) {
      if (this.sprite.anims.currentAnim?.key !== `${this.prefix}-bounce`) {
        this.playBounce();
      }
      this.sprite.setDepth(characterDepth(this.sprite));
      return;
    }

    const dest = this.waypoints[this.destIndex];
    if (!dest) return;
    const dx = dest.x - this.sprite.x;
    const dy = dest.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      this.pauseUntil = this.scene.time.now + Phaser.Math.Between(this.pauseMs[0], this.pauseMs[1]);
      this.pickNext();
      this.playBounce();
      return;
    }

    const dt = Math.min(this.scene.game.loop.delta / 1000, 0.05);
    const step = Math.min(this.speed * dt, dist);
    this.sprite.x += (dx / dist) * step;
    this.sprite.y += (dy / dist) * step;
    if (dx < -0.5) this.facingLeft = true;
    else if (dx > 0.5) this.facingLeft = false;
    this.sprite.setFlipX(this.facingLeft);
    this.sprite.play(`${this.prefix}-walk`, true);
    this.sprite.setDepth(characterDepth(this.sprite));
  }
}
