import type Phaser from 'phaser';
import { FEED_COIN_REWARD, ITEMS, State } from './GameState';
import { Menu, toast, type MenuOption } from './UI';
import type { Pet } from './Pet';

/** Shared “Feed pet” entry for pet menus across scenes. */
export function feedPetMenuOption(
  scene: Phaser.Scene,
  pet: Pet,
  opts: {
    closeMenu: () => void;
    keepMenuOpen?: () => void;
    /** Shown when inventory has no food, e.g. "visit shop!". */
    emptyHint?: string;
    /** Called after a successful feed (refresh HUD, etc.). */
    onFed?: () => void;
  },
): MenuOption {
  const foods = Object.entries(State.data.inventory).filter(([id]) => ITEMS[id]?.kind === 'food');
  const hint = opts.emptyHint ? ` (${opts.emptyHint})` : '';
  return {
    label: `Feed ${State.data.petName}${foods.length === 0 ? hint : ''}`,
    icon: 'fish',
    disabled: foods.length === 0,
    onSelect: () => {
      opts.keepMenuOpen?.();
      openFeedMenu(scene, pet, opts);
    },
  };
}

export function openFeedMenu(
  scene: Phaser.Scene,
  pet: Pet,
  opts: {
    closeMenu: () => void;
    onFed?: () => void;
  },
) {
  const foods = Object.entries(State.data.inventory).filter(([id]) => ITEMS[id]?.kind === 'food');
  const options: MenuOption[] = foods.map(([id, count]) => {
    const item = ITEMS[id]!;
    const tip = item.catchOnly
      ? `+${item.hunger} food`
      : `+${item.hunger} food, +${FEED_COIN_REWARD}c`;
    return {
      label: `${item.name} x${count} (${tip})`,
      icon: item.texture,
      onSelect: () => {
        if (State.feedPet(id)) {
          pet.celebrate('Yum!');
          if (!item.catchOnly) {
            toast(scene, pet.sprite.x, pet.sprite.y - 28, `+${FEED_COIN_REWARD} coins`, '#ffe066');
          }
          pet.updateMood();
          opts.onFed?.();
        }
        opts.closeMenu();
      },
    };
  });
  const menu = new Menu(scene, `Feed ${State.data.petName}`, options);
  menu.onClose = () => opts.closeMenu();
}
