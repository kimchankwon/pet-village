import type Phaser from 'phaser';
import { ACCESSORIES, ACCESSORY_LIST, accessoryWearable, type AccessoryId } from './accessories';
import { State } from './GameState';
import { Menu, type MenuOption } from './UI';
import type { Pet } from './Pet';
import { refreshPenguin } from '../sprites/pixelart';

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
  if (wear === 'penguin') return 'your penguin only';
  if (wear === 'kirby') return 'Kirby only';
  if (wear === 'classic') return 'Tamagotchi pets only';
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
    // Penguin clothes go on the player, everything else on the pet.
    const forPenguin = State.isPenguinAccessory(a.id);
    const equipped = forPenguin ? State.isPenguinAccessoryEquipped(a.id) : State.isAccessoryEquipped(a.id);
    const locked = !forPenguin && !State.canWearAccessory(a.id);
    return {
      label: locked
        ? `○ ${a.name} (${wearableLockLabel(a)})`
        : `${equipped ? '● ' : '○ '}${a.name}${forPenguin ? ' (you)' : ''}`,
      icon: a.texture,
      disabled: locked,
      onSelect: () => {
        if (locked) return;
        if (forPenguin) {
          State.togglePenguinAccessory(a.id);
          refreshPenguin(scene);
        } else {
          State.toggleAccessory(a.id);
          pet.refreshAccessories();
        }
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
        refreshPenguin(scene);
        keepMenuOpen?.();
        openClothesMenu(scene, pet, onClose, keepMenuOpen, options.length);
      },
    });
  }

  const petNames = ACCESSORY_LIST.filter((a) => State.isAccessoryEquipped(a.id) && State.canWearAccessory(a.id))
    .map((a) => a.name)
    .join(', ');
  const youNames = ACCESSORY_LIST.filter((a) => State.isPenguinAccessory(a.id) && State.isPenguinAccessoryEquipped(a.id))
    .map((a) => a.name)
    .join(', ');
  const parts: string[] = [];
  if (petNames) parts.push(`Pet: ${petNames}`);
  if (youNames) parts.push(`You: ${youNames}`);
  const wearingLine = parts.length ? `Wearing — ${parts.join(' · ')}` : 'Wearing: nothing yet';

  // Menu.initialSelected indexes into enabled rows only (skips disabled).
  const enabledFocus = options.slice(0, focusIndex).filter((option) => !option.disabled).length;

  clothesMenu = new Menu(scene, 'Clothes & accessories', options, {
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
