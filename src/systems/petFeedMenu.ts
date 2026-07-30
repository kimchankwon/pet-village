import type Phaser from 'phaser';
import { ITEMS, State, type ItemDef } from './GameState';
import { Menu, type MenuLayout, type MenuOption } from './UI';
import type { Pet } from './Pet';
import { petCanEat, petFoodEffectLabel } from './petFoodRules';

/**
 * Snacks the pet can eat, in `ITEMS` order so the feed menu and the inventory's
 * food list always list them the same way (inventory key order is whatever the
 * player happened to pick up first).
 */
export function feedableFoods(): { item: ItemDef; count: number }[] {
  return Object.values(ITEMS)
    .filter((item) => petCanEat(item) && (State.data.inventory[item.id] ?? 0) > 0)
    .map((item) => ({ item, count: State.data.inventory[item.id]! }));
}

export interface FeedMenuCallbacks {
  closeMenu: () => void;
  /** Called after a successful feed (refresh HUD, etc.). */
  onFed?: () => void;
}

/** Subtitle showing how hungry the pet is before you spend a snack on it. */
export function petNeedsSubtitle(): string {
  const { hunger, happiness } = State.data.pet;
  return `Food ${Math.round(hunger)}/100 · Happy ${Math.round(happiness)}/100`;
}

/** One row per snack, shared by the pet menu and the inventory food list. */
export function feedMenuOptions(pet: Pet, opts: FeedMenuCallbacks): MenuOption[] {
  return feedableFoods().map(({ item, count }) => ({
    label: `${item.name} ×${count} (${petFoodEffectLabel(State.data.pet, item)})`,
    icon: item.texture,
    onSelect: () => {
      if (State.feedPet(item.id)) {
        pet.celebrate('Yum!');
        pet.updateMood();
        opts.onFed?.();
      }
      opts.closeMenu();
    },
  }));
}

/** Shared “Feed pet” entry for pet menus across scenes. */
export function feedPetMenuOption(
  scene: Phaser.Scene,
  pet: Pet,
  opts: FeedMenuCallbacks & {
    keepMenuOpen?: () => void;
    /** Shown when inventory has no food, e.g. "visit shop!". */
    emptyHint?: string;
    /** Re-opens the parent menu so the feed list can offer a Back row. */
    openParent?: () => void;
  },
): MenuOption {
  const empty = feedableFoods().length === 0;
  const hint = opts.emptyHint ? ` (${opts.emptyHint})` : '';
  return {
    label: `Feed ${State.data.petName}${empty ? hint : ''}`,
    icon: 'fish',
    disabled: empty,
    onSelect: () => {
      opts.keepMenuOpen?.();
      openFeedMenu(scene, pet, opts);
    },
  };
}

export function openFeedMenu(
  scene: Phaser.Scene,
  pet: Pet,
  opts: FeedMenuCallbacks & { openParent?: () => void },
) {
  const layout: MenuLayout = { subtitle: petNeedsSubtitle() };
  if (opts.openParent) {
    layout.back = { label: '← Back', onSelect: opts.openParent };
  }
  const menu = new Menu(
    scene,
    `Feed ${State.data.petName}`,
    feedMenuOptions(pet, opts),
    layout,
  );
  menu.onClose = () => opts.closeMenu();
}
