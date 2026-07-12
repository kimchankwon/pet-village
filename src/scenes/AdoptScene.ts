import Phaser from 'phaser';
import { State } from '../systems/GameState';
import {
  CLASSIC_PETS,
  MASCOT_PETS,
  PET_SPECIES,
  PET_SPECIES_LIST,
  PUFFLE_PETS,
  petAnimKey,
  petTextureKey,
  type PetSpecies,
} from '../systems/pets';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#efe8ff' };
/** Must match `layoutRow` scales so selection doesn't blow out the denser row. */
const COMPANION_SCALE = 1.9;
const PUFFLE_SCALE = 1.55;
const SELECTED_SCALE_BUMP = 0.35;

/**
 * First-run screen: pick a Tamagotchi or Club Penguin Puffle and name them.
 */
export class AdoptScene extends Phaser.Scene {
  private selected: PetSpecies = 'mametchi';
  private cards: Partial<
    Record<PetSpecies, { ring: Phaser.GameObjects.Rectangle; sprite: Phaser.GameObjects.Sprite }>
  > = {};
  private nameInput!: HTMLInputElement;
  private errorText!: Phaser.GameObjects.Text;

  constructor() {
    super('Adopt');
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1626');
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    this.add.rectangle(cx, cy, w, h, 0x1a1626).setDepth(-10);

    this.add
      .text(cx, 36, 'Pet Village', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '16px',
        color: '#7ed6a8',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 68, 'Choose your pet', { ...FONT, fontSize: '20px', color: '#ffb3d1' })
      .setOrigin(0.5);

    this.add
      .text(cx, 92, 'Pick a companion — then give them a name.', {
        ...FONT,
        fontSize: '12px',
        color: '#a89bc4',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 118, 'Tamagotchi & friends', { ...FONT, fontSize: '13px', color: '#ffe066' })
      .setOrigin(0.5);

    // One row of the four "big" companions, one row of the eight puffles.
    this.layoutRow([...CLASSIC_PETS, ...MASCOT_PETS], 182, 126, COMPANION_SCALE, 108);
    this.add
      .text(cx, 254, 'Puffles', { ...FONT, fontSize: '13px', color: '#ffe066' })
      .setOrigin(0.5);
    this.layoutRow(PUFFLE_PETS, 314, 88, PUFFLE_SCALE, 96);

    this.selectSpecies('mametchi');

    this.add
      .text(cx, 396, 'Pet name', { ...FONT, fontSize: '13px', color: '#c8c8dc' })
      .setOrigin(0.5);

    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = 12;
    this.nameInput.placeholder = PET_SPECIES.mametchi.defaultName;
    this.nameInput.value = PET_SPECIES.mametchi.defaultName;
    this.nameInput.autocomplete = 'off';
    this.nameInput.spellcheck = false;
    Object.assign(this.nameInput.style, {
      position: 'absolute',
      width: '220px',
      height: '34px',
      border: '3px solid #3a3352',
      borderRadius: '0',
      background: '#161225',
      color: '#efe8ff',
      fontFamily: 'VT323, monospace',
      fontSize: '22px',
      textAlign: 'center',
      outline: 'none',
      zIndex: '20',
      boxSizing: 'border-box',
    } as CSSStyleDeclaration);
    this.game.canvas.parentElement?.appendChild(this.nameInput);
    this.positionNameInput();
    this.scale.on('resize', () => this.positionNameInput());

    this.errorText = this.add
      .text(cx, 462, '', { ...FONT, fontSize: '13px', color: '#ff6b6b' })
      .setOrigin(0.5);

    const start = this.add
      .text(cx, 512, '[ Start adventure ]', {
        ...FONT,
        fontSize: '18px',
        color: '#7ed6a8',
        backgroundColor: '#0d3d2a',
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    start.on('pointerover', () => start.setColor('#a8e6cf'));
    start.on('pointerout', () => start.setColor('#7ed6a8'));
    start.on('pointerdown', () => this.confirm());

    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.confirm();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardownDom());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardownDom());
  }

  private layoutRow(
    defs: typeof CLASSIC_PETS | typeof PUFFLE_PETS | typeof MASCOT_PETS,
    centerY: number,
    spacing: number,
    scale: number,
    cardH: number,
  ) {
    const n = defs.length;
    const startX = this.cameras.main.width / 2 - ((n - 1) * spacing) / 2;
    const cardW = Math.min(180, spacing - 8);

    defs.forEach((def, i) => {
      const x = startX + i * spacing;
      const ring = this.add
        .rectangle(x, centerY, cardW, cardH, 0x2a2440, 0.95)
        .setStrokeStyle(2, 0x3a3352)
        .setInteractive({ useHandCursor: true });

      const sprite = this.add
        .sprite(x, centerY - (def.group === 'puffle' ? 8 : 10), petTextureKey(def.id, 'idle1'))
        .setScale(scale)
        .setInteractive({ useHandCursor: true });
      sprite.play(petAnimKey(def.id, 'bounce'));

      this.add
        .text(x, centerY + cardH / 2 - 13, def.label.replace(' Puffle', ''), {
          ...FONT,
          fontSize: def.group === 'puffle' ? '11px' : '12px',
          color: '#ffe066',
        })
        .setOrigin(0.5);

      const pick = () => this.selectSpecies(def.id);
      ring.on('pointerdown', pick);
      sprite.on('pointerdown', pick);
      this.cards[def.id] = { ring, sprite };
    });
  }

  private positionNameInput() {
    const parent = this.game.canvas.parentElement;
    if (!parent) return;
    const canvasRect = this.game.canvas.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const scaleX = canvasRect.width / this.scale.width;
    const scaleY = canvasRect.height / this.scale.height;
    const left = canvasRect.left - parentRect.left + (this.scale.width / 2) * scaleX - 110;
    const top = canvasRect.top - parentRect.top + 428 * scaleY - 17;
    this.nameInput.style.left = `${left}px`;
    this.nameInput.style.top = `${top}px`;
  }

  private selectSpecies(species: PetSpecies) {
    this.selected = species;
    for (const def of PET_SPECIES_LIST) {
      const card = this.cards[def.id];
      if (!card) continue;
      const on = def.id === species;
      card.ring.setStrokeStyle(2, on ? 0x7ed6a8 : 0x3a3352);
      card.ring.setFillStyle(on ? 0x342a52 : 0x2a2440, 0.95);
      const base = def.group === 'puffle' ? PUFFLE_SCALE : COMPANION_SCALE;
      card.sprite.setScale(on ? base + SELECTED_SCALE_BUMP : base);
    }
    if (this.nameInput) {
      const def = PET_SPECIES[species];
      const otherDefaults = PET_SPECIES_LIST.map((s) => s.defaultName);
      if (!this.nameInput.value.trim() || otherDefaults.includes(this.nameInput.value.trim())) {
        this.nameInput.value = def.defaultName;
        this.nameInput.placeholder = def.defaultName;
      }
    }
  }

  private confirm() {
    const name = this.nameInput.value.trim();
    if (!name) {
      this.errorText.setText('Give your pet a name!');
      this.nameInput.focus();
      return;
    }
    try {
      State.adopt(this.selected, name);
    } catch (err) {
      this.errorText.setText(err instanceof Error ? err.message : 'Could not adopt');
      return;
    }
    this.teardownDom();
    this.scene.start('Town');
  }

  private teardownDom() {
    this.nameInput?.remove();
  }
}
