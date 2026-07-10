import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { AdoptScene } from '../scenes/AdoptScene';
import { TownScene } from '../scenes/TownScene';
import { HouseScene } from '../scenes/HouseScene';
import { PaperTossScene } from '../scenes/PaperTossScene';
import { State } from '../systems/GameState';

export function startGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
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
    scene: [BootScene, AdoptScene, TownScene, HouseScene, PaperTossScene],
  });

  const onUnload = () => {
    State.flushCloud();
    State.save();
  };
  window.addEventListener('beforeunload', onUnload);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    window.removeEventListener('beforeunload', onUnload);
  });

  (window as unknown as { __game: Phaser.Game }).__game = game;
  return game;
}
