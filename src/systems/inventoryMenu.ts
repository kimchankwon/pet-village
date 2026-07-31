import type Phaser from 'phaser';
import { refreshPenguin } from '../sprites/pixelart';
import { ACCESSORY_LIST } from './accessories';
import { ITEMS, State, type ItemDef } from './GameState';
import type { Pet } from './Pet';
import { feedMenuOptions, petNeedsSubtitle } from './petFeedMenu';
import { Menu, menuFocusForIndex, type MenuOption } from './UI';

export interface InventoryMenuCallbacks {
  closeMenu: () => void;
  keepMenuOpen: () => void;
  /** Pet standing in this scene — lets the food list feed it in place. */
  pet?: Pet;
  /** Called after a successful feed (refresh HUD, etc.). */
  onFed?: () => void;
}

function itemTotal(kind: ItemDef['kind']) {
  return Object.values(ITEMS)
    .filter((item) => item.kind === kind)
    .reduce((total, item) => total + (State.data.inventory[item.id] ?? 0), 0);
}

/** Player-owned items and penguin clothes. Opened with I in every hub scene. */
export function openInventoryMenu(scene: Phaser.Scene, cbs: InventoryMenuCallbacks) {
  cbs.keepMenuOpen();
  const playerClothes = ACCESSORY_LIST.filter(
    (item) => State.isPenguinAccessory(item.id) && State.ownsAccessory(item.id),
  );
  const food = itemTotal('food');
  const bait = itemTotal('bait');
  const furniture = itemTotal('furniture');
  const menu = new Menu(
    scene,
    'Your Inventory',
    [
      {
        label: `Your clothes · ${playerClothes.length} owned`,
        icon: playerClothes[0]?.texture ?? 'acc-red-scarf',
        onSelect: () => openPlayerClothes(scene, cbs),
      },
      {
        label: `Food & treats · ${food}${cbs.pet && food > 0 ? ' · feed here' : ''}`,
        icon: 'fish',
        onSelect: () => openItemList(scene, cbs, 'food', 'Food & treats'),
      },
      {
        label: `Fishing bait · ${bait}`,
        icon: 'bait',
        onSelect: () => openItemList(scene, cbs, 'bait', 'Fishing bait'),
      },
      {
        label: `Furniture · ${furniture}`,
        icon: 'item-plant',
        onSelect: () => openItemList(scene, cbs, 'furniture', 'Furniture'),
      },
    ],
    {
      subtitle: `${State.coins} coins · I opens your items and clothes`,
      face: 'penguin-down',
    },
  );
  menu.onClose = cbs.closeMenu;
}

function openPlayerClothes(
  scene: Phaser.Scene,
  cbs: InventoryMenuCallbacks,
  focusIndex = 0,
) {
  cbs.keepMenuOpen();
  const owned = ACCESSORY_LIST.filter(
    (item) => State.isPenguinAccessory(item.id) && State.ownsAccessory(item.id),
  );
  const options: MenuOption[] = owned.map((item, index) => ({
    label: `${State.isPenguinAccessoryEquipped(item.id) ? '●' : '○'} ${item.name}`,
    icon: item.texture,
    onSelect: () => {
      State.togglePenguinAccessory(item.id);
      refreshPenguin(scene);
      openPlayerClothes(scene, cbs, index);
    },
  }));

  if (options.length === 0) {
    options.push({
      label: 'No clothes yet — visit Cinnamoroll!',
      disabled: true,
      onSelect: () => undefined,
    });
  } else {
    const unequipIndex = options.length;
    options.push({
      label: 'Unequip your clothes',
      onSelect: () => {
        State.unequipAllPenguinAccessories();
        refreshPenguin(scene);
        openPlayerClothes(scene, cbs, unequipIndex);
      },
    });
  }

  const wearing = owned
    .filter((item) => State.isPenguinAccessoryEquipped(item.id))
    .map((item) => item.name)
    .join(', ');
  const focus = menuFocusForIndex(options, focusIndex);
  const menu = new Menu(scene, 'Your clothes', options, {
    subtitle: wearing ? `Wearing: ${wearing}` : 'Wearing: nothing yet',
    ...focus,
    back: {
      label: '← Back to Inventory',
      onSelect: () => openInventoryMenu(scene, cbs),
    },
  });
  menu.onClose = cbs.closeMenu;
}

function openItemList(
  scene: Phaser.Scene,
  cbs: InventoryMenuCallbacks,
  kind: ItemDef['kind'],
  title: string,
) {
  cbs.keepMenuOpen();
  // Food is actionable: pick a snack here and the pet eats it on the spot, so
  // you never have to close the bag and re-open the pet menu to use what you
  // are already looking at. Bait and furniture are spent elsewhere.
  const pet = kind === 'food' ? cbs.pet : undefined;
  const options: MenuOption[] = pet
    ? feedMenuOptions(pet, { closeMenu: cbs.closeMenu, onFed: cbs.onFed })
    : Object.values(ITEMS)
        .filter((item) => item.kind === kind && (State.data.inventory[item.id] ?? 0) > 0)
        .map((item) => ({
          label: `${item.name} ×${State.data.inventory[item.id]}`,
          icon: item.texture,
          disabled: true,
          onSelect: () => undefined,
        }));
  const empty = options.length === 0;
  if (empty) {
    const emptyLabel =
      kind === 'food'
        ? 'No food — shop or go fishing!'
        : kind === 'bait'
          ? `No bait — Daniel sells it for ${ITEMS.bait.price} coins!`
          : 'No furniture — visit Daniel!';
    options.push({
      label: emptyLabel,
      disabled: true,
      onSelect: () => undefined,
    });
  }
  const subtitle =
    kind === 'food'
      ? pet && !empty
        ? `${petNeedsSubtitle()} · pick a snack to feed ${State.data.petName}`
        : 'Feed these to your pet from P → Feed'
      : kind === 'bait'
        ? 'One bait is used whenever you cast'
        : 'Place these at home with Decorate';
  const menu = new Menu(scene, title, options, {
    subtitle,
    back: {
      label: '← Back to Inventory',
      onSelect: () => openInventoryMenu(scene, cbs),
    },
  });
  menu.onClose = cbs.closeMenu;
}
