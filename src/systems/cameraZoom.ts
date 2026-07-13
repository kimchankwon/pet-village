import Phaser from 'phaser';
import type { Joystick } from './Joystick';

/** How far you can zoom out / in. */
export const ZOOM_MIN = 0.9;
export const ZOOM_MAX = 2.0;

/** Town, shore, interiors — slightly closer than the old 1× view. */
export const ZOOM_DEFAULT_HUB = 1.25;

/** Minigames — 1× so the designed playfield fits the view. */
export const ZOOM_DEFAULT_GAME = 1.0;

export type ZoomKind = 'hub' | 'game';

const UI_CAM_NAME = 'ui';
const UI_FLAG = 'zoomUi';

/** Last zoom per scene so each minigame can keep its own fit default. */
const remembered: Record<string, number> = {};

function clampZoom(z: number): number {
  return Phaser.Math.Clamp(z, ZOOM_MIN, ZOOM_MAX);
}

function memoryKey(kind: ZoomKind, sceneKey: string): string {
  return `${kind}:${sceneKey}`;
}

/**
 * Tag HUD / chrome so the main (zoomed) camera ignores it and the UI
 * camera draws it at 1×. Call after creating the object(s).
 */
export function markAsUi(
  scene: Phaser.Scene,
  ...objs: (Phaser.GameObjects.GameObject | null | undefined)[]
): void {
  const ui = ensureUiCamera(scene);
  const main = scene.cameras.main;
  for (const o of objs) {
    if (!o) continue;
    o.setData(UI_FLAG, true);
    main.ignore(o);
    // Children may have been ignored by the UI cam when first added to the
    // scene (before they were parented into a UI container).
    clearCameraIgnore(ui, o);
  }
}

function clearCameraIgnore(
  cam: Phaser.Cameras.Scene2D.Camera,
  go: Phaser.GameObjects.GameObject,
): void {
  go.cameraFilter &= ~cam.id;
  if (go instanceof Phaser.GameObjects.Container) {
    for (const child of go.list) {
      clearCameraIgnore(cam, child as Phaser.GameObjects.GameObject);
    }
  }
}

function isUiMarked(go: Phaser.GameObjects.GameObject): boolean {
  if (go.getData(UI_FLAG)) return true;
  let parent = go.parentContainer;
  while (parent) {
    if (parent.getData(UI_FLAG)) return true;
    parent = parent.parentContainer;
  }
  return false;
}

function ensureUiCamera(scene: Phaser.Scene): Phaser.Cameras.Scene2D.Camera {
  const existing = scene.cameras.getCamera(UI_CAM_NAME);
  if (existing) return existing;

  const main = scene.cameras.main;
  const ui = scene.cameras.add(0, 0, main.width, main.height, false, UI_CAM_NAME);
  ui.setScroll(0, 0);
  ui.setZoom(1);
  ui.transparent = true;

  const ignoreWorld = (go: Phaser.GameObjects.GameObject) => {
    if (isUiMarked(go)) return;
    ui.ignore(go);
  };

  for (const child of scene.children.list) {
    ignoreWorld(child);
  }

  const onAdded = (go: Phaser.GameObjects.GameObject) => ignoreWorld(go);
  scene.sys.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded);

  const onResize = (gameSize: Phaser.Structs.Size) => {
    ui.setSize(gameSize.width, gameSize.height);
    ui.setScroll(0, 0);
  };
  scene.scale.on('resize', onResize);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.sys.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded);
    scene.scale.off('resize', onResize);
    scene.cameras.remove(ui);
  });

  return ui;
}

export interface CameraZoomOpts {
  kind: ZoomKind;
  /** When true, wheel / pinch / slider are ignored (menus, etc.). */
  isBlocked?: () => boolean;
  joystick?: Joystick | null;
  /** Cancel walk / drag when a pinch starts. */
  onPinchStart?: () => void;
}

/**
 * Wheel (desktop), pinch (mobile), and a right-edge vertical slider.
 * Returns a small handle scenes can query (e.g. to ignore pinch as a tap).
 */
export function attachCameraZoom(
  scene: Phaser.Scene,
  opts: CameraZoomOpts,
): CameraZoom {
  return new CameraZoom(scene, opts);
}

export class CameraZoom {
  private scene: Phaser.Scene;
  private opts: CameraZoomOpts;
  private zoom: number;
  private slider!: ZoomSlider;
  private pinching = false;
  private pinchStartDist = 0;
  private pinchStartZoom = 1;
  private destroyed = false;

  constructor(scene: Phaser.Scene, opts: CameraZoomOpts) {
    this.scene = scene;
    this.opts = opts;
    ensureUiCamera(scene);

    const key = memoryKey(opts.kind, scene.scene.key);
    const fallback = opts.kind === 'game' ? ZOOM_DEFAULT_GAME : ZOOM_DEFAULT_HUB;
    const initial = clampZoom(remembered[key] ?? fallback);
    this.zoom = initial;
    scene.cameras.main.setZoom(initial);

    this.slider = new ZoomSlider(scene, {
      getZoom: () => this.zoom,
      setZoom: (z) => this.setZoom(z),
      isBlocked: () => this.blocked(),
    });

    scene.input.on('wheel', this.onWheel);
    scene.input.on('pointerdown', this.onPointerDown);
    scene.input.on('pointermove', this.onPointerMove);
    scene.input.on('pointerup', this.onPointerUp);
    scene.input.on('pointerupoutside', this.onPointerUp);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** True while a two-finger pinch is active. */
  isPinching(): boolean {
    return this.pinching;
  }

  /** True if this pointer is on the zoom slider. */
  ownsPointer(p: Phaser.Input.Pointer): boolean {
    return this.slider.owns(p);
  }

  get value(): number {
    return this.zoom;
  }

  setZoom(z: number) {
    if (this.destroyed) return;
    const next = clampZoom(z);
    if (Math.abs(next - this.zoom) < 0.0005) {
      this.slider.sync();
      return;
    }
    this.zoom = next;
    remembered[memoryKey(this.opts.kind, this.scene.scene.key)] = next;
    this.scene.cameras.main.setZoom(next);
    this.slider.sync();
  }

  private blocked(): boolean {
    return this.opts.isBlocked?.() ?? false;
  }

  private onWheel = (
    _pointer: Phaser.Input.Pointer,
    _over: Phaser.GameObjects.GameObject[],
    _dx: number,
    dy: number,
  ) => {
    if (this.blocked() || dy === 0) return;
    // Browser: positive dy = scroll down = zoom out.
    const factor = dy > 0 ? 0.92 : 1.08;
    this.setZoom(this.zoom * factor);
  };

  private touchPointers(): Phaser.Input.Pointer[] {
    const out: Phaser.Input.Pointer[] = [];
    for (const p of this.scene.input.manager.pointers) {
      if (!p || !p.active || !p.isDown || !p.wasTouch) continue;
      if (this.opts.joystick?.owns(p)) continue;
      if (this.slider.owns(p)) continue;
      out.push(p);
    }
    return out;
  }

  private onPointerDown = (_p: Phaser.Input.Pointer) => {
    if (this.blocked()) return;
    const touches = this.touchPointers();
    if (touches.length >= 2) {
      const a = touches[0]!;
      const b = touches[1]!;
      this.pinchStartDist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      this.pinchStartZoom = this.zoom;
      if (!this.pinching) {
        this.pinching = true;
        this.opts.onPinchStart?.();
      }
    }
  };

  private onPointerMove = (_p: Phaser.Input.Pointer) => {
    if (!this.pinching || this.blocked()) return;
    const touches = this.touchPointers();
    if (touches.length < 2 || this.pinchStartDist < 8) return;
    const a = touches[0]!;
    const b = touches[1]!;
    const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    this.setZoom(this.pinchStartZoom * (dist / this.pinchStartDist));
  };

  private onPointerUp = (_p: Phaser.Input.Pointer) => {
    if (!this.pinching) return;
    if (this.touchPointers().length < 2) {
      this.pinching = false;
      this.pinchStartDist = 0;
    }
  };

  private destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.input.off('wheel', this.onWheel);
    this.scene.input.off('pointerdown', this.onPointerDown);
    this.scene.input.off('pointermove', this.onPointerMove);
    this.scene.input.off('pointerup', this.onPointerUp);
    this.scene.input.off('pointerupoutside', this.onPointerUp);
    this.slider.destroy();
  }
}

interface ZoomSliderOpts {
  getZoom: () => number;
  setZoom: (z: number) => void;
  isBlocked: () => boolean;
}

/** Vertical zoom slider anchored to the right edge of the view. */
class ZoomSlider {
  private scene: Phaser.Scene;
  private opts: ZoomSliderOpts;
  private root: Phaser.GameObjects.Container;
  private track: Phaser.GameObjects.Rectangle;
  private fill: Phaser.GameObjects.Rectangle;
  private thumb: Phaser.GameObjects.Arc;
  private pointerId: number | null = null;
  private trackH = 160;
  private trackW = 10;
  private readonly padRight = 18;

  constructor(scene: Phaser.Scene, opts: ZoomSliderOpts) {
    this.scene = scene;
    this.opts = opts;

    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(1460);

    const bg = scene.add
      .rectangle(0, 0, 36, this.trackH + 48, 0x1a1a2e, 0.55)
      .setStrokeStyle(2, 0xffffff, 0.12);
    this.track = scene.add.rectangle(0, 0, this.trackW, this.trackH, 0x3d3d5c).setOrigin(0.5);
    // Origin top — sync() pins the top to the thumb and grows toward the bottom.
    this.fill = scene.add.rectangle(0, 0, this.trackW, 2, 0x6b63a8).setOrigin(0.5, 0);
    this.thumb = scene.add.circle(0, 0, 11, 0xffe066).setStrokeStyle(2, 0x1a1a2e, 0.9);

    const plus = scene.add
      .text(0, -this.trackH / 2 - 18, '+', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffe066',
      })
      .setOrigin(0.5);
    const minus = scene.add
      .text(0, this.trackH / 2 + 16, '−', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffe066',
      })
      .setOrigin(0.5);

    this.root.add([bg, this.track, this.fill, this.thumb, plus, minus]);
    // Mark after children exist so clearCameraIgnore can un-ignore them on the UI cam.
    markAsUi(scene, this.root);

    // Hit area covers the whole chrome so it's easy to grab on touch.
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.opts.isBlocked()) return;
      this.pointerId = p.id;
      this.applyFromPointer(p);
    });

    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);
    scene.input.on('pointerupoutside', this.onUp);

    this.place();
    this.sync();
    scene.scale.on('resize', this.place);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off('resize', this.place);
      scene.input.off('pointermove', this.onMove);
      scene.input.off('pointerup', this.onUp);
      scene.input.off('pointerupoutside', this.onUp);
    });
  }

  owns(p: Phaser.Input.Pointer): boolean {
    if (p.id === this.pointerId) return true;
    const b = this.root.getBounds();
    return b.contains(p.x, p.y);
  }

  sync() {
    const half = this.trackH / 2;
    const t = Phaser.Math.Clamp(
      (this.opts.getZoom() - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN),
      0,
      1,
    );
    // Bottom = zoomed out, top = zoomed in. Thumb and fill share that side.
    const thumbY = half - t * this.trackH;
    this.thumb.setPosition(0, thumbY);
    // Fill is anchored to the thumb and grows downward to the track bottom.
    const fillH = Math.max(2, half - thumbY);
    this.fill.setOrigin(0.5, 0);
    this.fill.setPosition(0, thumbY);
    this.fill.setSize(this.trackW, fillH);
  }

  destroy() {
    this.root.destroy(true);
  }

  private place = () => {
    const cam = this.scene.cameras.main;
    // Mid-right, clear of top chrome and the bottom [ Pet ] / Back buttons.
    const x = cam.width - this.padRight - 8;
    const y = cam.height * 0.45;
    this.root.setPosition(x, y);
  };

  private onMove = (p: Phaser.Input.Pointer) => {
    if (p.id !== this.pointerId) return;
    this.applyFromPointer(p);
  };

  private onUp = (p: Phaser.Input.Pointer) => {
    if (p.id === this.pointerId) this.pointerId = null;
  };

  private applyFromPointer(p: Phaser.Input.Pointer) {
    const localY = p.y - this.root.y;
    const half = this.trackH / 2;
    const t = Phaser.Math.Clamp(1 - (localY + half) / this.trackH, 0, 1);
    this.opts.setZoom(Phaser.Math.Linear(ZOOM_MIN, ZOOM_MAX, t));
  }
}
