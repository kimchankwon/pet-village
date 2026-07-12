import type Phaser from 'phaser';
import { ACCESSORIES, ACCESSORY_LIST, type AccessoryId } from './accessories';
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

export function openClothesMenu(
  scene: Phaser.Scene,
  pet: Pet,
  onClose: () => void,
  keepMenuOpen?: () => void,
) {
  keepMenuOpen?.();
  const options: MenuOption[] = ACCESSORY_LIST.filter((a) => State.ownsAccessory(a.id)).map((a) => {
    const equipped = State.isAccessoryEquipped(a.id);
    return {
      label: `${equipped ? '● ' : '○ '}${a.name}${equipped ? ' (equipped)' : ''}`,
      icon: a.texture,
      onSelect: () => {
        State.toggleAccessory(a.id);
        pet.refreshAccessories();
        keepMenuOpen?.();
        openClothesMenu(scene, pet, onClose, keepMenuOpen);
      },
    };
  });

  if (options.length === 0) {
    options.push({
      label: 'No clothes yet — visit Cinnamoroll’s stall or Bongbongee!',
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
        openClothesMenu(scene, pet, onClose, keepMenuOpen);
      },
    });
  }

  const equippedNames = ACCESSORY_LIST.filter((a) => State.isAccessoryEquipped(a.id))
    .map((a) => a.name)
    .join(', ');
  const menu = new Menu(
    scene,
    'Pet clothes',
    options,
    equippedNames ? `Wearing: ${equippedNames}` : 'Tap an item to equip / unequip',
  );
  menu.onClose = onClose;
}

/** Debug / label helper */
export function accessoryLabel(id: AccessoryId): string {
  return ACCESSORIES[id].name;
}
