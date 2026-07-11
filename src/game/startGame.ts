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

  // save() persists locally and arms the cloud debounce; flush fires it now.
  const persistNow = () => {
    State.save();
    State.flushCloud();
  };
  // beforeunload alone is unreliable (mobile backgrounding / tab kill never
  // fire it, and network sends during unload often die). visibilitychange →
  // hidden fires early — while the page can still deliver the cloud write —
  // and pagehide covers iOS Safari.
  const onHide = () => {
    if (document.visibilityState === 'hidden') {
      persistNow();
    } else {
      // Coming back: Phaser's clocks were suspended and the hide-flush
      // advanced lastSeen — apply the decay the hidden interval earned.
      State.reconcileElapsedDecay();
    }
  };
  window.addEventListener('beforeunload', persistNow);
  window.addEventListener('pagehide', persistNow);
  document.addEventListener('visibilitychange', onHide);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    window.removeEventListener('beforeunload', persistNow);
    window.removeEventListener('pagehide', persistNow);
    document.removeEventListener('visibilitychange', onHide);
  });

  (window as unknown as { __game: Phaser.Game }).__game = game;
  return game;
}
