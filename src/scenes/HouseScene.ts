import Phaser from 'phaser';
import { configurePlayerPenguin, generateTextures } from '../sprites/pixelart';
import { State, ITEMS } from '../systems/GameState';
import { bottomButtons, HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { clothesPetMenuOption } from '../systems/petClothesMenu';
import { feedPetMenuOption } from '../systems/petFeedMenu';
import { ClickMove } from '../systems/ClickMove';
import { feetDepth } from '../systems/depth';
import { placeDoorMat, isDoorMatCell } from '../systems/doorMat';
import { blockUi, isInteractSuppressed, isUiBlocked, unblockUi } from '../systems/nav';
import { Joystick } from '../systems/Joystick';
import { attachCameraZoom, markAsUi, type CameraZoom } from '../systems/cameraZoom';
import { openInventoryMenu as showInventoryMenu } from '../systems/inventoryMenu';
import { updateInteractionHighlight } from '../systems/interactionHighlight';
import { addWorldBezel } from '../systems/worldBezel';
import { movementFacing } from '../systems/movementFacing';

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
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyP!: Phaser.Input.Keyboard.Key;
  private hud!: HUD;
  private prompt!: Prompt;
  private menuOpen = false;
  private facing: 'up' | 'down' | 'side' = 'down';
  private furnitureSprites: Phaser.GameObjects.Image[] = [];
  private clickMove!: ClickMove;
  private joystick!: Joystick;
  private cameraZoom!: CameraZoom;
  private pointerHeld = false;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  // Placement mode: a ghost of the selected item follows the mouse.
  private placing: string | null = null;
  private ghost: Phaser.GameObjects.Image | null = null;
  private doorGxs: [number, number] = [0, 0];
  private doorCenterX = 0;
  private doorCenterY = 0;
  private glowed: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] = [];
  // The pointerdown that closes a menu must not also place/pick up furniture.
  private ignoreClicksUntil = 0;
  /** True while the pet is walking to / sleeping in bed. */
  private petTucking = false;

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
    addWorldBezel(
      this,
      { x: this.roomX, y: ROOM_Y, width: COLS * TILE, height: ROWS * TILE },
      0x241f38,
    );
    const door = placeDoorMat(this, this.roomX, ROOM_Y, COLS, ROWS, 0x8d6e63);
    this.doorGxs = door.doorGxs;
    this.doorCenterX = door.centerX;
    this.doorCenterY = door.centerY;

    this.renderFurniture();

    const px = door.centerX;
    const py = door.centerY; // ON the mat
    this.player = this.physics.add.sprite(px, py, 'penguin-up', 0);
    configurePlayerPenguin(this.player);
    // Keep the penguin inside the floor area of the room.
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
      if (!this.menuOpen && !this.placing && !isUiBlocked()) this.pet.speak();
    });

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
    this.pointerHeld = false;

    // Player inventory and pet care — the game menu lives in the shell.
    bottomButtons(
      this,
      [
        { label: '[ Inventory · I ]', onTap: () => { if (!this.menuOpen && !this.placing) this.openInventory(); } },
        { label: '[ Pet · P ]', onTap: () => { if (!this.menuOpen && !this.placing) this.openPetMenuInHouse(); } },
      ],
      () => {
        this.ignoreClicksUntil = this.time.now + 150;
      },
    );

    const houseHint = this.add
      .text(this.cameras.main.width / 2, 40, 'Your House — I: inventory · P: pet · [Decorate] · ESC/E/Space at door: leave', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#c8c8dc',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000);

    // Clickable Decorate button.
    const decorateBtn = this.add
      .text(this.cameras.main.width - 10, 10, '[ Decorate ]', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#a8e6cf',
        // Same dark chip as the bottom action buttons so they
        // in-scene action buttons read as one family (and stay legible on
        // the bright wall band behind them).
        backgroundColor: '#1a1a2ecc',
        padding: { x: 8, y: 8 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });
    decorateBtn.on('pointerover', () => decorateBtn.setColor('#d3f5e6'));
    decorateBtn.on('pointerout', () => decorateBtn.setColor('#a8e6cf'));
    decorateBtn.on('pointerdown', () => {
      // Swallow this click so the scene handler doesn't also walk/pick up.
      this.ignoreClicksUntil = this.time.now + 150;
      if (!this.menuOpen && !this.placing) this.openDecorateMenu();
    });
    markAsUi(this, houseHint, decorateBtn);

    this.cameraZoom = attachCameraZoom(this, {
      kind: 'hub',
      isBlocked: () => this.menuOpen || isUiBlocked() || Boolean(this.placing),
      joystick: this.joystick,
      onPinchStart: () => {
        this.pointerHeld = false;
        this.clickMove.clear();
      },
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
      if (this.joystick.owns(pointer) || this.cameraZoom.ownsPointer(pointer)) return; // joystick / zoom slider
      if (this.cameraZoom.isPinching()) return;
      const g = this.pointerToGrid(pointer);
      if (this.placing) {
        if (g && this.canPlaceAt(g.gx, g.gy)) {
          State.placeItem(this.placing, g.gx, g.gy);
          toast(this, pointer.worldX, pointer.worldY - 20, 'Placed!', '#a8e6cf');
          this.stopPlacing();
          this.renderFurniture();
        } else {
          toast(this, pointer.worldX, pointer.worldY - 20, "Can't place there", '#ff6b6b');
        }
        return;
      }
      if (g) {
        const placed = State.data.placed.find((p) => p.gx === g.gx && p.gy === g.gy);
        if (placed) {
          const name = ITEMS[placed.id]?.name ?? 'item';
          this.menuOpen = true;
          this.clickMove.clear();
          const menu = new Menu(
            this,
            'Pick up furniture?',
            [
              { label: 'Leave it', onSelect: () => undefined },
              {
                label: `Pick up ${name}`,
                onSelect: () => {
                  const picked = State.pickUpItem(g.gx, g.gy);
                  if (picked) {
                    toast(
                      this,
                      pointer.worldX,
                      pointer.worldY - 20,
                      `${ITEMS[picked]?.name ?? name} → inventory`,
                      '#ffe066',
                    );
                    this.renderFurniture();
                  }
                },
              },
            ],
            `${name} goes back to your inventory`,
          );
          menu.onClose = () => {
            this.menuOpen = false;
            this.ignoreClicksUntil = this.time.now + 250;
          };
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
    const nearDoor =
      Phaser.Math.Distance.Between(this.player.x, this.player.y, this.doorCenterX, this.doorCenterY) < 55;
    if (nearDoor) {
      return {
        x: this.doorCenterX,
        y: this.doorCenterY,
        radius: 55,
        label: 'E / Space / click — Leave house',
        action: () => this.scene.start('Town', { spawn: 'house' }),
      };
    }
    // Pet care lives on the bottom [ Pet · P ] button — no proximity interaction.
    return null;
  }

  // Lightweight tint on whatever the player can currently interact with.
  private setHighlight(targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[]) {
    this.glowed = updateInteractionHighlight(this.glowed, targets);
  }

  private pointerToGrid(pointer: Phaser.Input.Pointer): { gx: number; gy: number } | null {
    // Screen → world (accounts for camera zoom).
    pointer.updateWorldPoint(this.cameras.main);
    const gx = Math.floor((pointer.worldX - this.roomX) / TILE);
    const gy = Math.floor((pointer.worldY - ROOM_Y) / TILE);
    if (gx < 0 || gx >= COLS || gy < WALL_ROWS || gy >= ROWS) return null;
    return { gx, gy };
  }

  private canPlaceAt(gx: number, gy: number): boolean {
    if (isDoorMatCell(gx, this.doorGxs, gy, ROWS)) return false; // keep the doorway clear
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
      img.setData('gx', p.gx).setData('gy', p.gy);
      img.setDepth(p.id === 'rug' ? -50 : feetDepth(img));
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
        disabled: !hasBed || this.petTucking,
        onSelect: () => {
          this.menuOpen = false;
          this.tuckPetIntoBed();
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
        openParent: () => this.openPetMenuInHouse(),
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

  private openInventory() {
    if (this.menuOpen || this.placing) return;
    this.menuOpen = true;
    showInventoryMenu(this, {
      closeMenu: () => {
        this.menuOpen = false;
        this.ignoreClicksUntil = this.time.now + 200;
      },
      keepMenuOpen: () => {
        this.menuOpen = true;
      },
    });
  }

  /** Walk to the placed bed, sleep (energy up, hunger/happy down), then return. */
  private tuckPetIntoBed() {
    if (this.petTucking) return;
    const bed = State.data.placed.find((p) => p.id === 'bed');
    if (!bed) return;
    this.petTucking = true;
    const bedX = this.roomX + bed.gx * TILE + TILE / 2;
    // Sit on the mattress, slightly above tile centre so feet read on the bed.
    const bedY = ROOM_Y + bed.gy * TILE + TILE / 2 - 6;

    // Draw the sleeping pet above the bed — the bed's y-sort depth can
    // otherwise win at this row and hide the pet behind the mattress.
    const bedImg = this.furnitureSprites.find(
      (s) => s.getData('gx') === bed.gx && s.getData('gy') === bed.gy,
    );
    const sleepDepth = (bedImg ? bedImg.depth : feetDepth(this.pet.sprite)) + 5;

    this.pet.walkTo(bedX, bedY, () => {
      State.petSleep();
      this.pet.showEmotion('sleep', 3200);
      this.pet.pinDepth(sleepDepth);
      toast(this, bedX, bedY - 28, 'Zzz… so cozy!', '#ffb3d1');
      this.hud.refresh();
      this.time.delayedCall(3000, () => {
        if (!this.pet || !this.player) {
          this.pet?.unpinDepth();
          this.petTucking = false;
          return;
        }
        this.pet.unpinDepth();
        const backX = this.player.x - 30;
        const backY = this.player.y + 10;
        this.pet.walkTo(backX, backY, () => {
          this.pet.resumeFollow();
          this.petTucking = false;
          this.hud.refresh();
        });
      });
    });
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

    // I owns player inventory; P owns pet care.
    if (!this.placing && Phaser.Input.Keyboard.JustDown(this.keyI)) {
      if (this.menuOpen) Menu.closeTop();
      else if (!isUiBlocked()) this.openInventory();
    }
    if (!this.placing && Phaser.Input.Keyboard.JustDown(this.keyP)) {
      if (this.menuOpen) Menu.closeTop();
      else if (!isUiBlocked()) this.openPetMenuInHouse();
    }

    if (!this.menuOpen && !this.placing) {
      const near = this.nearestHouseInteractable();
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
  }
}
