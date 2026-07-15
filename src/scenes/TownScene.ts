import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State, WELCOME_KEY } from '../systems/GameState';
import { bottomButtons, HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { ClickMove } from '../systems/ClickMove';
import { characterDepth, propDepth } from '../systems/depth';
import { isInteractSuppressed, isUiBlocked, requestLeave } from '../systems/nav';
import { Joystick } from '../systems/Joystick';
import { attachCameraZoom, type CameraZoom } from '../systems/cameraZoom';
import { BongbongeeNpc } from '../systems/BongbongeeNpc';
import { MiniteenRoster } from '../systems/MiniteenRoster';
import type { WandererNpc } from '../systems/WandererNpc';
import { clothesPetMenuOption } from '../systems/petClothesMenu';
import { feedPetMenuOption } from '../systems/petFeedMenu';
import { openInventoryMenu as showInventoryMenu } from '../systems/inventoryMenu';
import { TILE, TOWN_MAP_H, TOWN_MAP_W, TOWN_WORLD_H, TOWN_WORLD_W } from '../systems/townMap';
import { rememberBongbongee, rememberMiniteens, takeBongbongeeSnap } from '../systems/townPresence';
import { updateInteractionHighlight } from '../systems/interactionHighlight';
import { addWorldBezel } from '../systems/worldBezel';

/** Compact town — smaller than the old 32×24 crossroads map. */
const MAP_W = TOWN_MAP_W;
const MAP_H = TOWN_MAP_H;
const WORLD_W = TOWN_WORLD_W;
const WORLD_H = TOWN_WORLD_H;

/** Must stand this close to a building door to enter. */
const BUILDING_RADIUS = 72;
const BUILDING_CLICK_NEAR = 90;

/** Building anchors (tile coords) — clustered around the central square. */
const HOUSE_POS = { tx: 11, ty: 3.15 };
const SHOP_POS = { tx: 17.2, ty: 3.5 };
const CAFE_POS = { tx: 4.8, ty: 3.5 };
const FOUNTAIN_POS = { tx: 11, ty: 8.4 };

/** East/west game-park exits — path rows leading off both map edges. */
const PARK_GATE_TY = [8, 9] as const;

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
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyP!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private hud!: HUD;
  private prompt!: Prompt;
  private interactables: Interactable[] = [];
  private menuOpen = false;
  private facing: 'up' | 'down' | 'side' = 'down';
  private clickMove!: ClickMove;
  private joystick!: Joystick;
  private cameraZoom!: CameraZoom;
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

  create(data: { spawn?: 'house' | 'shop' | 'cafe' | 'shore' | 'east' | 'west' }) {
    generateTextures(this);
    this.interactables = [];
    this.menuOpen = false;
    this.ignoreClicksUntil = 0;

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    this.buildMap();
    const worldBounds = { x: 0, y: 0, width: WORLD_W, height: WORLD_H };
    addWorldBezel(this, worldBounds);

    // Spawn just outside the door, facing away from the building.
    let sx = FOUNTAIN_POS.tx * TILE;
    let sy = (FOUNTAIN_POS.ty + 2.2) * TILE;
    if (data?.spawn === 'house') {
      sx = HOUSE_POS.tx * TILE;
      sy = (HOUSE_POS.ty + 2.4) * TILE;
    } else if (data?.spawn === 'west') {
      sx = 1.6 * TILE;
      sy = (PARK_GATE_TY[0] + 1) * TILE;
    } else if (data?.spawn === 'east') {
      sx = (MAP_W - 1.6) * TILE;
      sy = (PARK_GATE_TY[0] + 1) * TILE;
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
    this.facing = 'down';

    this.pet = new Pet(this, sx - 30, sy + 10, worldBounds);
    // Tap/click your pet to hear what's on its mind.
    this.pet.sprite.setInteractive({ useHandCursor: true });
    this.pet.sprite.on('pointerdown', () => {
      this.ignoreClicksUntil = this.time.now + 200;
      if (!this.menuOpen && !isUiBlocked()) this.pet.speak();
    });

    // Bongbongee wanders the square; Cinnamoroll is inside Cafe Cinnamon.
    const bong = new BongbongeeNpc(this, [
      { x: 7.5 * TILE, y: 9.5 * TILE },
      { x: 14 * TILE, y: 7.2 * TILE },
      { x: 18 * TILE, y: 10 * TILE },
      { x: 8.5 * TILE, y: 12 * TILE },
      { x: 14.5 * TILE, y: 11.5 * TILE },
    ]);
    const bongSaved = takeBongbongeeSnap();
    if (bongSaved) bong.sprite.setPosition(bongSaved.x, bongSaved.y);
    this.npcs = [bong];
    // Only a few MINITEEN on the map at a time; they rotate in/out.
    // Roster restores prior positions when returning from a building.
    this.miniteens = new MiniteenRoster(this);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.buildColliders();

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyI = kb.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyP = kb.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      rememberBongbongee(bong);
      rememberMiniteens(this.miniteens.list());
    });

    this.hud = new HUD(this);
    this.prompt = new Prompt(this);
    this.clickMove = new ClickMove(this);
    this.joystick = new Joystick(this);
    this.pointerHeld = false;

    // Always-reachable player inventory and pet care. (The game menu lives on the shell's
    // single top-bar Menu button — no duplicate button here.)
    bottomButtons(
      this,
      [
        { label: '[ Inventory · I ]', onTap: () => { if (!this.menuOpen) this.openInventory(); } },
        { label: '[ Pet · P ]', onTap: () => { if (!this.menuOpen) this.openPetMenu(); } },
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

    // Club Penguin-style: click ground to walk; click a nearby interactable to use it.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.menuOpen || this.time.now < this.ignoreClicksUntil || pointer.button !== 0) return;
      if (this.joystick.owns(pointer) || this.cameraZoom.ownsPointer(pointer)) return;
      if (this.cameraZoom.isPinching()) return;
      // Clicking anywhere on the house enters it when near; otherwise walk
      // to the door instead of into the walls.
      if (this.houseImg.getBounds().contains(pointer.worldX, pointer.worldY)) {
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          HOUSE_POS.tx * TILE,
          (HOUSE_POS.ty + 0.15) * TILE,
        );
        if (d < BUILDING_CLICK_NEAR) {
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
        if (d < BUILDING_CLICK_NEAR) {
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
        if (d < BUILDING_CLICK_NEAR) {
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

    // Central smooth stone town square
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
    // East/west paths out to the two game parks.
    for (const ty of PARK_GATE_TY) {
      for (let tx = 0; tx < 5; tx++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      }
      for (let tx = 17; tx < MAP_W; tx++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      }
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
    house.setDepth(propDepth(house, (HOUSE_POS.ty + 0.2) * TILE));
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
      radius: BUILDING_RADIUS,
      label: 'E / Space / click — Enter house',
      action: () => this.scene.start('House'),
      targets: [house],
    });

    // Daniel's shop — NE of the square (chimney puffs soft smoke).
    const shop = this.add.image(SHOP_POS.tx * TILE, SHOP_POS.ty * TILE, 'shop').setScale(1.85);
    shop.setDepth(propDepth(shop, (SHOP_POS.ty + 0.2) * TILE));
    this.shopImg = shop;
    this.startShopChimneySmoke(shop);
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
      radius: BUILDING_RADIUS,
      label: "E / Space / click — Enter Daniel's Shop",
      action: () => this.scene.start('Shop'),
      targets: [shop],
    });

    // Cafe Cinnamon — NW of the square
    const cafe = this.add.image(CAFE_POS.tx * TILE, CAFE_POS.ty * TILE, 'cafe').setScale(1.85);
    cafe.setDepth(propDepth(cafe, (CAFE_POS.ty + 0.2) * TILE));
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
      radius: BUILDING_RADIUS,
      label: 'E / Space / click — Enter Cafe Cinnamon',
      action: () => this.scene.start('ClothesShop'),
      targets: [cafe],
    });

    // Gate signs — parks east/west, shore south.
    const gateSigns: { tx: number; ty: number; label: string }[] = [
      { tx: 1.4, ty: 7, label: '← West Green' },
      { tx: 20.6, ty: 7, label: 'East Green →' },
      { tx: 12.6, ty: 13.2, label: 'The Shore ↓' },
    ];
    for (const g of gateSigns) {
      const sign = this.add.image(g.tx * TILE, g.ty * TILE, 'signpost').setScale(1.3);
      sign.setDepth(propDepth(sign, g.ty * TILE + 10));
      this.add
        .text(g.tx * TILE, g.ty * TILE - 34, g.label, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffe066',
          stroke: '#1a1a2e',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(900);
    }

    this.scatterTownDecor();
    // Solids after scatterTownDecor — it resets decoSolids.
    for (const g of gateSigns) {
      this.decoSolids.push({ x: g.tx * TILE, y: g.ty * TILE + 10, w: 18, h: 12 });
    }
  }

  /**
   * Light outdoor décor — fountain landmark, a few benches/lamps, grass flowers.
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
      { tex: 'tree', tx: 1.4, ty: 2.2, scale: 1.35, solid: [36, 28, 18] },
      { tex: 'tree', tx: 20.4, ty: 2.2, scale: 1.35, solid: [36, 28, 18] },
      { tex: 'tree', tx: 1.5, ty: 14, scale: 1.3, solid: [34, 26, 16] },
      { tex: 'tree', tx: 20.3, ty: 14, scale: 1.3, solid: [34, 26, 16] },
    ];

    const bushes: Spot[] = [
      { tex: 'bush', tx: 7.4, ty: 3.3, scale: 1.1, solid: [26, 16, 6] },
      { tex: 'bush', tx: 14.4, ty: 3.2, scale: 1.1, solid: [26, 16, 6] },
      { tex: 'bush', tx: 2.6, ty: 12.8, scale: 1.1, solid: [26, 16, 6] },
      { tex: 'bush', tx: 19.2, ty: 12.8, scale: 1.1, solid: [26, 16, 6] },
    ];

    // Flowers only on grass (outside the plaza band x5–16 / y5–11).
    const flowers: Spot[] = [
      { tex: 'wildflower', tx: 3.2, ty: 3.8, scale: 1.2 },
      { tex: 'wildflower', tx: 18.8, ty: 3.6, scale: 1.2 },
      { tex: 'wildflower', tx: 2.8, ty: 13.6, scale: 1.15 },
      { tex: 'wildflower', tx: 19, ty: 13.5, scale: 1.15 },
      { tex: 'wildflower', tx: 8.5, ty: 1.8, scale: 1.15 },
      { tex: 'wildflower', tx: 13.5, ty: 1.7, scale: 1.15 },
    ];

    const hardscape: Spot[] = [
      { tex: 'fountain', tx: FOUNTAIN_POS.tx, ty: FOUNTAIN_POS.ty, scale: 1.7, solid: [52, 38, 10] },
      { tex: 'bench', tx: 8.2, ty: 7.4, scale: 1.15, solid: [52, 20, 5] },
      { tex: 'bench', tx: 13.8, ty: 7.3, scale: 1.15, solid: [52, 20, 5] },
      { tex: 'streetlamp', tx: 5.8, ty: 6.2, scale: 1.3, solid: [16, 14, 20] },
      { tex: 'streetlamp', tx: 16.2, ty: 6.2, scale: 1.3, solid: [16, 14, 20] },
      { tex: 'barrel', tx: 6.5, ty: 5.15, scale: 1.15, solid: [28, 24, 4] },
      { tex: 'crate', tx: 15.6, ty: 5.15, scale: 1.1, solid: [32, 24, 4] },
      { tex: 'mailbox', tx: 12.5, ty: 5.15, scale: 1.15, solid: [22, 18, 6] },
    ];

    this.decoSolids = [];
    for (const spot of [...trees, ...bushes, ...flowers, ...hardscape]) {
      const isFountain = spot.tex === 'fountain';
      const img = isFountain
        ? this.add.sprite(spot.tx * TILE, spot.ty * TILE, spot.tex).setScale(spot.scale ?? 1.4)
        : this.add.image(spot.tx * TILE, spot.ty * TILE, spot.tex).setScale(spot.scale ?? 1.4);
      // Always pass a ground Y. Flowers have no collider — without this,
      // padded sprite feet sort south of characters standing in front of them.
      const footY = spot.solid
        ? spot.ty * TILE + (spot.solid[2] ?? 0)
        : spot.ty * TILE;
      img.setDepth(propDepth(img, footY));
      if (isFountain && img instanceof Phaser.GameObjects.Sprite) {
        if (this.anims.exists('fountain-splash')) img.play('fountain-splash');
        this.startFountainRipples(spot.tx * TILE, spot.ty * TILE, footY);
      }
      if (spot.solid) {
        const [sw, sh, oy = 0] = spot.solid;
        this.decoSolids.push({ x: spot.tx * TILE, y: spot.ty * TILE + oy, w: sw, h: sh });
      }
    }
  }

  /** Soft smoke rising from Daniel’s shop chimney. */
  private startShopChimneySmoke(shop: Phaser.GameObjects.Image) {
    if (!this.textures.exists('smoke')) return;
    const chimneyX = shop.x - shop.displayWidth * 0.22;
    const chimneyY = shop.y - shop.displayHeight * 0.48;
    const depth = propDepth(shop, (SHOP_POS.ty + 0.2) * TILE) + 2;

    const puff = () => {
      if (!this.sys.isActive()) return;
      const s = this.add
        .image(chimneyX + Phaser.Math.Between(-3, 3), chimneyY, 'smoke')
        .setScale(0.55)
        .setAlpha(0.55)
        .setDepth(depth);
      this.tweens.add({
        targets: s,
        y: chimneyY - Phaser.Math.Between(28, 44),
        x: chimneyX + Phaser.Math.Between(-10, 14),
        alpha: 0,
        scale: 1.15,
        duration: Phaser.Math.Between(1600, 2400),
        ease: 'Sine.easeOut',
        onComplete: () => s.destroy(),
      });
    };

    puff();
    this.time.addEvent({ delay: 700, loop: true, callback: puff });
  }

  /** Occasional water ripples above the plaza fountain. */
  private startFountainRipples(fx: number, fy: number, footY: number) {
    if (!this.textures.exists('ripple')) return;
    const depth = footY + 1;
    const splash = () => {
      if (!this.sys.isActive()) return;
      const r = this.add
        .image(fx + Phaser.Math.Between(-6, 6), fy - 10, 'ripple')
        .setScale(0.45)
        .setAlpha(0.65)
        .setDepth(depth);
      this.tweens.add({
        targets: r,
        scale: 1.05,
        alpha: 0,
        y: fy - 18,
        duration: 900,
        ease: 'Quad.easeOut',
        onComplete: () => r.destroy(),
      });
    };
    splash();
    this.time.addEvent({
      delay: Phaser.Math.Between(1400, 2200),
      loop: true,
      callback: splash,
    });
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
          label: `E / Space / click — Talk to ${npc.name}`,
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

  // Lightweight tint on whatever the player can currently interact with.
  private setHighlight(targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[]) {
    this.glowed = updateInteractionHighlight(this.glowed, targets);
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
    this.player.setDepth(characterDepth(this.player));
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.pet.update(this.player.x, this.player.y, body.velocity.x, body.velocity.y);
    for (const npc of this.npcs) npc.update();
    this.miniteens.update();

    // Walk off the south path → shore (no interact prompt needed).
    if (
      !uiOpen &&
      this.player.y > WORLD_H - 52 &&
      this.player.x > 8.5 * TILE &&
      this.player.x < 13.5 * TILE
    ) {
      this.scene.start('Shore', { spawn: 'town' });
      return;
    }

    // Walk off the east/west paths → the game parks.
    const onGateBand =
      this.player.y > PARK_GATE_TY[0] * TILE && this.player.y < (PARK_GATE_TY[1] + 1) * TILE;
    if (!uiOpen && onGateBand) {
      if (this.player.x < 36) {
        this.scene.start('WestPark', { spawn: 'town' });
        return;
      }
      if (this.player.x > WORLD_W - 36) {
        this.scene.start('EastPark', { spawn: 'town' });
        return;
      }
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

    if (!uiOpen) {
      const best = this.nearestInteractable();
      this.setHighlight(best?.targets);
      if (best) {
        this.prompt.show(best.label);
        if (
          !isInteractSuppressed() &&
          (Phaser.Input.Keyboard.JustDown(this.keyE) ||
            Phaser.Input.Keyboard.JustDown(this.keySpace))
        ) {
          best.action();
        }
      } else {
        this.prompt.hide();
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
