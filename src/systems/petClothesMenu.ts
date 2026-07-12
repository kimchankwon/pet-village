import type Phaser from 'phaser';
import { ACCESSORIES, ACCESSORY_LIST, accessoryWearable, type AccessoryId } from './accessories';
import { State } from './GameState';
import { Menu, type MenuOption } from './UI';
import type { Pet } from './Pet';

/** Shared “Clothes / accessories” entry for pet menus across scenes. */
export function clothesPetMenuOption(
  scene: Phaser.Scene,
  pet: Pet,
  opts: {
    closeMenu: () => void;
    keepMenuOpen: () => void;
  },
): MenuOption {
  const owned = State.ownedAccessoryIds().length;
  return {
    label: owned === 0 ? 'Clothes (Cinnamoroll or Bongbongee!)' : 'Clothes & accessories',
    icon: 'acc-cloud-bow',
    disabled: owned === 0,
    onSelect: () => {
      opts.keepMenuOpen();
      openClothesMenu(scene, pet, opts.closeMenu, opts.keepMenuOpen);
    },
  };
}

let clothesMenu: Menu | null = null;

function wearableLockLabel(a: (typeof ACCESSORY_LIST)[number]): string {
  const wear = accessoryWearable(a);
  if (wear === 'puffle') return 'puffles only';
  if (wear === 'bongbongee') return 'Bongbongee only';
  return 'Cinnamoroll only';
}

export function openClothesMenu(
  scene: Phaser.Scene,
  pet: Pet,
  onClose: () => void,
  keepMenuOpen?: () => void,
  focusIndex = 0,
) {
  keepMenuOpen?.();
  // Replace any previous clothes menu so “Wearing: …” isn’t buried under stacks.
  if (clothesMenu) {
    const prev = clothesMenu;
    clothesMenu = null;
    prev.onClose = undefined;
    prev.close();
  }

  const owned = ACCESSORY_LIST.filter((a) => State.ownsAccessory(a.id));
  const options: MenuOption[] = owned.map((a, i) => {
    const equipped = State.isAccessoryEquipped(a.id);
    const locked = !State.canWearAccessory(a.id);
    return {
      label: locked
        ? `○ ${a.name} (${wearableLockLabel(a)})`
        : `${equipped ? '● ' : '○ '}${a.name}`,
      icon: a.texture,
      disabled: locked,
      onSelect: () => {
        if (locked) return;
        State.toggleAccessory(a.id);
        pet.refreshAccessories();
        keepMenuOpen?.();
        // Stay on the row you toggled instead of jumping to the top.
        openClothesMenu(scene, pet, onClose, keepMenuOpen, i);
      },
    };
  });

  if (options.length === 0) {
    options.push({
      label: 'No clothes yet — visit Cafe Cinnamon or Bongbongee!',
      disabled: true,
      onSelect: () => undefined,
    });
  } else {
    options.push({
      label: 'Unequip all',
      onSelect: () => {
        State.unequipAllAccessories();
        pet.refreshAccessories();
        keepMenuOpen?.();
        openClothesMenu(scene, pet, onClose, keepMenuOpen, options.length);
      },
    });
  }

  const equippedNames = ACCESSORY_LIST.filter((a) => State.isAccessoryEquipped(a.id) && State.canWearAccessory(a.id))
    .map((a) => a.name)
    .join(', ');
  const wearingLine = equippedNames ? `Wearing: ${equippedNames}` : 'Wearing: nothing yet';

  // Menu.initialSelected indexes into enabled rows only (skips disabled).
  const enabledFocus = options.slice(0, focusIndex).filter((option) => !option.disabled).length;

  clothesMenu = new Menu(scene, 'Pet clothes', options, {
    subtitle: wearingLine,
    initialSelected: enabledFocus,
  });
  clothesMenu.onClose = () => {
    clothesMenu = null;
    onClose();
  };
}

/** Debug / label helper */
export function accessoryLabel(id: AccessoryId): string {
  return ACCESSORIES[id].name;
}
