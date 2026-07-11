import Phaser from 'phaser';
import { State } from './GameState';
import { blockUi, unblockUi } from './nav';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' };
const FONT_SM = { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff' };

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

// Modal list menu (shop, pet actions, decorate inventory). Click an option or
// press ESC to close. Returns a close function.
export class Menu {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private scene: Phaser.Scene;
  private escKey: Phaser.Input.Keyboard.Key | undefined;
  onClose?: () => void;

  constructor(scene: Phaser.Scene, title: string, options: MenuOption[], subtitle?: string) {
    this.scene = scene;
    const cam = scene.cameras.main;
    const w = 340;
    const rowH = 34;
    const h = 70 + options.length * rowH + (subtitle ? 18 : 0);
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    const dim = scene.add
      .rectangle(0, 0, cam.width, cam.height, 0x000000, 0.5)
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
    const titleText = scene.add
      .text(cx, cy - h / 2 + 20, title, { ...FONT, fontSize: '16px', color: '#ffb3d1' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2002);
    this.objects.push(dim, panel, titleText);

    let top = cy - h / 2 + 42;
    if (subtitle) {
      const st = scene.add
        .text(cx, top - 4, subtitle, { ...FONT_SM, color: '#c8c8dc' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2002);
      this.objects.push(st);
      top += 18;
    }

    options.forEach((opt, i) => {
      const y = top + i * rowH + rowH / 2;
      const row = scene.add
        .rectangle(cx, y, w - 24, rowH - 6, opt.disabled ? 0x3d3d5c : 0x4a4370)
        .setScrollFactor(0)
        .setDepth(2002);
      if (!opt.disabled) {
        row.setInteractive({ useHandCursor: true });
        row.on('pointerover', () => row.setFillStyle(0x5d5490));
        row.on('pointerout', () => row.setFillStyle(0x4a4370));
        row.on('pointerdown', () => {
          this.close();
          opt.onSelect();
        });
      }
      let tx = cx - w / 2 + 24;
      if (opt.icon) {
        const icon = scene.add.image(tx, y, opt.icon).setScrollFactor(0).setDepth(2003);
        icon.setScale(Math.min(1, 22 / icon.height));
        this.objects.push(icon);
        tx += 20;
      }
      const label = scene.add
        .text(tx, y, opt.label, { ...FONT_SM, color: opt.disabled ? '#8a8a9e' : '#ffffff' })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(2003);
      this.objects.push(row, label);
    });

    const hint = scene.add
      .text(cx, cy + h / 2 - 14, 'ESC / click outside to close', { ...FONT_SM, fontSize: '10px', color: '#8a8a9e' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2002);
    this.objects.push(hint);

    blockUi();
    this.escKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey?.on('down', () => this.close());
  }

  close() {
    this.escKey?.off('down');
    this.objects.forEach((o) => o.destroy());
    this.objects = [];
    unblockUi();
    this.onClose?.();
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
