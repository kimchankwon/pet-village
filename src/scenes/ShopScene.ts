import Phaser from 'phaser';
import { configurePlayerPenguin, generateTextures } from '../sprites/pixelart';
import { State, ITEMS } from '../systems/GameState';
import { bottomButtons, HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { clothesPetMenuOption } from '../systems/petClothesMenu';
import { feedPetMenuOption } from '../systems/petFeedMenu';
import { openInventoryMenu as showInventoryMenu } from '../systems/inventoryMenu';
import { ClickMove } from '../systems/ClickMove';
import { feetDepth } from '../systems/depth';
import { placeDoorMat } from '../systems/doorMat';
import { isInteractSuppressed, isUiBlocked } from '../systems/nav';
import { Joystick } from '../systems/Joystick';
import { attachCameraZoom, markAsUi, type CameraZoom } from '../systems/cameraZoom';
import { updateInteractionHighlight } from '../systems/interactionHighlight';
import { addWorldBezel } from '../systems/worldBezel';
import { movementFacing } from '../systems/movementFacing';

const TILE = 48;
const COLS = 12;
const ROWS = 9;
const ROOM_Y = 90;
const WALL_ROWS = 2;

// Daniel's shop interior: browse the counter, buy things, head back out.
export class ShopScene extends Phaser.Scene {
  private roomX = 0;
  private player!: Phaser.Physics.Arcade.Sprite;
  private pet!: Pet;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyP!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private hud!: HUD;
  private prompt!: Prompt;
  private clickMove!: ClickMove;
  private joystick!: Joystick;
  private cameraZoom!: CameraZoom;
  private pointerHeld = false;
  private menuOpen = false;
  private facing: 'up' | 'down' | 'side' = 'up';
  private bunny!: Phaser.GameObjects.Image;
  private doorCenterX = 0;
  private doorCenterY = 0;
  private glowed: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] = [];
  private ignoreClicksUntil = 0;

  constructor() {
    super('Shop');
  }

  create() {
    generateTextures(this);
    this.roomX = (this.cameras.main.width - COLS * TILE) / 2;
    this.menuOpen = false;
    this.pointerHeld = false;
    this.ignoreClicksUntil = 0;

    this.cameras.main.setBackgroundColor('#241f38');

    // Walls + floor
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const tex = gy < WALL_ROWS ? 'tile-wall' : 'tile-floor';
        this.add.image(this.roomX + gx * TILE + TILE / 2, ROOM_Y + gy * TILE + TILE / 2, tex).setDepth(-100);
      }
    }
    addWorldBezel(
      this,
      { x: this.roomX, y: ROOM_Y, width: COLS * TILE, height: ROWS * TILE },
      0x241f38,
    );
    const door = placeDoorMat(this, this.roomX, ROOM_Y, COLS, ROWS, 0x8d6e63);
    this.doorCenterX = door.centerX;
    this.doorCenterY = door.centerY;

    // Counter across the middle-top with Daniel behind it
    for (let gx = 4; gx <= 7; gx++) {
      const t = this.add
        .image(this.roomX + gx * TILE + TILE / 2, ROOM_Y + 3 * TILE + TILE / 2, 'item-table')
        .setScale(1.3);
      t.setDepth(t.y);
    }
    this.bunny = this.add
      .image(this.roomX + 6 * TILE, ROOM_Y + 2.7 * TILE, 'bunny')
      .setScale(1.4);
    this.bunny.setDepth(this.bunny.y);

    // Shelf dressing: wares on display
    const dressing: [number, number, string][] = [
      [1.5, 2.6, 'item-bookshelf'],
      [10.5, 2.6, 'item-bookshelf'],
      [1.5, 5.5, 'item-plant'],
      [10.5, 5.5, 'item-lamp'],
      [10.5, 4, 'item-lightstick'],
    ];
    for (const [gx, gy, tex] of dressing) {
      const img = this.add.image(this.roomX + gx * TILE, ROOM_Y + gy * TILE, tex).setScale(1.2);
      img.setDepth(img.y);
    }

    const shopHint = this.add
      .text(this.cameras.main.width / 2, 40, "Daniel's Shop — E / Space / tap Daniel to browse · ESC / door to leave", {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#c8c8dc',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000);
    markAsUi(this, shopHint);

    const px = door.centerX;
    const py = door.centerY; // ON the mat
    this.player = this.physics.add.sprite(px, py, 'penguin-up', 0);
    configurePlayerPenguin(this.player);
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    const playerBounds = new Phaser.Geom.Rectangle(
      this.roomX,
      ROOM_Y + WALL_ROWS * TILE - 20,
      COLS * TILE,
      (ROWS - WALL_ROWS) * TILE + 20,
    );
    b.setBoundsRectangle(playerBounds);
    this.player.setCollideWorldBounds(true);
    this.facing = 'up';

    this.pet = new Pet(this, px - 30, py + 10, playerBounds);
    // Tap/click your pet to hear what's on its mind.
    this.pet.sprite.setInteractive({ useHandCursor: true });
    this.pet.sprite.on('pointerdown', () => {
      this.ignoreClicksUntil = this.time.now + 200;
      if (!this.menuOpen && !isUiBlocked()) this.pet.speak();
    });

    // Solid fixtures: the counter (and displays) block walking, so you
    // browse from the customer side instead of phasing through Daniel.
    const solids: Phaser.GameObjects.Rectangle[] = [];
    const addSolid = (x: number, y: number, w: number, h: number) => {
      const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
      this.physics.add.existing(r, true);
      solids.push(r);
    };
    addSolid(this.roomX + 6 * TILE, ROOM_Y + 3.5 * TILE + 6, 4 * TILE + 12, 34); // counter
    addSolid(this.roomX + 1.5 * TILE, ROOM_Y + 2.8 * TILE, 44, 30); // left shelf
    addSolid(this.roomX + 10.5 * TILE, ROOM_Y + 2.8 * TILE, 44, 30); // right shelf
    addSolid(this.roomX + 1.5 * TILE, ROOM_Y + 5.6 * TILE, 36, 26); // plant
    addSolid(this.roomX + 10.5 * TILE, ROOM_Y + 5.6 * TILE, 36, 26); // lamp
    addSolid(this.roomX + 10.5 * TILE, ROOM_Y + 4.1 * TILE, 30, 24); // lightstick display
    this.physics.add.collider(this.player, solids);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyI = kb.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyP = kb.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.hud = new HUD(this);
    this.prompt = new Prompt(this);
    this.clickMove = new ClickMove(this);
    this.joystick = new Joystick(this);

    // Player inventory and pet care — the game menu lives in the shell.
    bottomButtons(
      this,
      [
        { label: '[ Inventory · I ]', onTap: () => this.openInventory() },
        { label: '[ Pet · P ]', onTap: () => this.openPetMenu() },
      ],
      () => {
        this.ignoreClicksUntil = this.time.now + 150;
      },
    );

    this.cameraZoom = attachCameraZoom(this, {
      kind: 'hub',
      isBlocked: () => this.menuOpen || isUiBlocked(),
      joystick: this.joystick,
      onPinchStart: () => {
        this.pointerHeld = false;
        this.clickMove.clear();
      },
    });

    // Same live tamagotchi tick as everywhere else
    this.time.addEvent({
      delay: 60_000,
      loop: true,
      callback: () => {
        State.decay(1 / 60);
        State.save();
        this.hud.refresh();
        this.pet.updateMood();
      },
    });
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.hud.refresh() });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.menuOpen || this.time.now < this.ignoreClicksUntil || pointer.button !== 0) return;
      if (this.joystick.owns(pointer) || this.cameraZoom.ownsPointer(pointer)) return;
      if (this.cameraZoom.isPinching()) return;
      const near = this.nearestInteractable();
      if (near) {
        const clickDist = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, near.x, near.y);
        if (clickDist < near.radius + 20) {
          this.clickMove.clear();
          near.action();
          return;
        }
      }
      this.clickMove.setTarget(pointer.worldX, pointer.worldY);
      this.pointerHeld = true;
    });
    const endHold = () => {
      this.pointerHeld = false;
    };
    this.input.on('pointerup', endHold);
    this.input.on('pointerupoutside', endHold);
  }

  private nearestInteractable(): {
    x: number;
    y: number;
    radius: number;
    label: string;
    action: () => void;
    targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[];
  } | null {
    const nearBunny =
      Phaser.Math.Distance.Between(this.player.x, this.player.y, this.bunny.x, this.bunny.y + 40) < 90;
    if (nearBunny) {
      return {
        x: this.bunny.x,
        y: this.bunny.y,
        radius: 90,
        label: 'E / Space / click — Talk to Daniel',
        action: () => this.openShop(),
        targets: [this.bunny],
      };
    }
    if (
      Phaser.Math.Distance.Between(this.player.x, this.player.y, this.doorCenterX, this.doorCenterY) < 55
    ) {
      return {
        x: this.doorCenterX,
        y: this.doorCenterY,
        radius: 55,
        label: 'E / Space / click — Leave shop',
        action: () => this.scene.start('Town', { spawn: 'shop' }),
      };
    }
    // Pet care lives on the bottom [ Pet · P ] button — no proximity interaction.
    return null;
  }

  private setHighlight(targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[]) {
    this.glowed = updateInteractionHighlight(this.glowed, targets);
  }

  private closeMenu() {
    this.menuOpen = false;
    this.ignoreClicksUntil = this.time.now + 250;
  }

  private openShop() {
    this.menuOpen = true;
    const options = Object.values(ITEMS)
      .filter((item) => !item.catchOnly)
      .map((item) => ({
        label: `${item.name} — ${item.price}c`,
        icon: item.texture,
        disabled: State.coins < item.price,
        onSelect: () => this.confirmBuy(item.id, item.name, item.price),
      }));
    const menu = new Menu(this, "Daniel's Shop", options, {
      subtitle: `You have ${State.coins} coins`,
      anchor: 'bottom',
      face: 'bunny',
      pageSize: 5,
    });
    menu.onClose = () => this.closeMenu();
  }

  private confirmBuy(id: string, name: string, price: number) {
    this.menuOpen = true;
    const menu = new Menu(
      this,
      `Buy ${name}?`,
      [
        {
          label: `Buy for ${price}c`,
          onSelect: () => {
            if (State.spendCoins(price)) {
              State.addItem(id);
              toast(this, this.player.x, this.player.y - 50, `Bought ${name}!`, '#a8e6cf');
              this.hud.refresh();
            }
            this.openShop();
          },
        },
      ],
      {
        subtitle: `You have ${State.coins} coins`,
        back: {
          label: "← Back to Daniel's Shop",
          onSelect: () => this.openShop(),
        },
      },
    );
    menu.onClose = () => this.closeMenu();
  }

  private openPetMenu() {
    if (this.menuOpen) return;
    this.menuOpen = true;
    const options = [
      {
        label: `Chat with ${State.data.petName}`,
        icon: this.pet.sprite.texture.key,
        onSelect: () => {
          this.pet.speak();
          this.closeMenu();
        },
      },
      feedPetMenuOption(this, this.pet, {
        closeMenu: () => this.closeMenu(),
        keepMenuOpen: () => {
          this.menuOpen = true;
        },
        emptyHint: 'no food — ask Daniel!',
        onFed: () => this.hud.refresh(),
      }),
      clothesPetMenuOption(this, this.pet, {
        closeMenu: () => this.closeMenu(),
        keepMenuOpen: () => {
          this.menuOpen = true;
        },
        openParent: () => this.openPetMenu(),
      }),
    ];
    const p = State.data.pet;
    const menu = new Menu(
      this,
      State.data.petName,
      options,
      `Food ${Math.round(p.hunger)} · Happy ${Math.round(p.happiness)} · Energy ${Math.round(p.energy)}`,
    );
    menu.onClose = () => this.closeMenu();
  }

  private openInventory() {
    if (this.menuOpen) return;
    this.menuOpen = true;
    showInventoryMenu(this, {
      closeMenu: () => this.closeMenu(),
      keepMenuOpen: () => {
        this.menuOpen = true;
      },
    });
  }

  update() {
    if (!this.player) return;

    const speed = 200;
    // The shell (React) menu blocks input via nav; treat it like a menu.
    const uiOpen = this.menuOpen || isUiBlocked();
    let vx = 0;
    let vy = 0;
    if (!uiOpen) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -speed;
      else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = speed;
      if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed;
      else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed;
    }

    const j = this.joystick.vec;
    if (vx !== 0 || vy !== 0) {
      this.clickMove.clear();
    } else if (!uiOpen && (Math.abs(j.x) > 0.18 || Math.abs(j.y) > 0.18)) {
      this.clickMove.clear();
      vx = j.x * speed;
      vy = j.y * speed;
    } else if (!uiOpen) {
      const ap = this.input.activePointer;
      if (this.pointerHeld && ap.isDown && !this.joystick.active) {
        ap.updateWorldPoint(this.cameras.main);
        this.clickMove.setTarget(ap.worldX, ap.worldY, true);
      }
      const step = this.clickMove.step(this.player.x, this.player.y, speed);
      vx = step.vx;
      vy = step.vy;
    } else {
      this.clickMove.clear();
    }

    this.player.setVelocity(vx, vy);
    if (vx !== 0 && vy !== 0) this.player.body!.velocity.normalize().scale(speed);

    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      this.facing = movementFacing(vx, vy, this.facing);
      if (this.facing === 'side') {
        this.player.setFlipX(vx < 0);
        this.player.play('walk-side', true);
      } else if (this.facing === 'up') {
        this.player.play('walk-up', true);
      } else {
        this.player.play('walk-down', true);
      }
    } else {
      this.player.stop();
      this.player.setTexture(
        this.facing === 'up' ? 'penguin-up' : this.facing === 'side' ? 'penguin-side' : 'penguin-down',
        0,
      );
    }
    this.player.setDepth(feetDepth(this.player));
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.pet.update(this.player.x, this.player.y, body.velocity.x, body.velocity.y);

    if (!uiOpen) {
      const near = this.nearestInteractable();
      this.setHighlight(near?.targets);
      if (near) {
        this.prompt.show(near.label);
        if (
          !isInteractSuppressed() &&
          (Phaser.Input.Keyboard.JustDown(this.keyE) ||
            Phaser.Input.Keyboard.JustDown(this.keySpace))
        )
          near.action();
      } else {
        this.prompt.hide();
      }
    } else {
      this.prompt.hide();
      this.setHighlight(undefined);
    }

    // I owns player inventory; P owns pet care.
    if (Phaser.Input.Keyboard.JustDown(this.keyI)) {
      if (this.menuOpen) Menu.closeTop();
      else if (!isUiBlocked()) this.openInventory();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyP)) {
      if (this.menuOpen) Menu.closeTop();
      else if (!isUiBlocked()) this.openPetMenu();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) && !this.menuOpen && !isUiBlocked()) {
      this.scene.start('Town', { spawn: 'shop' });
    }
  }
}
