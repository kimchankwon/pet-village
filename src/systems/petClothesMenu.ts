import type Phaser from 'phaser';
import { ACCESSORIES, ACCESSORY_LIST, accessoryWearable, type AccessoryId } from './accessories';
import { State } from './GameState';
import { Menu, menuFocusForIndex, type MenuOption } from './UI';
import type { Pet } from './Pet';

/** Shared “Clothes / accessories” entry for pet menus across scenes. */
export function clothesPetMenuOption(
  scene: Phaser.Scene,
  pet: Pet,
  opts: {
    closeMenu: () => void;
    keepMenuOpen: () => void;
    openParent: () => void;
  },
): MenuOption {
  const owned = State.ownedAccessoryIds().filter((id) => !State.isPenguinAccessory(id)).length;
  return {
    label: owned === 0 ? 'Pet clothes (visit Cinnamoroll!)' : `Pet clothes · ${owned} owned`,
    icon: 'acc-cloud-bow',
    disabled: owned === 0,
    onSelect: () => {
      opts.keepMenuOpen();
      openClothesMenu(scene, pet, opts);
    },
  };
}

let clothesMenu: Menu | null = null;

function wearableLockLabel(a: (typeof ACCESSORY_LIST)[number]): string {
  const wear = accessoryWearable(a);
  if (wear === 'puffle') return 'puffles only';
  if (wear === 'bongbongee') return 'Bongbongee only';
  if (wear === 'penguin') return 'your penguin only';
  if (wear === 'kirby') return 'Kirby only';
  if (wear === 'classic') return 'Tamagotchi pets only';
  return 'Cinnamoroll only';
}

export function openClothesMenu(
  scene: Phaser.Scene,
  pet: Pet,
  opts: {
    closeMenu: () => void;
    keepMenuOpen: () => void;
    openParent: () => void;
  },
  focusIndex = 0,
) {
  opts.keepMenuOpen();
  // Replace any previous clothes menu so “Wearing: …” isn’t buried under stacks.
  if (clothesMenu) {
    const prev = clothesMenu;
    clothesMenu = null;
    prev.onClose = undefined;
    prev.close();
  }

  const owned = ACCESSORY_LIST.filter(
    (a) => State.ownsAccessory(a.id) && !State.isPenguinAccessory(a.id),
  );
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
        // Stay on the row you toggled instead of jumping to the top.
        openClothesMenu(scene, pet, opts, i);
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
    const unequipIndex = options.length;
    options.push({
      label: 'Unequip all',
      onSelect: () => {
        State.unequipAllPetAccessories();
        pet.refreshAccessories();
        openClothesMenu(scene, pet, opts, unequipIndex);
      },
    });
  }

  const petNames = ACCESSORY_LIST.filter((a) => State.isAccessoryEquipped(a.id) && State.canWearAccessory(a.id))
    .map((a) => a.name)
    .join(', ');
  const wearingLine = petNames ? `Wearing: ${petNames}` : 'Wearing: nothing yet';
  const focus = menuFocusForIndex(options, focusIndex);

  clothesMenu = new Menu(scene, `${State.data.petName}'s clothes`, options, {
    subtitle: wearingLine,
    ...focus,
    back: {
      label: `← Back to ${State.data.petName}`,
      onSelect: opts.openParent,
    },
  });
  clothesMenu.onClose = () => {
    clothesMenu = null;
    opts.closeMenu();
  };
}

/** Debug / label helper */
export function accessoryLabel(id: AccessoryId): string {
  return ACCESSORIES[id].name;
}
