import Phaser from 'phaser';
import { State } from './GameState';
import { blockUi, unblockUi } from './nav';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };
const FONT_SM = { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff' };

const ROW_IDLE = 0x4a4370;
const ROW_HOVER = 0x5d5490;
const ROW_SELECTED = 0x6b63a8;
const ROW_DISABLED = 0x3d3d5c;

// Heads-up display: pet name, coins + pet need bars. Fixed to camera.
export class HUD {
  private scene: Phaser.Scene;
  private nameText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private bars: { key: 'hunger' | 'happiness' | 'energy'; fill: Phaser.GameObjects.Rectangle }[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const c = scene.add.container(0, 0).setScrollFactor(0).setDepth(1000);

    const panel = scene.add.rectangle(10, 10, 190, 128, 0x1a1a2e, 0.75).setOrigin(0);
    c.add(panel);

    // Pet name headlines the panel, above the need bars.
    this.nameText = scene.add.text(18, 18, '', { ...FONT, color: '#ffb3d1' });
    c.add(this.nameText);

    const coin = scene.add.image(26, 48, 'coin').setScale(0.9);
    this.coinText = scene.add.text(40, 40, '0', FONT);
    c.add([coin, this.coinText]);

    const defs: { key: 'hunger' | 'happiness' | 'energy'; label: string; color: number }[] = [
      { key: 'hunger', label: 'Food', color: 0xff9f43 },
      { key: 'happiness', label: 'Happy', color: 0xff7fab },
      { key: 'energy', label: 'Energy', color: 0x74b9ff },
    ];
    defs.forEach((d, i) => {
      const y = 68 + i * 20;
      c.add(scene.add.text(18, y - 6, d.label, { ...FONT_SM, color: '#c8c8dc' }));
      c.add(scene.add.rectangle(78, y, 110, 10, 0x3d3d5c).setOrigin(0, 0.5));
      const fill = scene.add.rectangle(78, y, 110, 10, d.color).setOrigin(0, 0.5);
      c.add(fill);
      this.bars.push({ key: d.key, fill });
    });

    this.refresh();
  }

  refresh() {
    this.nameText.setText(State.data.petName || 'Your pet');
    this.coinText.setText(String(State.coins));
    for (const b of this.bars) {
      b.fill.width = Math.max(0, (State.data.pet[b.key] / 100) * 110);
    }
  }
}

// Small floating text (e.g. "+10", "Yum!") that rises and fades.
export function toast(scene: Phaser.Scene, x: number, y: number, msg: string, color = '#ffffff') {
  const t = scene.add
    .text(x, y, msg, { ...FONT, color, stroke: '#1a1a2e', strokeThickness: 4 })
    .setOrigin(0.5)
    .setDepth(1500);
  scene.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
}

export interface MenuOption {
  label: string;
  icon?: string; // texture key
  disabled?: boolean;
  onSelect: () => void;
}

export interface MenuLayout {
  subtitle?: string;
  /** Screen placement. Character talk uses `bottom`. Default: center. */
  anchor?: 'center' | 'bottom';
  /** Speaker portrait texture key (shown left of the title). */
  face?: string;
}

function resolveLayout(subtitleOrLayout?: string | MenuLayout): MenuLayout {
  if (subtitleOrLayout == null) return {};
  if (typeof subtitleOrLayout === 'string') return { subtitle: subtitleOrLayout };
  return subtitleOrLayout;
}

type MenuRow = {
  opt: MenuOption;
  row: Phaser.GameObjects.Rectangle;
};

// Modal list menu (shop, pet actions, decorate inventory). Click / arrows+WASD
// / Space+E to select; ESC or click outside to close.
export class Menu {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private scene: Phaser.Scene;
  private rows: MenuRow[] = [];
  private enabledIndexes: number[] = [];
  private selected = 0;
  private keys: Phaser.Input.Keyboard.Key[] = [];
  onClose?: () => void;

  constructor(
    scene: Phaser.Scene,
    title: string,
    options: MenuOption[],
    subtitleOrLayout?: string | MenuLayout,
  ) {
    this.scene = scene;
    const layout = resolveLayout(subtitleOrLayout);
    const cam = scene.cameras.main;
    const hasFace = Boolean(layout.face && scene.textures.exists(layout.face));
    const faceSlot = hasFace ? 78 : 0;

    // Widen to fit the longest label (12px monospace ≈ 7.2px/char + icon + padding).
    const maxChars = options.reduce(
      (m, o) => Math.max(m, o.label.length),
      Math.max(layout.subtitle?.length ?? 0, title.length),
    );
    const w = Phaser.Math.Clamp(110 + Math.min(maxChars, 52) * 8.5 + faceSlot, 380, 640);
    const rowH = 44;
    const wrapW = w - faceSlot - 36;
    const subtitleLines = layout.subtitle
      ? Math.max(1, Math.ceil((layout.subtitle.length * 7.2) / wrapW))
      : 0;
    const subtitleH = subtitleLines > 0 ? subtitleLines * 15 + 10 : 0;
    const headerExtra = hasFace ? 36 : 0;
    const h = 56 + headerExtra + subtitleH + options.length * rowH + 28;
    const cx = cam.width / 2;
    const cy =
      layout.anchor === 'bottom'
        ? cam.height - 16 - h / 2
        : cam.height / 2;

    const dim = scene.add
      .rectangle(0, 0, cam.width, cam.height, 0x000000, 0.45)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(2000)
      .setInteractive(); // swallow clicks behind the menu
    dim.on('pointerdown', () => this.close());

    const panel = scene.add
      .rectangle(cx, cy, w, h, 0x2a2440, 0.97)
      .setScrollFactor(0)
      .setDepth(2001)
      .setStrokeStyle(3, 0xffb3d1)
      .setInteractive(); // block dim's close handler

    const headerLeft = cx - w / 2 + faceSlot;
    const titleX = hasFace ? headerLeft + 12 : cx;
    const titleOrigin = hasFace ? 0 : 0.5;
    const titleY = cy - h / 2 + (hasFace ? 28 : 20);

    if (hasFace && layout.face) {
      const faceBg = scene.add
        .rectangle(cx - w / 2 + faceSlot / 2, cy - h / 2 + 44, 64, 64, 0x1a1626)
        .setStrokeStyle(2, 0xffe066)
        .setScrollFactor(0)
        .setDepth(2002);
      const face = scene.add
        .image(cx - w / 2 + faceSlot / 2, cy - h / 2 + 44, layout.face)
        .setScrollFactor(0)
        .setDepth(2003);
      face.setScale(Math.min(2.2, 52 / Math.max(face.width, face.height)));
      this.objects.push(faceBg, face);
    }

    const titleText = scene.add
      .text(titleX, titleY, title, { ...FONT, fontSize: '16px', color: '#ffb3d1' })
      .setOrigin(titleOrigin, 0.5)
      .setScrollFactor(0)
      .setDepth(2002);
    this.objects.push(dim, panel, titleText);

    let top = cy - h / 2 + (hasFace ? 58 : 42);
    if (layout.subtitle) {
      const st = scene.add
        .text(titleX, top, layout.subtitle, {
          ...FONT_SM,
          color: '#c8c8dc',
          wordWrap: { width: w - faceSlot - 36 },
        })
        .setOrigin(titleOrigin, 0)
        .setScrollFactor(0)
        .setDepth(2002);
      this.objects.push(st);
      top += Math.max(22, st.height + 8);
    } else if (hasFace) {
      top = cy - h / 2 + 78;
    }

    options.forEach((opt, i) => {
      const y = top + i * rowH + rowH / 2;
      const row = scene.add
        .rectangle(cx, y, w - 24, rowH - 6, opt.disabled ? ROW_DISABLED : ROW_IDLE)
        .setScrollFactor(0)
        .setDepth(2002);
      if (!opt.disabled) {
        row.setInteractive({ useHandCursor: true });
        row.on('pointerover', () => {
          this.selected = this.enabledIndexes.indexOf(i);
          this.paintSelection();
        });
        row.on('pointerdown', () => {
          this.activate(i);
        });
        this.enabledIndexes.push(i);
      }
      let tx = cx - w / 2 + 24;
      if (opt.icon) {
        const icon = scene.add.image(tx + 4, y, opt.icon).setScrollFactor(0).setDepth(2003);
        icon.setScale(Math.min(1.2, 30 / icon.height));
        this.objects.push(icon);
        tx += 26;
      }
      const label = scene.add
        .text(tx, y, opt.label, { ...FONT, color: opt.disabled ? '#8a8a9e' : '#ffffff' })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(2003);
      this.objects.push(row, label);
      this.rows.push({ opt, row });
    });

    const hint = scene.add
      .text(cx, cy + h / 2 - 14, '↑↓ / WASD  ·  Space / E  ·  ESC', {
        ...FONT_SM,
        fontSize: '10px',
        color: '#8a8a9e',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2002);
    this.objects.push(hint);

    blockUi();
    this.selected = 0;
    this.paintSelection();
    this.bindKeys();
  }

  private paintSelection() {
    for (let i = 0; i < this.rows.length; i++) {
      const { opt, row } = this.rows[i]!;
      if (opt.disabled) {
        row.setFillStyle(ROW_DISABLED);
        continue;
      }
      const on = this.enabledIndexes[this.selected] === i;
      row.setFillStyle(on ? ROW_SELECTED : ROW_IDLE);
      row.setStrokeStyle(on ? 2 : 0, 0xffe066);
    }
  }

  private move(delta: number) {
    if (this.enabledIndexes.length === 0) return;
    const n = this.enabledIndexes.length;
    this.selected = (this.selected + delta + n * 10) % n;
    this.paintSelection();
  }

  private activate(optionIndex: number) {
    const entry = this.rows[optionIndex];
    if (!entry || entry.opt.disabled) return;
    const fn = entry.opt.onSelect;
    this.close();
    fn();
  }

  private confirm() {
    const idx = this.enabledIndexes[this.selected];
    if (idx == null) return;
    this.activate(idx);
  }

  private bindKeys() {
    const kb = this.scene.input.keyboard;
    if (!kb) return;
    const Codes = Phaser.Input.Keyboard.KeyCodes;
    const bind = (code: number, fn: () => void) => {
      const key = kb.addKey(code, false);
      key.on('down', fn);
      this.keys.push(key);
    };
    bind(Codes.UP, () => this.move(-1));
    bind(Codes.DOWN, () => this.move(1));
    bind(Codes.W, () => this.move(-1));
    bind(Codes.S, () => this.move(1));
    bind(Codes.A, () => this.move(-1));
    bind(Codes.D, () => this.move(1));
    bind(Codes.LEFT, () => this.move(-1));
    bind(Codes.RIGHT, () => this.move(1));
    bind(Codes.SPACE, () => this.confirm());
    bind(Codes.ENTER, () => this.confirm());
    bind(Codes.E, () => this.confirm());
    bind(Codes.ESC, () => this.close());
  }

  close() {
    for (const key of this.keys) {
      key.removeAllListeners();
      this.scene.input.keyboard?.removeKey(key);
    }
    this.keys = [];
    this.objects.forEach((o) => o.destroy());
    this.objects = [];
    this.rows = [];
    unblockUi();
    this.onClose?.();
  }
}

/**
 * Bottom-right action buttons ([ Pet ] opens the pet menu without needing
 * to stand next to it; [ Menu ] opens the game menu). `before` runs first
 * so scenes can swallow the click (ignoreClicksUntil).
 */
export function bottomButtons(
  scene: Phaser.Scene,
  buttons: { label: string; onTap: () => void }[],
  before: () => void,
) {
  let x = 786;
  for (const def of buttons) {
    const b = scene.add
      .text(x, 556, def.label, {
        ...FONT,
        fontSize: '17px',
        color: '#ffe066',
        backgroundColor: '#1a1a2ecc',
        padding: { x: 12, y: 9 },
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(1450)
      .setInteractive({ useHandCursor: true });
    b.on('pointerdown', () => {
      before();
      def.onTap();
    });
    x -= b.width + 12;
  }
}

// Bottom-of-screen contextual prompt ("E — Talk to Bella").
export class Prompt {
  private text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(scene.cameras.main.width / 2, scene.cameras.main.height - 24, '', {
        ...FONT,
        color: '#ffffff',
        backgroundColor: '#1a1a2ecc',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1200)
      .setVisible(false);
  }

  show(msg: string) {
    this.text.setText(msg).setVisible(true);
  }

  hide() {
    this.text.setVisible(false);
  }
}
