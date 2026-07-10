import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State, ITEMS } from '../systems/GameState';
import { HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { ClickMove } from '../systems/ClickMove';
import { feetDepth } from '../systems/depth';

const TILE = 48;
const COLS = 12;
const ROWS = 9;
const ROOM_X = (800 - COLS * TILE) / 2; // center the room
const ROOM_Y = 90;
const WALL_ROWS = 2;

export class HouseScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private pet!: Pet;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private hud!: HUD;
  private prompt!: Prompt;
  private menuOpen = false;
  private facing: 'up' | 'down' | 'side' = 'down';
  private furnitureSprites: Phaser.GameObjects.Image[] = [];
  private clickMove!: ClickMove;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  // Placement mode: a ghost of the selected item follows the mouse.
  private placing: string | null = null;
  private ghost: Phaser.GameObjects.Image | null = null;
  // The pointerdown that closes a menu must not also place/pick up furniture.
  private ignoreClicksUntil = 0;

  constructor() {
    super('House');
  }

  create() {
    generateTextures(this);
    this.menuOpen = false;
    this.placing = null;
    this.ghost = null;

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
    this.add
      .image(ROOM_X + doorGx * TILE + TILE / 2, ROOM_Y + (ROWS - 1) * TILE + TILE / 2, 'item-rug')
      .setDepth(-99)
      .setTint(0x8d6e63)
      .setScale(1.3);

    this.renderFurniture();

    const px = ROOM_X + doorGx * TILE + TILE / 2;
    const py = ROOM_Y + (ROWS - 2) * TILE;
    this.player = this.physics.add.sprite(px, py, 'penguin-up', 0);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(34, 16).setOffset(10, 42);
    // Keep the penguin inside the floor area of the room.
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    b.setBoundsRectangle(
      new Phaser.Geom.Rectangle(ROOM_X, ROOM_Y + WALL_ROWS * TILE - 20, COLS * TILE, (ROWS - WALL_ROWS) * TILE + 20),
    );
    this.player.setCollideWorldBounds(true);
    this.facing = 'up';

    this.pet = new Pet(this, px - 30, py + 10);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyI = kb.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.hud = new HUD(this);
    this.prompt = new Prompt(this);
    this.clickMove = new ClickMove(this);

    this.add
      .text(400, 40, 'Your House — click to walk · I: decorate · click furniture: pick up · E at door: leave', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#c8c8dc',
      })
      .setOrigin(0.5)
      .setDepth(1000);

    // Same live tamagotchi tick as town (scene-scoped, cleaned up on shutdown)
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

    // Clicks: place / pick up furniture, interact when close, or walk.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.menuOpen || this.time.now < this.ignoreClicksUntil || pointer.button !== 0) return;
      const g = this.pointerToGrid(pointer);
      if (this.placing) {
        if (g && this.canPlaceAt(g.gx, g.gy)) {
          State.placeItem(this.placing, g.gx, g.gy);
          toast(this, pointer.x, pointer.y - 20, 'Placed!', '#a8e6cf');
          this.stopPlacing();
          this.renderFurniture();
        } else {
          toast(this, pointer.x, pointer.y - 20, "Can't place there", '#ff6b6b');
        }
        return;
      }
      if (g) {
        const picked = State.pickUpItem(g.gx, g.gy);
        if (picked) {
          toast(this, pointer.x, pointer.y - 20, `${ITEMS[picked].name} → inventory`, '#ffe066');
          this.renderFurniture();
          this.clickMove.clear();
          return;
        }
      }

      const near = this.nearestHouseInteractable();
      if (near) {
        const clickDist = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, near.x, near.y);
        if (clickDist < near.radius + 20) {
          this.clickMove.clear();
          near.action();
          return;
        }
      }

      if (g) {
        this.clickMove.setTarget(
          ROOM_X + g.gx * TILE + TILE / 2,
          ROOM_Y + g.gy * TILE + TILE / 2,
        );
      }
    });
  }

  private nearestHouseInteractable(): {
    x: number;
    y: number;
    radius: number;
    label: string;
    action: () => void;
  } | null {
    const doorX = ROOM_X + Math.floor(COLS / 2) * TILE + TILE / 2;
    const doorY = ROOM_Y + (ROWS - 1) * TILE + TILE / 2;
    const nearDoor = Phaser.Math.Distance.Between(this.player.x, this.player.y, doorX, doorY) < 55;
    if (nearDoor) {
      return {
        x: doorX,
        y: doorY,
        radius: 55,
        label: 'E / click — Leave house',
        action: () => this.scene.start('Town', { spawn: 'house' }),
      };
    }
    const nearPet =
      Phaser.Math.Distance.Between(this.player.x, this.player.y, this.pet.sprite.x, this.pet.sprite.y) < 50;
    if (nearPet) {
      return {
        x: this.pet.sprite.x,
        y: this.pet.sprite.y,
        radius: 50,
        label: `E / click — ${State.data.petName} (your pet)`,
        action: () => this.openPetMenuInHouse(),
      };
    }
    return null;
  }

  private pointerToGrid(pointer: Phaser.Input.Pointer): { gx: number; gy: number } | null {
    const gx = Math.floor((pointer.x - ROOM_X) / TILE);
    const gy = Math.floor((pointer.y - ROOM_Y) / TILE);
    if (gx < 0 || gx >= COLS || gy < WALL_ROWS || gy >= ROWS) return null;
    return { gx, gy };
  }

  private canPlaceAt(gx: number, gy: number): boolean {
    const doorGx = Math.floor(COLS / 2);
    if (gx === doorGx && gy === ROWS - 1) return false; // keep the doorway clear
    return !State.data.placed.some((p) => p.gx === gx && p.gy === gy);
  }

  private renderFurniture() {
    this.furnitureSprites.forEach((s) => s.destroy());
    this.furnitureSprites = [];
    for (const p of State.data.placed) {
      const def = ITEMS[p.id];
      if (!def) continue;
      const x = ROOM_X + p.gx * TILE + TILE / 2;
      const y = ROOM_Y + p.gy * TILE + TILE / 2;
      const img = this.add.image(x, y, def.texture).setScale(1.2);
      img.setDepth(p.id === 'rug' ? -50 : y);
      this.furnitureSprites.push(img);
    }
  }

  private openDecorateMenu() {
    const furniture = Object.entries(State.data.inventory).filter(([id]) => ITEMS[id]?.kind === 'furniture');
    if (furniture.length === 0) {
      toast(this, 400, 300, 'No furniture in inventory — visit the shop!', '#ff6b6b');
      return;
    }
    this.menuOpen = true;
    const options = furniture.map(([id, count]) => {
      const item = ITEMS[id];
      return {
        label: `${item.name} x${count}`,
        icon: item.texture,
        onSelect: () => {
          this.menuOpen = false;
          this.startPlacing(id);
        },
      };
    });
    const menu = new Menu(this, 'Decorate — pick an item', options, 'Then click a floor tile to place it');
    menu.onClose = () => {
      this.menuOpen = false;
      this.ignoreClicksUntil = this.time.now + 200;
    };
  }

  private startPlacing(id: string) {
    this.placing = id;
    this.ghost = this.add.image(0, 0, ITEMS[id].texture).setAlpha(0.6).setScale(1.2).setDepth(3000);
  }

  private stopPlacing() {
    this.placing = null;
    this.ghost?.destroy();
    this.ghost = null;
  }

  private openPetMenuInHouse() {
    this.menuOpen = true;
    const hasBed = State.data.placed.some((p) => p.id === 'bed');
    const foods = Object.entries(State.data.inventory).filter(([id]) => ITEMS[id]?.kind === 'food');
    const options = [
      {
        label: `Feed ${State.data.petName}`,
        icon: 'fish',
        disabled: foods.length === 0,
        onSelect: () => {
          this.menuOpen = false;
          this.openFeedMenu();
        },
      },
      {
        label: hasBed ? 'Tuck into bed (full energy!)' : 'Tuck into bed (needs a Dream Bed)',
        icon: 'item-bed',
        disabled: !hasBed,
        onSelect: () => {
          State.petSleep();
          toast(this, this.pet.sprite.x, this.pet.sprite.y - 24, 'Zzz... so cozy!', '#ffb3d1');
          this.pet.showEmotion('pet-sleep', 2500);
          this.hud.refresh();
          this.menuOpen = false;
        },
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
          this.menuOpen = false;
        },
      },
    ];
    const p = State.data.pet;
    const menu = new Menu(
      this,
      State.data.petName,
      options,
      `Food ${Math.round(p.hunger)} · Happy ${Math.round(p.happiness)} · Energy ${Math.round(p.energy)}`,
    );
    menu.onClose = () => {
      this.menuOpen = false;
      this.ignoreClicksUntil = this.time.now + 200;
    };
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
          this.menuOpen = false;
        },
      };
    });
    const menu = new Menu(this, `Feed ${State.data.petName}`, options);
    menu.onClose = () => {
      this.menuOpen = false;
      this.ignoreClicksUntil = this.time.now + 200;
    };
  }

  update() {
    if (!this.player) return;

    const speed = 200;
    let vx = 0;
    let vy = 0;
    if (!this.menuOpen && !this.placing) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -speed;
      else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = speed;
      if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed;
      else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed;
    }

    if (vx !== 0 || vy !== 0) {
      this.clickMove.clear();
    } else if (!this.menuOpen && !this.placing) {
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
    this.pet.update(this.player.x - (this.player.flipX ? -26 : 26), this.player.y + 8, moving);

    // Ghost follows the mouse, snapped to the grid
    if (this.placing && this.ghost) {
      const g = this.pointerToGrid(this.input.activePointer);
      if (g) {
        this.ghost.setVisible(true);
        this.ghost.x = ROOM_X + g.gx * TILE + TILE / 2;
        this.ghost.y = ROOM_Y + g.gy * TILE + TILE / 2;
        this.ghost.setTint(this.canPlaceAt(g.gx, g.gy) ? 0xffffff : 0xff6b6b);
      } else {
        this.ghost.setVisible(false);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
        this.stopPlacing();
      }
    }

    if (!this.menuOpen && !this.placing) {
      if (Phaser.Input.Keyboard.JustDown(this.keyI)) this.openDecorateMenu();

      const near = this.nearestHouseInteractable();
      if (near) {
        this.prompt.show(near.label);
        if (Phaser.Input.Keyboard.JustDown(this.keyE)) near.action();
      } else {
        this.prompt.hide();
      }
    } else {
      this.prompt.hide();
    }
  }
}
