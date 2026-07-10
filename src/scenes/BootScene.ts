import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';

// Loads real image assets (the pet's sprites) and generates the pixel-art
// textures, then hands off to the town.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Vite base path (e.g. /pet-village/ on GitHub Pages)
    this.load.setPath(import.meta.env.BASE_URL);
    this.load.image('pet-idle1', 'assets/pet/neutral1.png');
    this.load.image('pet-idle2', 'assets/pet/neutral2.png');
    this.load.image('pet-walk1', 'assets/pet/walk1.png');
    this.load.image('pet-walk2', 'assets/pet/walk2.png');
    this.load.image('pet-sad', 'assets/pet/sad.png');
    this.load.image('pet-happy', 'assets/pet/happy.png');
    this.load.image('pet-sleep', 'assets/pet/sleep.png');
    this.load.image('pet-jump', 'assets/pet/jump.png');
  }

  create() {
    generateTextures(this);
    this.anims.create({
      key: 'pet-bounce',
      frames: [{ key: 'pet-idle1' }, { key: 'pet-idle2' }],
      frameRate: 3,
      repeat: -1,
    });
    this.anims.create({
      key: 'pet-walk',
      frames: [{ key: 'pet-walk1' }, { key: 'pet-walk2' }],
      frameRate: 6,
      repeat: -1,
    });
    this.scene.start('Town');
  }
}
