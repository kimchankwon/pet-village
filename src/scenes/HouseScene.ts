import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State, ITEMS } from '../systems/GameState';
import { bottomButtons, HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { clothesPetMenuOption } from '../systems/petClothesMenu';
import { feedPetMenuOption } from '../systems/petFeedMenu';
import { ClickMove } from '../systems/ClickMove';
import { feetDepth } from '../systems/depth';
import { blockUi, isUiBlocked, unblockUi } from '../systems/nav';
import { Joystick } from '../systems/Joystick';

const TILE = 48;
const COLS = 12;
const ROWS = 9;
const ROOM_Y = 90;
const WALL_ROWS = 2;

export class HouseScene extends Phaser.Scene {
  private roomX = 0;
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
  private joystick!: Joystick;
  private pointerHeld = false;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  // Placement mode: a ghost of the selected item follows the mouse.
  private placing: string | null = null;
  private ghost: Phaser.GameObjects.Image | null = null;
  private doorMat!: Phaser.GameObjects.Image;
  private glowed: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] = [];
  // The pointerdown that closes a menu must not also place/pick up furniture.
  private ignoreClicksUntil = 0;

  constructor() {
    super('House');
  }

  create() {
    generateTextures(this);
    this.roomX = (this.cameras.main.width - COLS * TILE) / 2;
    this.menuOpen = false;
    this.placing = null;
    this.ghost = null;

    this.cameras.main.setBackgroundColor('#241f38');

    // Walls + floor
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const tex = gy < WALL_ROWS ? 'tile-wall' : 'tile-floor';
        this.add.image(this.roomX + gx * TILE + TILE / 2, ROOM_Y + gy * TILE + TILE / 2, tex).setDepth(-100);
      }
    }
    // Door mat at bottom center
    const doorGx = Math.floor(COLS / 2);
    this.doorMat = this.add
      .image(this.roomX + doorGx * TILE + TILE / 2, ROOM_Y + (ROWS - 1) * TILE + TILE / 2, 'item-rug')
      .setDepth(-99)
      .setTint(0x8d6e63)
      .setScale(1.3);

    this.renderFurniture();

    const px = this.roomX + doorGx * TILE + TILE / 2;
    const py = ROOM_Y + (ROWS - 2) * TILE;
    this.player = this.physics.add.sprite(px, py, 'penguin-up', 0);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(34, 16).setOffset(10, 42);
    // Keep the penguin inside the floor area of the room.
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    b.setBoundsRectangle(
      new Phaser.Geom.Rectangle(this.roomX, ROOM_Y + WALL_ROWS * TILE - 20, COLS * TILE, (ROWS - WALL_ROWS) * TILE + 20),
    );
    this.player.setCollideWorldBounds(true);
    this.facing = 'up';

    this.pet = new Pet(this, px - 30, py + 10);
    // Tap/click your pet to hear what's on its mind.
    this.pet.sprite.setInteractive({ useHandCursor: true });
    this.pet.sprite.on('pointerdown', () => {
      this.ignoreClicksUntil = this.time.now + 200;
      if (!this.menuOpen && !this.placing && !isUiBlocked()) this.pet.speak();
    });

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyI = kb.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.hud = new HUD(this);
    this.prompt = new Prompt(this);
    this.clickMove = new ClickMove(this);
    this.joystick = new Joystick(this);
    this.pointerHeld = false;

    // Pet care only — the game menu lives on the shell's top-bar Menu button.
    bottomButtons(
      this,
      [{ label: '[ Pet ]', onTap: () => { if (!this.menuOpen && !this.placing) this.openPetMenuInHouse(); } }],
      () => {
        this.ignoreClicksUntil = this.time.now + 150;
      },
    );

    this.add
      .text(this.cameras.main.width / 2, 40, 'Your House — click to walk · I: pet · [Decorate] · ESC/E at door: leave', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#c8c8dc',
      })
      .setOrigin(0.5)
      .setDepth(1000);

    // Clickable Decorate button.
    const decorateBtn = this.add
      .text(this.cameras.main.width - 10, 10, '[ Decorate ]', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#a8e6cf',
        // Same dark chip as the bottom-right [ Pet ] button so the two
        // in-scene action buttons read as one family (and stay legible on
        // the bright wall band behind them).
        backgroundColor: '#1a1a2ecc',
        padding: { x: 8, y: 8 },
      })
      .setOrigin(1, 0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });
    decorateBtn.on('pointerover', () => decorateBtn.setColor('#d3f5e6'));
    decorateBtn.on('pointerout', () => decorateBtn.setColor('#a8e6cf'));
    decorateBtn.on('pointerdown', () => {
      // Swallow this click so the scene handler doesn't also walk/pick up.
      this.ignoreClicksUntil = this.time.now + 150;
      if (!this.menuOpen && !this.placing) this.openDecorateMenu();
    });

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
      if (this.joystick.owns(pointer)) return; // joystick captured this touch
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
          this.roomX + g.gx * TILE + TILE / 2,
          ROOM_Y + g.gy * TILE + TILE / 2,
        );
        this.pointerHeld = true;
      }
    });
    const endHold = () => {
      this.pointerHeld = false;
    };
    this.input.on('pointerup', endHold);
    this.input.on('pointerupoutside', endHold);
  }

  private nearestHouseInteractable(): {
    x: number;
    y: number;
    radius: number;
    label: string;
    action: () => void;
    targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[];
  } | null {
    const doorX = this.roomX + Math.floor(COLS / 2) * TILE + TILE / 2;
    const doorY = ROOM_Y + (ROWS - 1) * TILE + TILE / 2;
    const nearDoor = Phaser.Math.Distance.Between(this.player.x, this.player.y, doorX, doorY) < 55;
    if (nearDoor) {
      return {
        x: doorX,
        y: doorY,
        radius: 55,
        label: 'E / click — Leave house',
        action: () => this.scene.start('Town', { spawn: 'house' }),
        targets: [this.doorMat],
      };
    }
    // (Pet care lives on the bottom [ Pet ] button — no proximity interaction.)
    return null;
  }

  // Outline glow on whatever the player can currently interact with.
  private setHighlight(targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[]) {
    const next = targets ?? [];
    if (next[0] === this.glowed[0] && next.length === this.glowed.length) return;
    for (const o of this.glowed) o.postFX?.clear();
    this.glowed = next;
    for (const o of this.glowed) o.postFX?.addGlow(0xffe066, 4);
  }

  private pointerToGrid(pointer: Phaser.Input.Pointer): { gx: number; gy: number } | null {
    const gx = Math.floor((pointer.x - this.roomX) / TILE);
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
      const x = this.roomX + p.gx * TILE + TILE / 2;
      const y = ROOM_Y + p.gy * TILE + TILE / 2;
      const img = this.add.image(x, y, def.texture).setScale(1.2);
      img.setDepth(p.id === 'rug' ? -50 : y);
      this.furnitureSprites.push(img);
    }
  }

  private openDecorateMenu() {
    const furniture = Object.entries(State.data.inventory).filter(([id]) => ITEMS[id]?.kind === 'furniture');
    if (furniture.length === 0) {
      toast(this, this.cameras.main.width / 2, this.cameras.main.height / 2, 'No furniture in inventory — visit the shop!', '#ff6b6b');
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
    blockUi();
    this.ghost = this.add.image(0, 0, ITEMS[id].texture).setAlpha(0.6).setScale(1.2).setDepth(3000);
  }

  private stopPlacing() {
    if (this.placing) unblockUi();
    this.placing = null;
    this.ghost?.destroy();
    this.ghost = null;
  }

  private openPetMenuInHouse() {
    this.menuOpen = true;
    const hasBed = State.data.placed.some((p) => p.id === 'bed');
    const options = [
      {
        label: `Chat with ${State.data.petName}`,
        icon: this.pet.sprite.texture.key,
        onSelect: () => {
          this.pet.speak();
          this.menuOpen = false;
        },
      },
      feedPetMenuOption(this, this.pet, {
        closeMenu: () => {
          this.menuOpen = false;
          this.ignoreClicksUntil = this.time.now + 200;
        },
        keepMenuOpen: () => {
          this.menuOpen = true;
        },
        onFed: () => this.hud.refresh(),
      }),
      {
        label: hasBed ? 'Tuck into bed (full energy!)' : 'Tuck into bed (needs a Dream Bed)',
        icon: 'item-bed',
        disabled: !hasBed,
        onSelect: () => {
          State.petSleep();
          toast(this, this.pet.sprite.x, this.pet.sprite.y - 24, 'Zzz... so cozy!', '#ffb3d1');
          this.pet.showEmotion('sleep', 2500);
          this.hud.refresh();
          this.menuOpen = false;
        },
      },
      clothesPetMenuOption(this, this.pet, {
        closeMenu: () => {
          this.menuOpen = false;
          this.ignoreClicksUntil = this.time.now + 200;
        },
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
    menu.onClose = () => {
      this.menuOpen = false;
      this.ignoreClicksUntil = this.time.now + 200;
    };
  }

  update() {
    if (!this.player) return;

    const speed = 200;
    // The shell (React) menu blocks input via nav; treat it like a menu.
    const uiOpen = this.menuOpen || this.placing || isUiBlocked();
    let vx = 0;
    let vy = 0;
    if (!uiOpen) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -speed;
      else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = speed;
      if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed;
      else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed;
    }

    // Priority: keyboard > joystick > click/hold-to-move.
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

    // Ghost follows the mouse, snapped to the grid
    if (this.placing && this.ghost) {
      const g = this.pointerToGrid(this.input.activePointer);
      if (g) {
        this.ghost.setVisible(true);
        this.ghost.x = this.roomX + g.gx * TILE + TILE / 2;
        this.ghost.y = ROOM_Y + g.gy * TILE + TILE / 2;
        this.ghost.setTint(this.canPlaceAt(g.gx, g.gy) ? 0xffffff : 0xff6b6b);
      } else {
        this.ghost.setVisible(false);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
        this.stopPlacing();
      }
    } else if (Phaser.Input.Keyboard.JustDown(this.keyEsc) && !isUiBlocked()) {
      this.scene.start('Town', { spawn: 'house' });
    }

    if (!this.menuOpen && !this.placing) {
      if (Phaser.Input.Keyboard.JustDown(this.keyI) && !isUiBlocked()) {
        this.openPetMenuInHouse();
      }
      const near = this.nearestHouseInteractable();
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
  }
}
