import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TownScene } from './scenes/TownScene';
import { HouseScene } from './scenes/HouseScene';
import { PaperTossScene } from './scenes/PaperTossScene';
import { State } from './systems/GameState';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,
    height: 600,
  },
  pixelArt: true,
  backgroundColor: '#1a1626',
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, TownScene, HouseScene, PaperTossScene],
});

// Persist on tab close so offline decay resumes from the right moment.
window.addEventListener('beforeunload', () => State.save());

// Dev/E2E hook: lets tests inspect scene state (e.g. wind and bin position).
(window as unknown as { __game: Phaser.Game }).__game = game;
