import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State } from '../systems/GameState';
import { bottomButtons, HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { clothesPetMenuOption } from '../systems/petClothesMenu';
import { feedPetMenuOption } from '../systems/petFeedMenu';
import { ClickMove } from '../systems/ClickMove';
import { feetDepth } from '../systems/depth';
import { placeDoorMat } from '../systems/doorMat';
import { isInteractSuppressed, isUiBlocked } from '../systems/nav';
import { Joystick } from '../systems/Joystick';
import { CinnamorollNpc } from '../systems/CinnamorollNpc';

const TILE = 48;
const COLS = 12;
const ROWS = 9;
const ROOM_Y = 90;
const WALL_ROWS = 2;

/**
 * Cafe Cinnamon interior — soft cream boutique.
 * Cinnamoroll stands behind the counter and sells pet clothes.
 */
export class ClothesShopScene extends Phaser.Scene {
  private roomX = 0;
  private player!: Phaser.Physics.Arcade.Sprite;
  private pet!: Pet;
  private cinna!: CinnamorollNpc;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private hud!: HUD;
  private prompt!: Prompt;
  private clickMove!: ClickMove;
  private joystick!: Joystick;
  private pointerHeld = false;
  private menuOpen = false;
  private facing: 'up' | 'down' | 'side' = 'up';
  private doorCenterX = 0;
  private doorCenterY = 0;
  private glowed: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] = [];
  private ignoreClicksUntil = 0;

  constructor() {
    super('ClothesShop');
  }

  create() {
    generateTextures(this);
    this.roomX = (this.cameras.main.width - COLS * TILE) / 2;
    this.menuOpen = false;
    this.pointerHeld = false;
    this.ignoreClicksUntil = 0;

    this.cameras.main.setBackgroundColor('#3a2f2a');

    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const tex = gy < WALL_ROWS ? 'tile-wall' : 'tile-floor';
        const img = this.add
          .image(this.roomX + gx * TILE + TILE / 2, ROOM_Y + gy * TILE + TILE / 2, tex)
          .setDepth(-100);
        if (gy < WALL_ROWS) img.setTint(0xf5d0c8);
        else img.setTint(0xf0e0c8);
      }
    }

    const door = placeDoorMat(this, this.roomX, ROOM_Y, COLS, ROWS, 0xffb3d1);
    this.doorCenterX = door.centerX;
    this.doorCenterY = door.centerY;

    for (let gx = 4; gx <= 7; gx++) {
      const t = this.add
        .image(this.roomX + gx * TILE + TILE / 2, ROOM_Y + 3 * TILE + TILE / 2, 'item-table')
        .setScale(1.3)
        .setTint(0xffe0c0);
      t.setDepth(t.y);
    }

    // Stationary behind the counter (single waypoint = no wander).
    const cinnaX = this.roomX + 6 * TILE;
    const cinnaY = ROOM_Y + 2.55 * TILE;
    this.cinna = new CinnamorollNpc(this, [{ x: cinnaX, y: cinnaY }]);
    // CinnamorollNpc scales itself to display height; no override needed.

    const dressing: [number, number, string, number?][] = [
      [1.5, 2.6, 'item-bookshelf', 1.2],
      [10.5, 2.6, 'item-bookshelf', 1.2],
      [1.5, 5.5, 'item-plant', 1.2],
      [10.5, 5.5, 'item-flower', 1.25],
      [2.2, 3.8, 'clothes-rack', 1.2],
      [9.8, 3.8, 'clothes-rack', 1.2],
      [10.5, 4.4, 'item-lamp', 1.1],
    ];
    for (const [gx, gy, tex, scale] of dressing) {
      const img = this.add.image(this.roomX + gx * TILE, ROOM_Y + gy * TILE, tex).setScale(scale ?? 1.2);
      img.setDepth(tex === 'item-flower' ? feetDepth(img) : img.y);
    }

    this.add
      .text(this.cameras.main.width / 2, 40, 'Cafe Cinnamon — E / Space / tap Cinna to browse · ESC / door to leave', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffe6f2',
      })
      .setOrigin(0.5)
      .setDepth(1000);

    const px = door.centerX;
    const py = door.centerY; // ON the mat
    this.player = this.physics.add.sprite(px, py, 'penguin-up', 0);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(34, 16).setOffset(10, 42);
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    b.setBoundsRectangle(
      new Phaser.Geom.Rectangle(this.roomX, ROOM_Y + WALL_ROWS * TILE - 20, COLS * TILE, (ROWS - WALL_ROWS) * TILE + 20),
    );
    this.player.setCollideWorldBounds(true);
    this.facing = 'up';

    this.pet = new Pet(this, px - 30, py + 10);
    this.pet.sprite.setInteractive({ useHandCursor: true });
    this.pet.sprite.on('pointerdown', () => {
      this.ignoreClicksUntil = this.time.now + 200;
      if (!this.menuOpen && !isUiBlocked()) this.pet.speak();
    });

    const solids: Phaser.GameObjects.Rectangle[] = [];
    const addSolid = (x: number, y: number, w: number, h: number) => {
      const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
      this.physics.add.existing(r, true);
      solids.push(r);
    };
    addSolid(this.roomX + 6 * TILE, ROOM_Y + 3.5 * TILE + 6, 4 * TILE + 12, 34);
    addSolid(this.roomX + 1.5 * TILE, ROOM_Y + 2.8 * TILE, 44, 30);
    addSolid(this.roomX + 10.5 * TILE, ROOM_Y + 2.8 * TILE, 44, 30);
    addSolid(this.roomX + 2.2 * TILE, ROOM_Y + 4 * TILE, 40, 28);
    addSolid(this.roomX + 9.8 * TILE, ROOM_Y + 4 * TILE, 40, 28);
    addSolid(this.roomX + 1.5 * TILE, ROOM_Y + 5.6 * TILE, 36, 26);
    addSolid(this.roomX + 10.5 * TILE, ROOM_Y + 5.6 * TILE, 36, 26);
    this.physics.add.collider(this.player, solids);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyI = kb.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.hud = new HUD(this);
    this.prompt = new Prompt(this);
    this.clickMove = new ClickMove(this);
    this.joystick = new Joystick(this);

    bottomButtons(
      this,
      [{ label: '[ Pet ]', onTap: () => this.openPetMenu() }],
      () => {
        this.ignoreClicksUntil = this.time.now + 150;
      },
    );

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
    const nearCinna =
      Phaser.Math.Distance.Between(this.player.x, this.player.y, this.cinna.sprite.x, this.cinna.sprite.y + 40) < 95;
    if (nearCinna) {
      return {
        x: this.cinna.sprite.x,
        y: this.cinna.sprite.y,
        radius: 95,
        label: 'E / Space / click — Talk to Cinnamoroll',
        action: () => {
          this.menuOpen = true;
          this.cinna.talk({
            onClose: () => this.closeMenu(),
            keepMenuOpen: () => {
              this.menuOpen = true;
            },
            onAccessoriesChanged: () => this.pet.refreshAccessories(),
          });
        },
        targets: [this.cinna.sprite],
      };
    }
    if (
      Phaser.Math.Distance.Between(this.player.x, this.player.y, this.doorCenterX, this.doorCenterY) < 55
    ) {
      return {
        x: this.doorCenterX,
        y: this.doorCenterY,
        radius: 55,
        label: 'E / Space / click — Leave Cafe Cinnamon',
        action: () => this.scene.start('Town', { spawn: 'cafe' }),
      };
    }
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
        emptyHint: 'no food — visit Daniel!',
        onFed: () => this.hud.refresh(),
      }),
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

  update() {
    if (!this.player) return;

    this.cinna.update();

    const speed = 200;
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
        if (
          !isInteractSuppressed() &&
          (Phaser.Input.Keyboard.JustDown(this.keyE) ||
            Phaser.Input.Keyboard.JustDown(this.keySpace))
        )
          near.action();
      } else {
        this.prompt.hide();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyI) && !isUiBlocked()) {
        this.openPetMenu();
      }
    } else {
      this.prompt.hide();
      this.setHighlight(undefined);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) && !this.menuOpen && !isUiBlocked()) {
      this.scene.start('Town', { spawn: 'cafe' });
    }
  }
}
