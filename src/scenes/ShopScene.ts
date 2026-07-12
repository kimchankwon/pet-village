import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State, ITEMS } from '../systems/GameState';
import { bottomButtons, HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { clothesPetMenuOption } from '../systems/petClothesMenu';
import { ClickMove } from '../systems/ClickMove';
import { feetDepth } from '../systems/depth';
import { isUiBlocked } from '../systems/nav';
import { Joystick } from '../systems/Joystick';

const TILE = 48;
const COLS = 12;
const ROWS = 9;
const ROOM_X = (800 - COLS * TILE) / 2;
const ROOM_Y = 90;
const WALL_ROWS = 2;

// Daniel's shop interior: browse the counter, buy things, head back out.
export class ShopScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private pet!: Pet;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private hud!: HUD;
  private prompt!: Prompt;
  private clickMove!: ClickMove;
  private joystick!: Joystick;
  private pointerHeld = false;
  private menuOpen = false;
  private facing: 'up' | 'down' | 'side' = 'up';
  private bunny!: Phaser.GameObjects.Image;
  private doorMat!: Phaser.GameObjects.Image;
  private glowed: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] = [];
  private ignoreClicksUntil = 0;

  constructor() {
    super('Shop');
  }

  create() {
    generateTextures(this);
    this.menuOpen = false;
    this.pointerHeld = false;
    this.ignoreClicksUntil = 0;

    this.cameras.main.setBackgroundColor('#241f38');

    // Walls + floor
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const tex = gy < WALL_ROWS ? 'tile-wall' : 'tile-floor';
        this.add.image(ROOM_X + gx * TILE + TILE / 2, ROOM_Y + gy * TILE + TILE / 2, tex).setDepth(-100);
      }
    }
    // Door mat at bottom center
    const doorGx = Math.floor(COLS / 2);
    this.doorMat = this.add
      .image(ROOM_X + doorGx * TILE + TILE / 2, ROOM_Y + (ROWS - 1) * TILE + TILE / 2, 'item-rug')
      .setDepth(-99)
      .setTint(0x8d6e63)
      .setScale(1.3);

    // Counter across the middle-top with Daniel behind it
    for (let gx = 4; gx <= 7; gx++) {
      const t = this.add
        .image(ROOM_X + gx * TILE + TILE / 2, ROOM_Y + 3 * TILE + TILE / 2, 'item-table')
        .setScale(1.3);
      t.setDepth(t.y);
    }
    this.bunny = this.add
      .image(ROOM_X + 6 * TILE, ROOM_Y + 2.7 * TILE, 'bunny')
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
      const img = this.add.image(ROOM_X + gx * TILE, ROOM_Y + gy * TILE, tex).setScale(1.2);
      img.setDepth(img.y);
    }

    this.add
      .text(470, 40, "Daniel's Shop — E / tap Daniel to browse · ESC / door to leave", {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#c8c8dc',
      })
      .setOrigin(0.5)
      .setDepth(1000);

    const px = ROOM_X + doorGx * TILE + TILE / 2;
    const py = ROOM_Y + (ROWS - 2) * TILE;
    this.player = this.physics.add.sprite(px, py, 'penguin-up', 0);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(34, 16).setOffset(10, 42);
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    b.setBoundsRectangle(
      new Phaser.Geom.Rectangle(ROOM_X, ROOM_Y + WALL_ROWS * TILE - 20, COLS * TILE, (ROWS - WALL_ROWS) * TILE + 20),
    );
    this.player.setCollideWorldBounds(true);
    this.facing = 'up';

    this.pet = new Pet(this, px - 30, py + 10);
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
    addSolid(ROOM_X + 6 * TILE, ROOM_Y + 3.5 * TILE + 6, 4 * TILE + 12, 34); // counter
    addSolid(ROOM_X + 1.5 * TILE, ROOM_Y + 2.8 * TILE, 44, 30); // left shelf
    addSolid(ROOM_X + 10.5 * TILE, ROOM_Y + 2.8 * TILE, 44, 30); // right shelf
    addSolid(ROOM_X + 1.5 * TILE, ROOM_Y + 5.6 * TILE, 36, 26); // plant
    addSolid(ROOM_X + 10.5 * TILE, ROOM_Y + 5.6 * TILE, 36, 26); // lamp
    addSolid(ROOM_X + 10.5 * TILE, ROOM_Y + 4.1 * TILE, 30, 24); // lightstick display
    this.physics.add.collider(this.player, solids);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.hud = new HUD(this);
    this.prompt = new Prompt(this);
    this.clickMove = new ClickMove(this);
    this.joystick = new Joystick(this);

    // Pet care only — the game menu lives on the shell's top-bar Menu button.
    bottomButtons(
      this,
      [{ label: '[ Pet ]', onTap: () => this.openPetMenu() }],
      () => {
        this.ignoreClicksUntil = this.time.now + 150;
      },
    );

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
      if (this.joystick.owns(pointer)) return;
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
        label: 'E / click — Talk to Daniel',
        action: () => this.openShop(),
        targets: [this.bunny],
      };
    }
    const doorX = ROOM_X + Math.floor(COLS / 2) * TILE + TILE / 2;
    const doorY = ROOM_Y + (ROWS - 1) * TILE + TILE / 2;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, doorX, doorY) < 55) {
      return {
        x: doorX,
        y: doorY,
        radius: 55,
        label: 'E / click — Leave shop',
        action: () => this.scene.start('Town', { spawn: 'shop' }),
        targets: [this.doorMat],
      };
    }
    // (Pet care lives on the bottom [ Pet ] button — no proximity interaction.)
    return null;
  }

  private setHighlight(targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[]) {
    const next = targets ?? [];
    if (next[0] === this.glowed[0] && next.length === this.glowed.length) return;
    for (const o of this.glowed) o.postFX?.clear();
    this.glowed = next;
    for (const o of this.glowed) o.postFX?.addGlow(0xffe066, 4);
  }

  private closeMenu() {
    this.menuOpen = false;
    this.ignoreClicksUntil = this.time.now + 250;
  }

  private openShop() {
    this.menuOpen = true;
    const options = Object.values(ITEMS).map((item) => ({
      label: `${item.name} — ${item.price}c`,
      icon: item.texture,
      disabled: State.coins < item.price,
      onSelect: () => {
        if (State.spendCoins(item.price)) {
          State.addItem(item.id);
          toast(this, this.player.x, this.player.y - 50, `Bought ${item.name}!`, '#a8e6cf');
          this.hud.refresh();
        }
        this.closeMenu();
      },
    }));
    const menu = new Menu(this, "Daniel's Shop", options, {
      subtitle: `You have ${State.coins} coins`,
      anchor: 'bottom',
      face: 'bunny',
    });
    menu.onClose = () => this.closeMenu();
  }

  private openPetMenu() {
    if (this.menuOpen) return;
    this.menuOpen = true;
    const foods = Object.entries(State.data.inventory).filter(([id]) => ITEMS[id]?.kind === 'food');
    const options = [
      {
        label: `Chat with ${State.data.petName}`,
        icon: this.pet.sprite.texture.key,
        onSelect: () => {
          this.pet.speak();
          this.closeMenu();
        },
      },
      {
        label: `Feed ${State.data.petName}${foods.length === 0 ? ' (no food — ask Daniel!)' : ''}`,
        icon: 'fish',
        disabled: foods.length === 0,
        onSelect: () => this.openFeedMenu(),
      },
      {
        label: 'Play together (+happy, -energy)',
        icon: 'heart',
        disabled: State.data.pet.energy < 10,
        onSelect: () => {
          if (State.playWithPet()) {
            this.pet.celebrate('Wheee!');
            this.pet.updateMood();
            this.hud.refresh();
          }
          this.closeMenu();
        },
      },
      clothesPetMenuOption(this, this.pet, {
        closeMenu: () => this.closeMenu(),
        keepMenuOpen: () => {
          this.menuOpen = true;
        },
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

  private openFeedMenu() {
    this.menuOpen = true;
    const foods = Object.entries(State.data.inventory).filter(([id]) => ITEMS[id]?.kind === 'food');
    const options = foods.map(([id, count]) => {
      const item = ITEMS[id];
      return {
        label: `${item.name} x${count} (+${item.hunger} food)`,
        icon: item.texture,
        onSelect: () => {
          if (State.feedPet(id)) {
            this.pet.celebrate('Yum!');
            this.pet.updateMood();
            this.hud.refresh();
          }
          this.closeMenu();
        },
      };
    });
    const menu = new Menu(this, `Feed ${State.data.petName}`, options);
    menu.onClose = () => this.closeMenu();
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
      if (vx !== 0) {
        this.facing = 'side';
        this.player.setFlipX(vx < 0);
        this.player.play('walk-side', true);
      } else if (vy < 0) {
        this.facing = 'up';
        this.player.play('walk-up', true);
      } else {
        this.facing = 'down';
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

    if (!this.menuOpen) {
      const near = this.nearestInteractable();
      this.setHighlight(near?.targets);
      if (near) {
        this.prompt.show(near.label);
        if (Phaser.Input.Keyboard.JustDown(this.keyE)) near.action();
      } else {
        this.prompt.hide();
      }
    } else {
      this.prompt.hide();
      this.setHighlight(undefined);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) && !this.menuOpen && !isUiBlocked()) {
      this.scene.start('Town', { spawn: 'shop' });
    }
  }
}
