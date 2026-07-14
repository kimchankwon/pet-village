import Phaser from 'phaser';
import { Menu, toast, type MenuOption } from './UI';
import { State } from './GameState';
import {
  CINNA_SHOP_ITEMS,
  PENGUIN_SHOP_ITEMS,
  PET_BOUTIQUE_ITEMS,
  PUFFLE_SHOP_ITEMS,
  type AccessoryDef,
} from './accessories';
import { WandererNpc, type NpcTalkCallbacks } from './WandererNpc';

/**
 * Shy Cafe Cinnamon dialogue — soft, polite, a little hesitant.
 * Inspired by Sanrio canon: shy but friendly, loves cinnamon rolls,
 * naps on laps, flies by flapping huge ears ("ehehe~").
 */
const LINES = [
  '…um. Welcome to Cafe Cinnamon… I picked soft clothes. For pets.',
  'Ehehe… don’t mind me. I get shy. The scarves smell like fresh rolls…',
  'If you want to try something on… I’ll look away. Softly. Promise.',
  'Cafe Cinnamon’s rolls are the best… warm and swirly like my tail.',
  'I floated here on a cloud… then I opened this little shop. Is that okay…?',
  'My ears go flap-flap when I’m happy. Oh — shopping counts as happy.',
  'Puffle dig finds? I keep those on a soft shelf… puffles only, please.',
  'Um… I stock penguin things too. Scarves, toques… they only fit you, though.',
];

/**
 * Cinnamoroll — Cafe Cinnamon shopkeeper. Sells soft Cinna outfits,
 * Mine Shack–style puffle dig clothes (puffles only), and Club Penguin
 * gift-shop gear that only the player's penguin can wear.
 */
export class CinnamorollNpc extends WandererNpc {
  constructor(scene: Phaser.Scene, waypoints: { x: number; y: number }[]) {
    super(scene, {
      name: 'Cinnamoroll',
      texPrefix: 'cinna',
      waypoints,
      speed: 42,
      pauseMs: [1800, 3600],
    });
    // Frames are ~21px tall; sit a notch above the pet's 1.5×32 (~48px)
    // display height so the shopkeeper reads as a character, not a giant.
    this.sprite.setScale(56 / this.sprite.height);
  }

  protected override openTalk(cbs: NpcTalkCallbacks) {
    const line = this.pickLine(LINES);
    this.playBounce();
    const menu = new Menu(
      this.scene,
      'Cinnamoroll',
      [
        {
          label: 'Browse Cinnamoroll clothes',
          icon: 'acc-cloud-bow',
          onSelect: () => {
            cbs.keepMenuOpen();
            this.openShop(cbs, CINNA_SHOP_ITEMS, 'Cinnamoroll Clothes');
          },
        },
        {
          label: 'Browse puffle dig clothes',
          icon: 'acc-puffle-tee',
          onSelect: () => {
            cbs.keepMenuOpen();
            this.openShop(
              cbs,
              PUFFLE_SHOP_ITEMS,
              'Puffle Dig Finds',
              'Puffles only · equip with P → Pet clothes',
            );
          },
        },
        {
          label: 'Browse penguin clothes (for you!)',
          icon: 'acc-red-scarf',
          onSelect: () => {
            cbs.keepMenuOpen();
            this.openShop(
              cbs,
              PENGUIN_SHOP_ITEMS,
              'Penguin Gift Shop',
              'Fits only you · equip with I → Your clothes',
            );
          },
        },
        {
          label: 'Browse pet outfits (Kirby & Tama)',
          icon: 'acc-mini-crown',
          onSelect: () => {
            cbs.keepMenuOpen();
            this.openShop(
              cbs,
              PET_BOUTIQUE_ITEMS,
              'Pet Boutique',
              'Kirby & Tamagotchi pets · equip with P → Pet clothes',
            );
          },
        },
        {
          label: 'Ask about cinnamon rolls',
          onSelect: () => {
            cbs.keepMenuOpen();
            this.emote('happy', 1200);
            const follow = new Menu(
              this.scene,
              'Cinnamoroll',
              [{ label: 'Mmm… thank you for asking.', onSelect: () => undefined }],
              {
                subtitle: 'Warm… swirly… the best smell in the sky. Ehehe~',
                anchor: 'bottom',
                face: this.faceKey(),
                back: {
                  label: '← Back to Cinnamoroll',
                  onSelect: () => {
                    cbs.keepMenuOpen();
                    this.openTalk(cbs);
                  },
                },
              },
            );
            follow.onClose = cbs.onClose;
          },
        },
        {
          label: 'Ask him to fly (ears flap-flap)',
          onSelect: () => this.hop(28),
        },
        {
          label: 'Say goodbye',
          onSelect: () => this.emote('happy', 700),
        },
      ],
      { subtitle: line, anchor: 'bottom', face: this.faceKey() },
    );
    menu.onClose = cbs.onClose;
  }

  private openShop(
    cbs: NpcTalkCallbacks,
    items: AccessoryDef[],
    title: string,
    note = 'Equip with P → Pet clothes',
  ) {
    const options: MenuOption[] = items.map((item) => {
      const owned = State.ownsAccessory(item.id);
      const price = item.price ?? 0;
      const tooPoor = !owned && State.coins < price;
      return {
        label: owned
          ? `${item.name} — owned ✓`
          : `${item.name} — ${price}c${tooPoor ? ' (need coins)' : ''}`,
        icon: item.texture,
        disabled: owned || tooPoor,
        onSelect: () => {
          if (owned) return;
          // Confirm before spending — Menu closes this list first, then opens buy prompt.
          cbs.keepMenuOpen();
          const confirm = new Menu(
            this.scene,
            `Buy ${item.name}?`,
            [
              {
                label: `Buy for ${price}c`,
                onSelect: () => {
                  if (!State.buyAccessory(item.id)) {
                    this.emote('sad', 900);
                    toast(this.scene, this.sprite.x, this.sprite.y - 28, '…not enough coins…', '#ffb3d1');
                    cbs.keepMenuOpen();
                    this.openShop(cbs, items, title, note);
                    return;
                  }
                  this.emote('happy', 1200);
                  toast(this.scene, this.sprite.x, this.sprite.y - 28, `Soft… enjoy the ${item.name}!`, '#a8e6cf');
                  cbs.onAccessoriesChanged?.();
                  cbs.keepMenuOpen();
                  this.openShop(
                    cbs,
                    items,
                    title,
                    note,
                  );
                },
              },
            ],
            {
              subtitle: `You have ${State.coins} coins`,
              back: {
                label: `← Back to ${title}`,
                onSelect: () => {
                  cbs.keepMenuOpen();
                  this.openShop(cbs, items, title, note);
                },
              },
            },
          );
          confirm.onClose = cbs.onClose;
        },
      };
    });

    const menu = new Menu(this.scene, title, options, {
      subtitle: `${note} · ${State.coins}c`,
      anchor: 'bottom',
      face: this.faceKey(),
      back: {
        label: '← Back to Cinnamoroll',
        onSelect: () => {
          cbs.keepMenuOpen();
          this.openTalk(cbs);
        },
      },
    });
    menu.onClose = cbs.onClose;
  }
}
