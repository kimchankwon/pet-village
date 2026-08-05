import Phaser from 'phaser';
import { worldSceneSpawn } from '@pet-village/multiplayer-protocol';
import { configurePlayerPenguin, generateTextures, penguinDepthTarget } from '../sprites/pixelart';
import { State, WELCOME_KEY } from '../systems/GameState';
import { bottomButtons, HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { ClickMove } from '../systems/ClickMove';
import { characterDepth, propDepth } from '../systems/depth';
import { isInteractSuppressed, isPointerUiBlocked, isUiBlocked, requestLeave } from '../systems/nav';
import { Joystick } from '../systems/Joystick';
import { attachCameraZoom, type CameraZoom } from '../systems/cameraZoom';
import { BongbongeeNpc } from '../systems/BongbongeeNpc';
import { MiniteenRoster } from '../systems/MiniteenRoster';
import type { WandererNpc } from '../systems/WandererNpc';
import { clothesPetMenuOption } from '../systems/petClothesMenu';
import { feedPetMenuOption } from '../systems/petFeedMenu';
import { openInventoryMenu as showInventoryMenu } from '../systems/inventoryMenu';
import {
  BUILDING_DISPLAY_H,
  FOUNTAIN_DISPLAY_H,
  LAMP_DISPLAY_H,
  placeGroundTile,
  PROP_DISPLAY_H,
  scalePropToHeight,
  SIGN_DISPLAY_H,
  TILE,
  TOWN_MAP_H,
  TOWN_MAP_W,
  TOWN_WORLD_H,
  TOWN_WORLD_W,
  TREE_DISPLAY_H,
} from '../systems/townMap';
import { initialTownPosition } from '../systems/townPosition';
import { updateInteractionHighlight } from '../systems/interactionHighlight';
import { addWorldBezel } from '../systems/worldBezel';
import { applyPenguinMotion, movementFacing, penguinTextureKey, type MovementFacing } from '../systems/movementFacing';
import { multiplayerBridge, type RemoteNpc } from '../systems/multiplayerBridge';
import { partitionTownNpcSnapshot } from '../systems/networkNpcMotion';
import { WorldMultiplayer } from '../systems/worldMultiplayer';

/** Expanded ice town — Club Penguin square + Dream Land winter whimsy. */
const MAP_W = TOWN_MAP_W;
const MAP_H = TOWN_MAP_H;
const WORLD_W = TOWN_WORLD_W;
const WORLD_H = TOWN_WORLD_H;

/** Must stand this close to a building door to enter (scaled with big buildings). */
const BUILDING_RADIUS = 120;
const BUILDING_CLICK_NEAR = 160;

/** Building anchors (tile coords) — north of the ice plaza with room for large sprites. */
const HOUSE_POS = { tx: 16, ty: 4.6 };
const SHOP_POS = { tx: 26, ty: 5.0 };
const CAFE_POS = { tx: 6, ty: 5.0 };
const FOUNTAIN_POS = { tx: 16, ty: 11.5 };

/** East/west game-park exits — ice path rows leading off both map edges. */
const PARK_GATE_TY = [10, 11] as const;

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
  private bongbongee!: BongbongeeNpc;
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
  private facing: MovementFacing = 'down';
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
  private worldMultiplayer!: WorldMultiplayer;
  private unsubscribeNpcs?: () => void;
  private wasMoving = false;

  constructor() {
    super('Town');
  }

  create(data: { spawn?: 'house' | 'shop' | 'cafe' | 'shore' | 'east' | 'west' }) {
    generateTextures(this);
    this.interactables = [];
    this.menuOpen = false;
    this.wasMoving = false;
    this.ignoreClicksUntil = 0;

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    this.buildMap();
    const worldBounds = { x: 0, y: 0, width: WORLD_W, height: WORLD_H };
    addWorldBezel(this, worldBounds);

    // Restore the last durable Town pose only when the game host explicitly
    // marks this as a full application launch. Explicit entrances and
    // change-pet remounts must use their server-approved spawn.
    const restoreSavedPosition = this.registry.get('restoreTownPosition') === true;
    this.registry.set('restoreTownPosition', false);
    const restored = initialTownPosition(
      State.data.townPosition,
      data?.spawn !== undefined,
      restoreSavedPosition,
    );
    const approvedSpawn = worldSceneSpawn('town', data?.spawn);
    let sx = approvedSpawn.x;
    let sy = approvedSpawn.y;
    if (restored) {
      sx = restored.x;
      sy = restored.y;
    }

    const initialFacing = restored?.facing ?? 'down';
    const initialTexture = penguinTextureKey(initialFacing);
    this.player = this.physics.add.sprite(sx, sy, initialTexture, 0);
    this.player.setCollideWorldBounds(true);
    configurePlayerPenguin(this.player);
    this.facing = initialFacing;

    this.pet = new Pet(this, sx - 30, sy + 10, worldBounds);
    this.worldMultiplayer = new WorldMultiplayer(this, {
      sceneId: 'town',
      localPlayer: this.player,
      pet: this.pet,
      depthFor: characterDepth,
      cancelLocalMovement: () => {
        this.pointerHeld = false;
        this.clickMove?.clear();
        this.player.setVelocity(0, 0);
      },
      // Clicking a distant penguin walks you over there first.
      moveLocalTo: (x, y, quiet) => this.clickMove.setTarget(x, y, quiet),
      isLocalMoving: () => this.clickMove.target !== null,
    });
    // Tap/click your pet to hear what's on its mind.
    this.pet.sprite.setInteractive({ useHandCursor: true });
    this.pet.sprite.on('pointerdown', () => {
      this.ignoreClicksUntil = this.time.now + 200;
      if (!this.menuOpen && !isUiBlocked()) this.pet.speak();
    });

    // Town NPC movement and roster membership are authoritative server state.
    this.bongbongee = new BongbongeeNpc(this, [
      { x: 10 * TILE, y: 12.5 * TILE },
      { x: 20 * TILE, y: 9.5 * TILE },
      { x: 26 * TILE, y: 13 * TILE },
      { x: 11 * TILE, y: 16 * TILE },
      { x: 20 * TILE, y: 15.5 * TILE },
    ]);
    this.bongbongee.setServerControlled();
    this.bongbongee.setServerPresent(false);
    this.npcs = [this.bongbongee];
    this.miniteens = new MiniteenRoster(this);
    this.unsubscribeNpcs = multiplayerBridge.subscribeNpcs((rows) => this.syncNpcs(rows));

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
      State.rememberTownPosition({ x: this.player.x, y: this.player.y, facing: this.facing });
      State.persistTownPosition(true);
      this.unsubscribeNpcs?.();
      this.unsubscribeNpcs = undefined;
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
        { label: '[ Inventory · I ]', shortLabel: '[Inv]', onTap: () => { if (!this.menuOpen) this.openInventory(); } },
        { label: '[ Pet · P ]', shortLabel: '[Pet]', onTap: () => { if (!this.menuOpen) this.openPetMenu(); } },
        { label: '[ Chat · T ]', shortLabel: '[Chat]', onTap: () => { if (!this.menuOpen) this.worldMultiplayer.openChat(); } },
        { label: '[ Moves · N ]', shortLabel: '[Moves]', onTap: () => { if (!this.menuOpen) this.worldMultiplayer.openMovesMenu(); } },
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
      // Typing a message: a click must not walk off, open a menu or change scene.
      if (isPointerUiBlocked() || isUiBlocked() || isInteractSuppressed()) return;
      if (this.joystick.owns(pointer) || this.cameraZoom.ownsPointer(pointer)) return;
      if (this.cameraZoom.isPinching()) return;
      // Clicking anywhere on the house enters it when near; otherwise walk
      // to the door instead of into the walls.
      if (this.houseImg.getBounds().contains(pointer.worldX, pointer.worldY)) {
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          HOUSE_POS.tx * TILE,
          (HOUSE_POS.ty + 0.55) * TILE,
        );
        if (d < BUILDING_CLICK_NEAR) {
          this.clickMove.clear();
          this.scene.start('House');
        } else {
          this.clickMove.setTarget(HOUSE_POS.tx * TILE, (HOUSE_POS.ty + 2.8) * TILE);
        }
        return;
      }
      if (this.shopImg.getBounds().contains(pointer.worldX, pointer.worldY)) {
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          SHOP_POS.tx * TILE,
          (SHOP_POS.ty + 0.55) * TILE,
        );
        if (d < BUILDING_CLICK_NEAR) {
          this.clickMove.clear();
          this.scene.start('Shop');
        } else {
          this.clickMove.setTarget(SHOP_POS.tx * TILE, (SHOP_POS.ty + 2.8) * TILE);
        }
        return;
      }
      if (this.cafeImg.getBounds().contains(pointer.worldX, pointer.worldY)) {
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          CAFE_POS.tx * TILE,
          (CAFE_POS.ty + 0.55) * TILE,
        );
        if (d < BUILDING_CLICK_NEAR) {
          this.clickMove.clear();
          this.scene.start('ClothesShop');
        } else {
          this.clickMove.setTarget(CAFE_POS.tx * TILE, (CAFE_POS.ty + 2.8) * TILE);
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
    // Soft snow base — each cell fills TILE×TILE so ground never leaves gaps.
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const key = ty <= 1 ? 'tile-snow' : 'tile-grass';
        placeGroundTile(this, tx, ty, key, -100);
      }
    }

    // Large ice plaza — Club Penguin town-square feel.
    for (let ty = 8; ty <= 15; ty++) {
      for (let tx = 8; tx <= 24; tx++) {
        placeGroundTile(this, tx, ty, 'tile-plaza', -99);
      }
    }
    // Inner sparkle ring around the fountain (deeper ice blue).
    for (let ty = 10; ty <= 13; ty++) {
      for (let tx = 14; tx <= 18; tx++) {
        placeGroundTile(this, tx, ty, 'tile-path', -98);
      }
    }

    // South ice road → Shore.
    for (let ty = 16; ty < MAP_H; ty++) {
      for (const tx of [15, 16, 17]) {
        placeGroundTile(this, tx, ty, 'tile-path', -99);
      }
    }
    // East/west ice roads → game parks.
    for (const ty of PARK_GATE_TY) {
      for (let tx = 0; tx < MAP_W; tx++) {
        placeGroundTile(this, tx, ty, 'tile-path', -99);
      }
    }
    // Paths up to each building front.
    for (const band of [
      { txs: [5, 6, 7], tys: [6, 7] },
      { txs: [15, 16, 17], tys: [6, 7] },
      { txs: [25, 26, 27], tys: [6, 7] },
    ]) {
      for (const tx of band.txs) {
        for (const ty of band.tys) {
          placeGroundTile(this, tx, ty, 'tile-path', -99);
        }
      }
    }

    // Player's house — north of the ice plaza (large Imagine sprite).
    const house = this.add.image(HOUSE_POS.tx * TILE, HOUSE_POS.ty * TILE, 'house');
    scalePropToHeight(house, BUILDING_DISPLAY_H);
    house.setDepth(propDepth(house, (HOUSE_POS.ty + 0.55) * TILE));
    this.houseImg = house;
    this.add
      .text(HOUSE_POS.tx * TILE, HOUSE_POS.ty * TILE - house.displayHeight / 2 - 12, 'My House', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: HOUSE_POS.tx * TILE,
      y: (HOUSE_POS.ty + 0.55) * TILE,
      radius: BUILDING_RADIUS,
      label: 'E / Space / click — Enter house',
      action: () => this.scene.start('House'),
      targets: [house],
    });

    // Daniel's shop — NE of the plaza (chimney puffs soft smoke).
    const shop = this.add.image(SHOP_POS.tx * TILE, SHOP_POS.ty * TILE, 'shop');
    scalePropToHeight(shop, BUILDING_DISPLAY_H);
    shop.setDepth(propDepth(shop, (SHOP_POS.ty + 0.55) * TILE));
    this.shopImg = shop;
    this.startShopChimneySmoke(shop);
    this.add
      .text(SHOP_POS.tx * TILE, SHOP_POS.ty * TILE - shop.displayHeight / 2 - 12, "Daniel's Shop", {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: SHOP_POS.tx * TILE,
      y: (SHOP_POS.ty + 0.55) * TILE,
      radius: BUILDING_RADIUS,
      label: "E / Space / click — Enter Daniel's Shop",
      action: () => this.scene.start('Shop'),
      targets: [shop],
    });

    // Cafe Cinnamon — NW of the plaza.
    const cafe = this.add.image(CAFE_POS.tx * TILE, CAFE_POS.ty * TILE, 'cafe');
    scalePropToHeight(cafe, BUILDING_DISPLAY_H);
    cafe.setDepth(propDepth(cafe, (CAFE_POS.ty + 0.55) * TILE));
    this.cafeImg = cafe;
    this.add
      .text(CAFE_POS.tx * TILE, CAFE_POS.ty * TILE - cafe.displayHeight / 2 - 12, 'Cafe Cinnamon', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffe6f2',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: CAFE_POS.tx * TILE,
      y: (CAFE_POS.ty + 0.55) * TILE,
      radius: BUILDING_RADIUS,
      label: 'E / Space / click — Enter Cafe Cinnamon',
      action: () => this.scene.start('ClothesShop'),
      targets: [cafe],
    });

    // Gate signs — parks east/west, shore south.
    const gateSigns: { tx: number; ty: number; label: string }[] = [
      { tx: 1.6, ty: 9.2, label: '← West Green' },
      { tx: 30.4, ty: 9.2, label: 'East Green →' },
      { tx: 18.2, ty: 18.2, label: 'The Shore ↓' },
    ];
    for (const g of gateSigns) {
      const sign = this.add.image(g.tx * TILE, g.ty * TILE, 'signpost');
      scalePropToHeight(sign, SIGN_DISPLAY_H);
      sign.setDepth(propDepth(sign, g.ty * TILE + 14));
      this.add
        .text(g.tx * TILE, g.ty * TILE - sign.displayHeight / 2 - 10, g.label, {
          fontFamily: 'monospace',
          fontSize: '12px',
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
      this.decoSolids.push({ x: g.tx * TILE, y: g.ty * TILE + 14, w: 28, h: 18 });
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
      /** Target display height; defaults by texture kind. */
      displayH?: number;
      solid?: [number, number, number?];
    };

    const trees: Spot[] = [
      { tex: 'tree', tx: 1.8, ty: 2.4, displayH: TREE_DISPLAY_H, solid: [48, 36, 22] },
      { tex: 'tree', tx: 30.2, ty: 2.4, displayH: TREE_DISPLAY_H, solid: [48, 36, 22] },
      { tex: 'tree', tx: 2.2, ty: 18.5, displayH: TREE_DISPLAY_H * 0.95, solid: [46, 34, 20] },
      { tex: 'tree', tx: 29.8, ty: 18.5, displayH: TREE_DISPLAY_H * 0.95, solid: [46, 34, 20] },
      { tex: 'tree', tx: 10.2, ty: 1.9, displayH: TREE_DISPLAY_H * 0.9, solid: [44, 32, 18] },
      { tex: 'tree', tx: 22, ty: 1.9, displayH: TREE_DISPLAY_H * 0.9, solid: [44, 32, 18] },
    ];

    const bushes: Spot[] = [
      { tex: 'bush', tx: 10.5, ty: 6.8, displayH: PROP_DISPLAY_H * 0.85, solid: [40, 24, 8] },
      { tex: 'bush', tx: 21.5, ty: 6.7, displayH: PROP_DISPLAY_H * 0.85, solid: [40, 24, 8] },
      { tex: 'bush', tx: 3.4, ty: 16.8, displayH: PROP_DISPLAY_H * 0.85, solid: [40, 24, 8] },
      { tex: 'bush', tx: 28.6, ty: 16.8, displayH: PROP_DISPLAY_H * 0.85, solid: [40, 24, 8] },
      { tex: 'bush', tx: 12.2, ty: 19.2, displayH: PROP_DISPLAY_H * 0.8, solid: [36, 22, 6] },
      { tex: 'bush', tx: 19.8, ty: 19.2, displayH: PROP_DISPLAY_H * 0.8, solid: [36, 22, 6] },
    ];

    // Winter berries / wildflowers on snow (outside the ice plaza).
    const flowers: Spot[] = [
      { tex: 'wildflower', tx: 4.2, ty: 3.6, displayH: 48 },
      { tex: 'wildflower', tx: 27.8, ty: 3.5, displayH: 48 },
      { tex: 'wildflower', tx: 3.6, ty: 17.4, displayH: 46 },
      { tex: 'wildflower', tx: 28.4, ty: 17.3, displayH: 46 },
      { tex: 'wildflower', tx: 12.5, ty: 2.2, displayH: 46 },
      { tex: 'wildflower', tx: 19.5, ty: 2.1, displayH: 46 },
      { tex: 'mushroom', tx: 4.8, ty: 19.6, displayH: 52 },
      { tex: 'mushroom', tx: 27.2, ty: 19.5, displayH: 52 },
    ];

    const hardscape: Spot[] = [
      {
        tex: 'fountain',
        tx: FOUNTAIN_POS.tx,
        ty: FOUNTAIN_POS.ty,
        displayH: FOUNTAIN_DISPLAY_H,
        solid: [110, 70, 18],
      },
      { tex: 'bench', tx: 11.2, ty: 9.6, displayH: PROP_DISPLAY_H, solid: [90, 32, 8] },
      { tex: 'bench', tx: 20.8, ty: 9.5, displayH: PROP_DISPLAY_H, solid: [90, 32, 8] },
      { tex: 'bench', tx: 11.2, ty: 14.4, displayH: PROP_DISPLAY_H, solid: [90, 32, 8] },
      { tex: 'bench', tx: 20.8, ty: 14.3, displayH: PROP_DISPLAY_H, solid: [90, 32, 8] },
      { tex: 'streetlamp', tx: 8.4, ty: 8.4, displayH: LAMP_DISPLAY_H, solid: [22, 20, 28] },
      { tex: 'streetlamp', tx: 23.6, ty: 8.4, displayH: LAMP_DISPLAY_H, solid: [22, 20, 28] },
      { tex: 'streetlamp', tx: 8.4, ty: 14.8, displayH: LAMP_DISPLAY_H, solid: [22, 20, 28] },
      { tex: 'streetlamp', tx: 23.6, ty: 14.8, displayH: LAMP_DISPLAY_H, solid: [22, 20, 28] },
      { tex: 'barrel', tx: 9.2, ty: 7.2, displayH: PROP_DISPLAY_H * 0.85, solid: [40, 34, 6] },
      { tex: 'crate', tx: 22.8, ty: 7.2, displayH: PROP_DISPLAY_H * 0.85, solid: [44, 34, 6] },
      { tex: 'mailbox', tx: 18.4, ty: 7.1, displayH: PROP_DISPLAY_H * 0.9, solid: [32, 28, 8] },
      { tex: 'rock', tx: 3.2, ty: 13.6, displayH: PROP_DISPLAY_H * 0.85, solid: [40, 28, 6] },
      { tex: 'rock', tx: 28.8, ty: 13.5, displayH: PROP_DISPLAY_H * 0.85, solid: [40, 28, 6] },
      { tex: 'stump', tx: 5.5, ty: 20.2, displayH: 70, solid: [36, 22, 4] },
      { tex: 'stump', tx: 26.5, ty: 20.1, displayH: 70, solid: [36, 22, 4] },
    ];

    this.decoSolids = [];
    for (const spot of [...trees, ...bushes, ...flowers, ...hardscape]) {
      const isFountain = spot.tex === 'fountain';
      const img = isFountain
        ? this.add.sprite(spot.tx * TILE, spot.ty * TILE, spot.tex)
        : this.add.image(spot.tx * TILE, spot.ty * TILE, spot.tex);
      const displayH =
        spot.displayH ??
        (spot.tex === 'tree' ? TREE_DISPLAY_H : spot.tex === 'streetlamp' ? LAMP_DISPLAY_H : PROP_DISPLAY_H);
      scalePropToHeight(img, displayH);
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

  /**
   * Soft smoke rising from Daniel’s shop chimney.
   * Imagine shop art: brick chimney sits on the viewer’s-right roof peak
   * (~+22% width, ~−42% height from sprite center).
   */
  private startShopChimneySmoke(shop: Phaser.GameObjects.Image) {
    if (!this.textures.exists('smoke')) return;
    const chimneyX = shop.x + shop.displayWidth * 0.22;
    const chimneyY = shop.y - shop.displayHeight * 0.42;
    const depth = propDepth(shop, (SHOP_POS.ty + 0.55) * TILE) + 2;

    const puff = () => {
      if (!this.sys.isActive()) return;
      const s = this.add
        .image(chimneyX + Phaser.Math.Between(-2, 2), chimneyY, 'smoke')
        .setScale(0.55)
        .setAlpha(0.6)
        .setDepth(depth);
      this.tweens.add({
        targets: s,
        y: chimneyY - Phaser.Math.Between(32, 52),
        x: chimneyX + Phaser.Math.Between(-6, 12),
        alpha: 0,
        scale: 1.2,
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
    // Large Imagine buildings — wide base colliders under the snow-capped roofs.
    addSolid(HOUSE_POS.tx * TILE, (HOUSE_POS.ty + 0.55) * TILE, 210, 110);
    addSolid(SHOP_POS.tx * TILE, (SHOP_POS.ty + 0.55) * TILE, 220, 110);
    addSolid(CAFE_POS.tx * TILE, (CAFE_POS.ty + 0.55) * TILE, 210, 110);
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
        openParent: () => this.openPetMenu(),
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
      pet: this.pet,
      onFed: () => this.hud.refresh(),
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
    const remote = this.worldMultiplayer.getRemoteInteractable();
    if (remote) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, remote.x, remote.y);
      if (d < bestDist) best = remote;
    }
    return best;
  }

  // Lightweight tint on whatever the player can currently interact with.
  private setHighlight(targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[]) {
    this.glowed = updateInteractionHighlight(this.glowed, targets);
  }

  private syncNpcs(rows: RemoteNpc[]) {
    const { bongbongee, miniteens } = partitionTownNpcSnapshot(rows);
    if (bongbongee) this.bongbongee.setNetworkPose(bongbongee);
    else this.bongbongee.setServerPresent(false);
    this.miniteens.sync(miniteens);
  }

  update() {
    if (!this.player) return;

    this.worldMultiplayer.applyCorrection();

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
      this.facing = movementFacing(vx, vy, this.facing);
    }
    applyPenguinMotion(this.player, this.facing, vx, moving);
    // Sort by the feet, not the sprite box: the dance sheet is a different size.
    this.player.setDepth(characterDepth(penguinDepthTarget(this.player)));
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.pet.update(this.player.x, this.player.y, body.velocity.x, body.velocity.y);
    State.rememberTownPosition({ x: this.player.x, y: this.player.y, facing: this.facing });
    if (this.wasMoving && !moving) {
      this.time.delayedCall(100, () => State.persistTownPosition());
    }
    this.wasMoving = moving;
    this.worldMultiplayer.update(this.facing, moving, this.game.loop.delta);
    for (const npc of this.npcs) npc.update();
    this.miniteens.update();

    // Walk off the south ice road → shore (no interact prompt needed).
    if (
      !uiOpen &&
      this.player.y > WORLD_H - 52 &&
      this.player.x > 14.5 * TILE &&
      this.player.x < 17.5 * TILE
    ) {
      this.scene.start('Shore', { spawn: 'town' });
      return;
    }

    // Walk off the east/west ice roads → the game parks.
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
