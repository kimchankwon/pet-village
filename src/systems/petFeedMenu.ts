import type Phaser from 'phaser';
import { ITEMS, State } from './GameState';
import { Menu, type MenuOption } from './UI';
import type { Pet } from './Pet';
import { petCanEat } from './petFoodRules';

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
  const foods = Object.entries(State.data.inventory).filter(
    ([id, count]) => count > 0 && petCanEat(ITEMS[id]),
  );
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
  const foods = Object.entries(State.data.inventory).filter(
    ([id, count]) => count > 0 && petCanEat(ITEMS[id]),
  );
  const options: MenuOption[] = foods.map(([id, count]) => {
    const item = ITEMS[id]!;
    const tip = `+${item.hunger} food`;
    return {
      label: `${item.name} x${count} (${tip})`,
      icon: item.texture,
      onSelect: () => {
        if (State.feedPet(id)) {
          pet.celebrate('Yum!');
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
