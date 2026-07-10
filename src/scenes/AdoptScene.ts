import Phaser from 'phaser';
import { State } from '../systems/GameState';
import {
  PET_SPECIES,
  PET_SPECIES_LIST,
  petAnimKey,
  petTextureKey,
  type PetSpecies,
} from '../systems/pets';

const FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#efe8ff' };

/**
 * First-run screen: pick Mametchi or Kuchipatchi and give them a name.
 */
export class AdoptScene extends Phaser.Scene {
  private selected: PetSpecies = 'mametchi';
  private cards: Record<PetSpecies, { ring: Phaser.GameObjects.Rectangle; sprite: Phaser.GameObjects.Sprite }> =
    {} as AdoptScene['cards'];
  private nameInput!: HTMLInputElement;
  private errorText!: Phaser.GameObjects.Text;

  constructor() {
    super('Adopt');
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1626');
    this.add
      .rectangle(400, 300, 800, 600, 0x1a1626)
      .setDepth(-10);

    this.add
      .text(400, 48, 'Pet Village', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '18px',
        color: '#7ed6a8',
      })
      .setOrigin(0.5);

    this.add
      .text(400, 88, 'Choose your pet', { ...FONT, fontSize: '22px', color: '#ffb3d1' })
      .setOrigin(0.5);

    this.add
      .text(400, 118, "They'll live with you in town — name them something you'll remember.", {
        ...FONT,
        fontSize: '13px',
        color: '#a89bc4',
      })
      .setOrigin(0.5);

    const positions: Record<PetSpecies, number> = { mametchi: 250, kuchipatchi: 550 };

    for (const def of PET_SPECIES_LIST) {
      const x = positions[def.id];
      const ring = this.add
        .rectangle(x, 260, 200, 210, 0x2a2440, 0.95)
        .setStrokeStyle(3, 0x3a3352)
        .setInteractive({ useHandCursor: true });

      const sprite = this.add
        .sprite(x, 230, petTextureKey(def.id, 'idle1'))
        .setScale(3.2)
        .setInteractive({ useHandCursor: true });
      sprite.play(petAnimKey(def.id, 'bounce'));

      this.add
        .text(x, 310, def.label, { ...FONT, fontSize: '16px', color: '#ffe066' })
        .setOrigin(0.5);
      this.add
        .text(x, 335, def.blurb, { ...FONT, fontSize: '12px', color: '#a89bc4' })
        .setOrigin(0.5);

      const pick = () => this.selectSpecies(def.id);
      ring.on('pointerdown', pick);
      sprite.on('pointerdown', pick);

      this.cards[def.id] = { ring, sprite };
    }

    this.selectSpecies('mametchi');

    this.add
      .text(400, 400, 'Pet name', { ...FONT, fontSize: '13px', color: '#c8c8dc' })
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
      height: '36px',
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
      .text(400, 470, '', { ...FONT, fontSize: '13px', color: '#ff6b6b' })
      .setOrigin(0.5);

    const start = this.add
      .text(400, 520, '[ Start adventure ]', {
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

  private positionNameInput() {
    const parent = this.game.canvas.parentElement;
    if (!parent) return;
    const canvasRect = this.game.canvas.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    // Game coords 400, 430 → screen, relative to game-host
    const scaleX = canvasRect.width / this.scale.width;
    const scaleY = canvasRect.height / this.scale.height;
    const left = canvasRect.left - parentRect.left + 400 * scaleX - 110;
    const top = canvasRect.top - parentRect.top + 430 * scaleY - 18;
    this.nameInput.style.left = `${left}px`;
    this.nameInput.style.top = `${top}px`;
  }

  private selectSpecies(species: PetSpecies) {
    this.selected = species;
    for (const def of PET_SPECIES_LIST) {
      const card = this.cards[def.id];
      const on = def.id === species;
      card.ring.setStrokeStyle(3, on ? 0x7ed6a8 : 0x3a3352);
      card.ring.setFillStyle(on ? 0x342a52 : 0x2a2440, 0.95);
      card.sprite.setScale(on ? 3.6 : 3.2);
    }
    if (this.nameInput) {
      const def = PET_SPECIES[species];
      // Only auto-fill if the field still holds the other species' default.
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
