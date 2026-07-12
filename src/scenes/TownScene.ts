import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State, WELCOME_KEY } from '../systems/GameState';
import { bottomButtons, HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { ClickMove } from '../systems/ClickMove';
import { feetDepth } from '../systems/depth';
import { isUiBlocked, requestLeave } from '../systems/nav';
import { Joystick } from '../systems/Joystick';
import { BongbongeeNpc } from '../systems/BongbongeeNpc';
import { MiniteenRoster } from '../systems/MiniteenRoster';
import type { WandererNpc } from '../systems/WandererNpc';
import { clothesPetMenuOption } from '../systems/petClothesMenu';
import { feedPetMenuOption } from '../systems/petFeedMenu';
import { TILE, TOWN_MAP_H, TOWN_MAP_W, TOWN_WORLD_H, TOWN_WORLD_W } from '../systems/townMap';

/** Compact town — smaller than the old 32×24 crossroads map. */
const MAP_W = TOWN_MAP_W;
const MAP_H = TOWN_MAP_H;
const WORLD_W = TOWN_WORLD_W;
const WORLD_H = TOWN_WORLD_H;

/** Building anchors (tile coords) — clustered around the central square. */
const HOUSE_POS = { tx: 11, ty: 3.15 };
const SHOP_POS = { tx: 17.2, ty: 3.5 };
const CAFE_POS = { tx: 4.8, ty: 3.5 };
const ARCADE_POS = { tx: 16.8, ty: 12.1 };
const FOUNTAIN_POS = { tx: 11, ty: 8.4 };

interface Interactable {
  x: number;
  y: number;
  radius: number;
  label: string;
  action: () => void;
  /** Sprites that get an outline glow while this is the active interactable. */
  targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[];
}

export class TownScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private pet!: Pet;
  private npcs: WandererNpc[] = [];
  private miniteens!: MiniteenRoster;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private hud!: HUD;
  private prompt!: Prompt;
  private interactables: Interactable[] = [];
  private menuOpen = false;
  private facing: 'up' | 'down' | 'side' = 'down';
  private clickMove!: ClickMove;
  private joystick!: Joystick;
  // Hold-to-move: while the walk pointer stays down, keep steering at it.
  private pointerHeld = false;
  private houseImg!: Phaser.GameObjects.Image;
  private shopImg!: Phaser.GameObjects.Image;
  private cafeImg!: Phaser.GameObjects.Image;
  private glowed: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] = [];
  // Menu option clicks must not also trigger walk/interact underneath.
  private ignoreClicksUntil = 0;
  /** Solid hitboxes for outdoor décor (filled in scatterTownDecor). */
  private decoSolids: { x: number; y: number; w: number; h: number }[] = [];

  constructor() {
    super('Town');
  }

  create(data: { spawn?: 'house' | 'arcade' | 'shop' | 'cafe' | 'shore' }) {
    generateTextures(this);
    this.interactables = [];
    this.menuOpen = false;
    this.ignoreClicksUntil = 0;

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    this.buildMap();

    // Spawn in the town square (or just outside the building you left).
    let sx = FOUNTAIN_POS.tx * TILE;
    let sy = (FOUNTAIN_POS.ty + 2.2) * TILE;
    if (data?.spawn === 'house') {
      sx = HOUSE_POS.tx * TILE;
      sy = (HOUSE_POS.ty + 2.4) * TILE;
    } else if (data?.spawn === 'arcade') {
      sx = ARCADE_POS.tx * TILE;
      sy = (ARCADE_POS.ty + 1.2) * TILE;
    } else if (data?.spawn === 'shop') {
      sx = SHOP_POS.tx * TILE;
      sy = (SHOP_POS.ty + 2.4) * TILE;
    } else if (data?.spawn === 'cafe') {
      sx = CAFE_POS.tx * TILE;
      sy = (CAFE_POS.ty + 2.4) * TILE;
    } else if (data?.spawn === 'shore') {
      sx = 10.5 * TILE;
      sy = (MAP_H - 2.2) * TILE;
    }

    this.player = this.physics.add.sprite(sx, sy, 'penguin-down', 0);
    this.player.setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(34, 16).setOffset(10, 42);

    this.pet = new Pet(this, sx - 30, sy + 10);
    // Tap/click your pet to hear what's on its mind.
    this.pet.sprite.setInteractive({ useHandCursor: true });
    this.pet.sprite.on('pointerdown', () => {
      this.ignoreClicksUntil = this.time.now + 200;
      if (!this.menuOpen && !isUiBlocked()) this.pet.speak();
    });

    this.npcs = [
      // Bongbongee wanders the square; Cinnamoroll is inside Cafe Cinnamon.
      new BongbongeeNpc(this, [
        { x: 7.5 * TILE, y: 9.5 * TILE },
        { x: 14 * TILE, y: 7.2 * TILE },
        { x: 18 * TILE, y: 10 * TILE },
        { x: 8.5 * TILE, y: 12 * TILE },
        { x: 14.5 * TILE, y: 11.5 * TILE },
      ]),
    ];
    // Only a few MINITEEN on the map at a time; they rotate in/out.
    this.miniteens = new MiniteenRoster(this);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.buildColliders();

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

    // Always-reachable pet care. (The game menu lives on the shell's
    // single top-bar Menu button — no duplicate button here.)
    bottomButtons(
      this,
      [{ label: '[ Pet ]', onTap: () => { if (!this.menuOpen) this.openPetMenu(); } }],
      () => {
        this.ignoreClicksUntil = this.time.now + 150;
      },
    );

    // Club Penguin-style: click ground to walk; click a nearby interactable to use it.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.menuOpen || this.time.now < this.ignoreClicksUntil || pointer.button !== 0) return;
      if (this.joystick.owns(pointer)) return; // joystick captured this touch
      // Clicking anywhere on the house enters it when near; otherwise walk
      // to the door instead of into the walls.
      if (this.houseImg.getBounds().contains(pointer.worldX, pointer.worldY)) {
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          HOUSE_POS.tx * TILE,
          (HOUSE_POS.ty + 0.15) * TILE,
        );
        if (d < 150) {
          this.clickMove.clear();
          this.scene.start('House');
        } else {
          this.clickMove.setTarget(HOUSE_POS.tx * TILE, (HOUSE_POS.ty + 2.2) * TILE);
        }
        return;
      }
      if (this.shopImg.getBounds().contains(pointer.worldX, pointer.worldY)) {
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          SHOP_POS.tx * TILE,
          (SHOP_POS.ty + 0.15) * TILE,
        );
        if (d < 150) {
          this.clickMove.clear();
          this.scene.start('Shop');
        } else {
          this.clickMove.setTarget(SHOP_POS.tx * TILE, (SHOP_POS.ty + 2.1) * TILE);
        }
        return;
      }
      if (this.cafeImg.getBounds().contains(pointer.worldX, pointer.worldY)) {
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          CAFE_POS.tx * TILE,
          (CAFE_POS.ty + 0.15) * TILE,
        );
        if (d < 150) {
          this.clickMove.clear();
          this.scene.start('ClothesShop');
        } else {
          this.clickMove.setTarget(CAFE_POS.tx * TILE, (CAFE_POS.ty + 2.1) * TILE);
        }
        return;
      }
      const near = this.nearestInteractable();
      if (near) {
        const clickDist = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, near.x, near.y);
        // Click on/near the thing (or right on the player while in range) → interact.
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

    // Live tamagotchi tick: 1 minute of play = 1 minute of decay.
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

    if (!localStorage.getItem(WELCOME_KEY)) {
      localStorage.setItem(WELCOME_KEY, '1');
      toast(this, sx, sy - 70, `Welcome, ${State.data.petName}!`, '#ffe066');
    }
  }

  private buildMap() {
    // Grass base
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-grass').setDepth(-100);
      }
    }

    // Central cobblestone town square
    for (let ty = 5; ty <= 11; ty++) {
      for (let tx = 5; tx <= 16; tx++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-plaza').setDepth(-99);
      }
    }
    // Soft dirt paths from square to south gate + building fronts
    for (let ty = 12; ty < MAP_H; ty++) {
      this.add.image(10 * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      this.add.image(11 * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
    }
    for (let tx = 4; tx <= 6; tx++) {
      for (let ty = 4; ty <= 5; ty++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      }
    }
    for (let tx = 10; tx <= 12; tx++) {
      for (let ty = 4; ty <= 5; ty++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      }
    }
    for (let tx = 16; tx <= 18; tx++) {
      for (let ty = 4; ty <= 5; ty++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      }
    }
    for (let tx = 15; tx <= 17; tx++) {
      for (let ty = 11; ty <= 13; ty++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      }
    }

    // Player's house — north edge of the square
    const house = this.add.image(HOUSE_POS.tx * TILE, HOUSE_POS.ty * TILE, 'house').setScale(1.85);
    house.setDepth(house.y + house.displayHeight / 2);
    this.houseImg = house;
    this.add
      .text(HOUSE_POS.tx * TILE, HOUSE_POS.ty * TILE - house.displayHeight / 2 - 10, 'My House', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: HOUSE_POS.tx * TILE,
      y: (HOUSE_POS.ty + 0.2) * TILE,
      radius: 120,
      label: 'E / click — Enter house',
      action: () => this.scene.start('House'),
      targets: [house],
    });

    // Daniel's shop — NE of the square
    const shop = this.add.image(SHOP_POS.tx * TILE, SHOP_POS.ty * TILE, 'shop').setScale(1.85);
    shop.setDepth(shop.y + shop.displayHeight / 2);
    this.shopImg = shop;
    this.add
      .text(SHOP_POS.tx * TILE, SHOP_POS.ty * TILE - shop.displayHeight / 2 - 10, "Daniel's Shop", {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: SHOP_POS.tx * TILE,
      y: (SHOP_POS.ty + 0.2) * TILE,
      radius: 120,
      label: "E / click — Enter Daniel's Shop",
      action: () => this.scene.start('Shop'),
      targets: [shop],
    });

    // Cafe Cinnamon — NW of the square
    const cafe = this.add.image(CAFE_POS.tx * TILE, CAFE_POS.ty * TILE, 'cafe').setScale(1.85);
    cafe.setDepth(cafe.y + cafe.displayHeight / 2);
    this.cafeImg = cafe;
    this.add
      .text(CAFE_POS.tx * TILE, CAFE_POS.ty * TILE - cafe.displayHeight / 2 - 10, 'Cafe Cinnamon', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffe6f2',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: CAFE_POS.tx * TILE,
      y: (CAFE_POS.ty + 0.2) * TILE,
      radius: 120,
      label: 'E / click — Enter Cafe Cinnamon',
      action: () => this.scene.start('ClothesShop'),
      targets: [cafe],
    });

    // Arcade — SE edge of the square
    const arcade = this.add.image(ARCADE_POS.tx * TILE, ARCADE_POS.ty * TILE, 'arcade').setScale(1.4);
    arcade.setDepth(arcade.y + arcade.displayHeight / 2);
    this.add
      .text(ARCADE_POS.tx * TILE, ARCADE_POS.ty * TILE - 46, 'Paper Toss', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: ARCADE_POS.tx * TILE,
      y: ARCADE_POS.ty * TILE,
      radius: 80,
      label: 'E / click — Play Paper Toss',
      action: () => this.scene.start('PaperToss'),
      targets: [arcade],
    });

    // South path → shore / ocean (bottom-centre)
    const shoreX = 10.5 * TILE;
    const shoreY = (MAP_H - 1.15) * TILE;
    const shoreSign = this.add.image(shoreX + 36, shoreY - 8, 'signpost').setScale(1.2);
    shoreSign.setDepth(shoreSign.y + shoreSign.displayHeight / 2);
    this.add
      .text(shoreX, shoreY - 40, 'Shore →', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: shoreX,
      y: shoreY,
      radius: 95,
      label: 'E / click — Walk to the shore',
      action: () => this.scene.start('Shore', { spawn: 'town' }),
      targets: [shoreSign],
    });

    this.scatterTownDecor();
  }

  /**
   * Bustling square décor — fountain landmark, seating, lamps, shop clutter.
   * `solid` = [width, height, yOffset] for physics; omit for walk-through décor.
   */
  private scatterTownDecor() {
    type Spot = {
      tex: string;
      tx: number;
      ty: number;
      scale?: number;
      solid?: [number, number, number?];
    };

    const trees: Spot[] = [
      { tex: 'tree', tx: 1.2, ty: 1.8, scale: 1.4, solid: [36, 28, 18] },
      { tex: 'tree', tx: 20.5, ty: 1.8, scale: 1.4, solid: [36, 28, 18] },
      { tex: 'tree', tx: 1.4, ty: 14.2, scale: 1.4, solid: [36, 28, 18] },
      { tex: 'tree', tx: 20.4, ty: 14.2, scale: 1.4, solid: [36, 28, 18] },
      { tex: 'tree', tx: 8.2, ty: 1.6, scale: 1.3, solid: [34, 26, 16] },
      { tex: 'tree', tx: 14, ty: 1.5, scale: 1.3, solid: [34, 26, 16] },
      { tex: 'tree', tx: 1.6, ty: 7.5, scale: 1.25, solid: [34, 26, 16] },
      { tex: 'tree', tx: 20.2, ty: 7.8, scale: 1.25, solid: [34, 26, 16] },
    ];

    const bushes: Spot[] = [
      { tex: 'bush', tx: 7.2, ty: 3.2, scale: 1.15, solid: [26, 16, 6] },
      { tex: 'bush', tx: 14.6, ty: 3.1, scale: 1.15, solid: [26, 16, 6] },
      { tex: 'bush', tx: 2.8, ty: 5.2, scale: 1.1, solid: [26, 16, 6] },
      { tex: 'bush', tx: 19, ty: 5.4, scale: 1.1, solid: [26, 16, 6] },
      { tex: 'bush', tx: 6.5, ty: 13.5, scale: 1.15, solid: [26, 16, 6] },
      { tex: 'bush', tx: 13.5, ty: 13.8, scale: 1.15, solid: [26, 16, 6] },
      { tex: 'bush', tx: 18.8, ty: 13.2, scale: 1.1, solid: [26, 16, 6] },
    ];

    const flowers: Spot[] = [
      { tex: 'wildflower', tx: 6.2, ty: 5.4, scale: 1.25 },
      { tex: 'wildflower', tx: 9.2, ty: 5.2, scale: 1.2 },
      { tex: 'wildflower', tx: 12.8, ty: 5.3, scale: 1.25 },
      { tex: 'wildflower', tx: 15.8, ty: 5.5, scale: 1.2 },
      { tex: 'wildflower', tx: 7.5, ty: 11.6, scale: 1.2 },
      { tex: 'wildflower', tx: 13.2, ty: 11.4, scale: 1.25 },
      { tex: 'wildflower', tx: 3.5, ty: 10.5, scale: 1.2 },
      { tex: 'wildflower', tx: 18.5, ty: 9.2, scale: 1.2 },
      { tex: 'mushroom', tx: 2.4, ty: 11.2, scale: 1.15 },
      { tex: 'mushroom', tx: 19.2, ty: 12.5, scale: 1.15 },
    ];

    const hardscape: Spot[] = [
      // Town square fountain — landmark in the middle
      { tex: 'fountain', tx: FOUNTAIN_POS.tx, ty: FOUNTAIN_POS.ty, scale: 1.7, solid: [52, 38, 10] },
      { tex: 'fountain', tx: 13.4, ty: 9.8, scale: 1.05, solid: [36, 26, 8] },
      // Seating around the square
      { tex: 'bench', tx: 8.2, ty: 7.4, scale: 1.2, solid: [52, 20, 5] },
      { tex: 'bench', tx: 13.8, ty: 7.3, scale: 1.2, solid: [52, 20, 5] },
      { tex: 'bench', tx: 8.4, ty: 10.6, scale: 1.2, solid: [52, 20, 5] },
      { tex: 'bench', tx: 14, ty: 10.5, scale: 1.2, solid: [52, 20, 5] },
      // Lamps at plaza corners
      { tex: 'streetlamp', tx: 5.6, ty: 5.6, scale: 1.35, solid: [16, 14, 20] },
      { tex: 'streetlamp', tx: 16.4, ty: 5.6, scale: 1.35, solid: [16, 14, 20] },
      { tex: 'streetlamp', tx: 5.6, ty: 11.2, scale: 1.35, solid: [16, 14, 20] },
      { tex: 'streetlamp', tx: 16.4, ty: 11.2, scale: 1.35, solid: [16, 14, 20] },
      // Shop / cafe clutter
      { tex: 'barrel', tx: 6.6, ty: 5.1, scale: 1.2, solid: [28, 24, 4] },
      { tex: 'barrel', tx: 7.4, ty: 5.3, scale: 1.1, solid: [26, 22, 4] },
      { tex: 'crate', tx: 15.4, ty: 5.1, scale: 1.15, solid: [32, 24, 4] },
      { tex: 'crate', tx: 16.2, ty: 5.35, scale: 1.05, solid: [30, 22, 4] },
      { tex: 'barrel', tx: 15.2, ty: 12.6, scale: 1.15, solid: [28, 24, 4] },
      { tex: 'crate', tx: 18.2, ty: 11.6, scale: 1.1, solid: [30, 22, 4] },
      { tex: 'mailbox', tx: 12.6, ty: 5.15, scale: 1.2, solid: [22, 18, 6] },
      { tex: 'signpost', tx: 9.4, ty: 12.2, scale: 1.15, solid: [18, 14, 8] },
      { tex: 'signpost', tx: 12.6, ty: 12.2, scale: 1.15, solid: [18, 14, 8] },
      { tex: 'fence', tx: 2.4, ty: 4.2, scale: 1.2, solid: [54, 16, 3] },
      { tex: 'fence', tx: 19.4, ty: 4.2, scale: 1.2, solid: [54, 16, 3] },
      { tex: 'rock', tx: 3.2, ty: 13.5, scale: 1.15, solid: [28, 18, 5] },
      { tex: 'rock', tx: 19, ty: 14, scale: 1.15, solid: [28, 18, 5] },
      { tex: 'stump', tx: 2.6, ty: 9.5, scale: 1.15, solid: [28, 18, 4] },
    ];

    this.decoSolids = [];
    for (const spot of [...trees, ...bushes, ...flowers, ...hardscape]) {
      const img = this.add.image(spot.tx * TILE, spot.ty * TILE, spot.tex).setScale(spot.scale ?? 1.4);
      img.setDepth(img.y + img.displayHeight / 2);
      if (spot.solid) {
        const [sw, sh, oy = 0] = spot.solid;
        this.decoSolids.push({ x: spot.tx * TILE, y: spot.ty * TILE + oy, w: sw, h: sh });
      }
    }
  }

  private buildColliders() {
    const solids: Phaser.GameObjects.Rectangle[] = [];
    const addSolid = (x: number, y: number, w: number, h: number) => {
      const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
      this.physics.add.existing(r, true);
      solids.push(r);
    };
    addSolid(HOUSE_POS.tx * TILE, (HOUSE_POS.ty + 0.2) * TILE, 128, 72);
    addSolid(SHOP_POS.tx * TILE, (SHOP_POS.ty + 0.2) * TILE, 128, 72);
    addSolid(CAFE_POS.tx * TILE, (CAFE_POS.ty + 0.2) * TILE, 128, 72);
    addSolid(ARCADE_POS.tx * TILE, ARCADE_POS.ty * TILE, 56, 36);
    for (const s of this.decoSolids) addSolid(s.x, s.y, s.w, s.h);
    this.physics.add.collider(this.player, solids);
  }

  private closeMenu() {
    this.menuOpen = false;
    this.ignoreClicksUntil = this.time.now + 250;
  }



  private openPetMenu() {
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
        emptyHint: 'no food — visit shop!',
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

  private nearestInteractable(): Interactable | null {
    let best: Interactable | null = null;
    let bestDist = Infinity;
    for (const it of this.interactables) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, it.x, it.y);
      if (d < it.radius && d < bestDist) {
        best = it;
        bestDist = d;
      }
    }
    // Moving NPCs — use live positions.
    const allNpcs: WandererNpc[] = [...this.npcs, ...this.miniteens.list()];
    for (const npc of allNpcs) {
      if (!npc.canInteract()) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.sprite.x, npc.sprite.y);
      if (d < 55 && d < bestDist) {
        best = {
          x: npc.sprite.x,
          y: npc.sprite.y,
          radius: 55,
          label: `E / click — Talk to ${npc.name}`,
          action: () => {
            this.menuOpen = true;
            npc.talk({
              onClose: () => this.closeMenu(),
              keepMenuOpen: () => {
                this.menuOpen = true;
              },
              onAccessoriesChanged: () => {
                this.pet.refreshAccessories();
                this.hud.refresh();
              },
            });
          },
          targets: [npc.sprite],
        };
        bestDist = d;
      }
    }
    return best;
  }

  // Outline glow on whatever the player can currently interact with.
  private setHighlight(targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[]) {
    const next = targets ?? [];
    if (next[0] === this.glowed[0] && next.length === this.glowed.length) return;
    for (const o of this.glowed) o.postFX?.clear();
    this.glowed = next;
    for (const o of this.glowed) o.postFX?.addGlow(0xffe066, 4);
  }

  update() {
    if (!this.player) return;

    const speed = 220;
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

    // Priority: keyboard > joystick > click/hold-to-move.
    const j = this.joystick.vec;
    if (vx !== 0 || vy !== 0) {
      this.clickMove.clear();
    } else if (!uiOpen && (Math.abs(j.x) > 0.18 || Math.abs(j.y) > 0.18)) {
      this.clickMove.clear();
      vx = j.x * speed;
      vy = j.y * speed;
    } else if (!uiOpen) {
      // Holding the pointer down keeps steering toward it as it moves.
      const ap = this.input.activePointer;
      if (this.pointerHeld && ap.isDown && !this.joystick.active) {
        // LoL-style held move: re-derive the world point under the pointer
        // every frame — worldX/Y go stale as the camera scrolls while the
        // pointer sits still, which made the player drift in the swipe
        // direction instead of walking to the held spot.
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
    for (const npc of this.npcs) npc.update();
    this.miniteens.update();

    if (!this.menuOpen) {
      const best = this.nearestInteractable();
      this.setHighlight(best?.targets);
      if (best) {
        this.prompt.show(best.label);
        if (Phaser.Input.Keyboard.JustDown(this.keyE)) best.action();
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
      // Respect the brief suppress window so ESC closing a dialogue does not
      // immediately open the shell menu. The React shell owns the game menu.
      requestLeave();
    }
  }
}
