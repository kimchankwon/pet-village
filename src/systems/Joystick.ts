import Phaser from 'phaser';
import { joystickAnchor } from '../game/viewport';
import { markAsUi } from './cameraZoom';

/**
 * Fixed on-screen joystick for touch play. Captures its own pointer, so a
 * second finger can still tap/interact elsewhere. Scenes read `vec` each
 * frame; it's zeroed when released.
 *
 * Landscape: bottom-left. Portrait (9:16): higher and further right.
 */
export class Joystick {
  vec = { x: 0, y: 0 };
  private cx: number;
  private cy: number;
  private radius: number;
  private base: Phaser.GameObjects.Arc | null = null;
  private thumb: Phaser.GameObjects.Arc | null = null;
  private pointerId: number | null = null;
  // Touch-only: on mouse-driven desktops the joystick would just be a
  // dead zone (and in the house it overlaps valid floor cells).
  private enabled: boolean;

  constructor(scene: Phaser.Scene, radius = 54) {
    this.radius = radius;
    this.enabled = scene.sys.game.device.input.touch;
    const cam = scene.cameras.main;
    const anchor = joystickAnchor(cam.width, cam.height, radius);
    this.cx = anchor.cx;
    this.cy = anchor.cy;
    if (!this.enabled) return;

    this.base = scene.add
      .circle(this.cx, this.cy, radius, 0x1a1a2e, 0.35)
      .setScrollFactor(0)
      .setDepth(1400)
      .setStrokeStyle(2, 0xffffff, 0.25);
    this.thumb = scene.add
      .circle(this.cx, this.cy, 26, 0xffffff, 0.4)
      .setScrollFactor(0)
      .setDepth(1401);
    markAsUi(scene, this.base, this.thumb);

    const relayout = () => {
      const c = scene.cameras.main;
      const next = joystickAnchor(c.width, c.height, this.radius);
      this.cx = next.cx;
      this.cy = next.cy;
      this.base?.setPosition(this.cx, this.cy);
      if (this.pointerId === null) this.thumb?.setPosition(this.cx, this.cy);
    };
    scene.scale.on('resize', relayout);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off('resize', relayout);
    });

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.pointerId !== null) return;
      // Claim touches only — mouse clicks (even on touch laptops) pass
      // through to normal click-to-walk / interact handling.
      if (!p.wasTouch) return;
      if (Phaser.Math.Distance.Between(p.x, p.y, this.cx, this.cy) <= this.radius * 1.4) {
        this.pointerId = p.id;
        this.track(p);
      }
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id === this.pointerId) this.track(p);
    });
    const end = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.pointerId) return;
      this.pointerId = null;
      this.vec = { x: 0, y: 0 };
      this.thumb?.setPosition(this.cx, this.cy);
    };
    scene.input.on('pointerup', end);
    scene.input.on('pointerupoutside', end);
  }

  /** True while a pointer is captured by the joystick. */
  get active(): boolean {
    return this.pointerId !== null;
  }

  /** Whether this pointer belongs to (or lands on) the joystick. */
  owns(p: Phaser.Input.Pointer): boolean {
    if (p.id === this.pointerId) return true;
    if (!this.enabled || !p.wasTouch) return false;
    return Phaser.Math.Distance.Between(p.x, p.y, this.cx, this.cy) <= this.radius * 1.4;
  }

  private track(p: Phaser.Input.Pointer) {
    let dx = p.x - this.cx;
    let dy = p.y - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      dx = (dx / d) * this.radius;
      dy = (dy / d) * this.radius;
    }
    this.thumb?.setPosition(this.cx + dx, this.cy + dy);
    this.vec = { x: dx / this.radius, y: dy / this.radius };
  }
}
