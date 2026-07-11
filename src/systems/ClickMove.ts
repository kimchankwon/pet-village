// Club Penguin-style click-to-move: set a world target, steer toward it each frame.

export class ClickMove {
  target: { x: number; y: number } | null = null;
  private marker: Phaser.GameObjects.Arc | null = null;
  private scene: Phaser.Scene;
  private stuckFrames = 0;
  private lastX = 0;
  private lastY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** quiet: update the target without the click-marker ping (hold-to-move). */
  setTarget(x: number, y: number, quiet = false) {
    this.target = { x, y };
    this.stuckFrames = 0;
    if (!quiet) this.showMarker(x, y);
  }

  clear() {
    this.target = null;
    this.stuckFrames = 0;
    this.hideMarker();
  }

  /** Returns velocity toward the target, or zeros if idle / arrived / stuck. */
  step(
    x: number,
    y: number,
    speed: number,
    arriveDist = 10,
  ): { vx: number; vy: number; moving: boolean } {
    if (!this.target) return { vx: 0, vy: 0, moving: false };

    const dx = this.target.x - x;
    const dy = this.target.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist <= arriveDist) {
      this.clear();
      return { vx: 0, vy: 0, moving: false };
    }

    // Give up if a collider has blocked progress for a bit.
    const moved = Math.hypot(x - this.lastX, y - this.lastY);
    this.lastX = x;
    this.lastY = y;
    if (moved < 0.4) {
      this.stuckFrames++;
      if (this.stuckFrames > 20) {
        this.clear();
        return { vx: 0, vy: 0, moving: false };
      }
    } else {
      this.stuckFrames = 0;
    }

    return {
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      moving: true,
    };
  }

  private showMarker(x: number, y: number) {
    this.hideMarker();
    const ring = this.scene.add
      .circle(x, y, 14, 0x7ed6ff, 0.35)
      .setStrokeStyle(3, 0x7ed6ff, 0.95)
      .setDepth(y + 1);
    this.marker = ring;
    this.scene.tweens.add({
      targets: ring,
      scale: 1.35,
      alpha: 0,
      duration: 450,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (this.marker === ring) this.marker = null;
        ring.destroy();
      },
    });
  }

  private hideMarker() {
    this.marker?.destroy();
    this.marker = null;
  }
}
