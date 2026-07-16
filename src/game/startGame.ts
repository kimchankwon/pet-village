import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { AdoptScene } from '../scenes/AdoptScene';
import { TownScene } from '../scenes/TownScene';
import { HouseScene } from '../scenes/HouseScene';
import { ShopScene } from '../scenes/ShopScene';
import { ClothesShopScene } from '../scenes/ClothesShopScene';
import { PaperTossScene } from '../scenes/PaperTossScene';
import { GetScene } from '../scenes/GetScene';
import { ShoreScene } from '../scenes/ShoreScene';
import { FishingScene } from '../scenes/FishingScene';
import { SkipRopeScene } from '../scenes/SkipRopeScene';
import { EastParkScene, WestParkScene } from '../scenes/ParkScene';
import { BumpScene } from '../scenes/BumpScene';
import { State } from '../systems/GameState';
import { BASE_HEIGHT, BASE_WIDTH, designSizeForHost } from './viewport';

function applyHostAspect(game: Phaser.Game, parent: HTMLElement) {
  const { width, height } = designSizeForHost(parent.clientWidth, parent.clientHeight);
  if (game.scale.width !== width || game.scale.height !== height) {
    game.scale.resize(width, height);
  }
  game.scale.refresh();
}

export function startGame(parent: HTMLElement): Phaser.Game {
  // Size matches the host aspect (expanded from 800×600). FIT then scales
  // uniformly to fill the host — no letterbox, no stretched pixels.
  const initial = designSizeForHost(parent.clientWidth || BASE_WIDTH, parent.clientHeight || BASE_HEIGHT);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: initial.width,
      height: initial.height,
    },
    pixelArt: true,
    backgroundColor: '#1a1626',
    // Phaser's loader only tops up its download queue from scene UPDATE
    // ticks, which stop entirely while the tab is hidden/occluded (rAF is
    // suspended) — boot would stall after the first 32 files until the tab
    // is foregrounded. Issuing every file up front keeps the browser's own
    // network queue draining in the background.
    loader: { maxParallelDownloads: 400 },
    // Phaser provisions one pointer by default; joystick + two-finger
    // pinch + a spare tap need more than that.
    input: { activePointers: 4 },
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    scene: [
      BootScene,
      AdoptScene,
      TownScene,
      HouseScene,
      ShopScene,
      ClothesShopScene,
      PaperTossScene,
      GetScene,
      ShoreScene,
      FishingScene,
      SkipRopeScene,
      WestParkScene,
      EastParkScene,
      BumpScene,
    ],
  });

  const onResize = () => applyHostAspect(game, parent);
  window.addEventListener('resize', onResize);
  game.events.once(Phaser.Core.Events.READY, () => applyHostAspect(game, parent));
  queueMicrotask(() => applyHostAspect(game, parent));

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
    window.removeEventListener('resize', onResize);
    window.removeEventListener('beforeunload', persistNow);
    window.removeEventListener('pagehide', persistNow);
    document.removeEventListener('visibilitychange', onHide);
  });

  (window as unknown as { __game: Phaser.Game }).__game = game;
  return game;
}
