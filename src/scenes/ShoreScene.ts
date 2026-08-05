import Phaser from 'phaser';
import { worldSceneSpawn } from '@pet-village/multiplayer-protocol';
import { configurePlayerPenguin, generateTextures, penguinDepthTarget } from '../sprites/pixelart';
import { State } from '../systems/GameState';
import { FISHING_ENERGY_PER_CAST, tooTiredMessage } from '../systems/gameEnergy';
import { bottomButtons, HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { ClickMove } from '../systems/ClickMove';
import { characterDepth, propDepth } from '../systems/depth';
import { isInteractSuppressed, isPointerUiBlocked, isUiBlocked, requestLeave } from '../systems/nav';
import { Joystick } from '../systems/Joystick';
import { attachCameraZoom, type CameraZoom } from '../systems/cameraZoom';
import { clothesPetMenuOption } from '../systems/petClothesMenu';
import { feedPetMenuOption } from '../systems/petFeedMenu';
import { openInventoryMenu as showInventoryMenu } from '../systems/inventoryMenu';
import {
  DOCK_DISPLAY_H,
  SHORE_DOCK,
  SHORE_MAP_H,
  SHORE_MAP_W,
  SHORE_OCEAN_ROW,
  SHORE_WORLD_H,
  SHORE_WORLD_W,
} from '../systems/shoreMap';
import {
  LAMP_DISPLAY_H,
  placeGroundTile,
  PROP_DISPLAY_H,
  scalePropToHeight,
  SIGN_DISPLAY_H,
  TILE,
  TREE_DISPLAY_H,
} from '../systems/townMap';
import { MiniteenNpc } from '../systems/miniteen';
import { updateInteractionHighlight } from '../systems/interactionHighlight';
import { applyPenguinMotion, movementFacing, penguinTextureKey, type MovementFacing } from '../systems/movementFacing';
import { npcDefsForScene, rememberSceneNpcs, takeSceneNpcSnaps } from '../systems/npcScenePresence';
import { addWorldBezel } from '../systems/worldBezel';
import { fishingBaitCount, hasFishingBait } from '../systems/fishingRules';
import { WorldMultiplayer } from '../systems/worldMultiplayer';

interface Interactable {
  x: number;
  y: number;
  radius: number;
  label: string;
  action: () => void;
  targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[];
}

/**
 * Outdoor coastal overworld — larger/scrollable, ocean along the south edge.
 * Reached from Town's south path; fishing spot on the dock starts FishingScene.
 */
export class ShoreScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private pet!: Pet;
  private npcs: MiniteenNpc[] = [];
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
  private pointerHeld = false;
  private glowed: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] = [];
  private ignoreClicksUntil = 0;
  private decoSolids: { x: number; y: number; w: number; h: number }[] = [];
  private oceanTiles: Phaser.GameObjects.Image[] = [];
  private dockImg!: Phaser.GameObjects.Image;
  private worldMultiplayer!: WorldMultiplayer;

  constructor() {
    super('Shore');
  }

  create(data: { spawn?: 'town' | 'fishing' }) {
    generateTextures(this);
    this.interactables = [];
    this.menuOpen = false;
    this.ignoreClicksUntil = 0;
    this.oceanTiles = [];
    this.npcs = [];

    this.physics.world.setBounds(0, 0, SHORE_WORLD_W, SHORE_WORLD_H);
    this.cameras.main.setBounds(0, 0, SHORE_WORLD_W, SHORE_WORLD_H);

    this.buildMap();
    const worldBounds = { x: 0, y: 0, width: SHORE_WORLD_W, height: SHORE_WORLD_H };
    addWorldBezel(this, worldBounds);

    // From town → top path; from fishing → near the dock.
    const spawn = worldSceneSpawn('shore', data?.spawn);
    const sx = spawn.x;
    const sy = spawn.y;

    this.player = this.physics.add.sprite(sx, sy, 'penguin-down', 0);
    this.player.setCollideWorldBounds(true);
    configurePlayerPenguin(this.player);

    this.pet = new Pet(this, sx - 30, sy + 10, worldBounds);
    this.pet.sprite.setInteractive({ useHandCursor: true });
    this.pet.sprite.on('pointerdown', () => {
      this.ignoreClicksUntil = this.time.now + 200;
      if (!this.menuOpen && !isUiBlocked()) this.pet.speak();
    });

    const shoreWaypoints = [
      [
        { x: 4 * TILE, y: 4.5 * TILE },
        { x: 6 * TILE, y: 6 * TILE },
        { x: 3.5 * TILE, y: 5.5 * TILE },
      ],
      [
        { x: 13 * TILE, y: 4.2 * TILE },
        { x: 15 * TILE, y: 5.8 * TILE },
        { x: 14 * TILE, y: 6.2 * TILE },
      ],
    ];
    const savedNpcs = takeSceneNpcSnaps('shore');
    this.npcs = npcDefsForScene('shore').map((def, index) => {
      const npc = new MiniteenNpc(this, def, index, shoreWaypoints[index] ?? shoreWaypoints[0]);
      const saved = savedNpcs.find((snap) => snap.id === def.id);
      if (saved) npc.sprite.setPosition(saved.x, saved.y);
      return npc;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      rememberSceneNpcs('shore', this.npcs);
    });

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

    this.hud = new HUD(this);
    this.prompt = new Prompt(this);
    this.clickMove = new ClickMove(this);
    this.joystick = new Joystick(this);
    this.pointerHeld = false;
    this.worldMultiplayer = new WorldMultiplayer(this, {
      sceneId: 'shore',
      localPlayer: this.player,
      pet: this.pet,
      depthFor: characterDepth,
      cancelLocalMovement: () => {
        this.pointerHeld = false;
        this.clickMove.clear();
        this.player.setVelocity(0, 0);
      },
      // Clicking a distant penguin walks you over there first.
      moveLocalTo: (x, y, quiet) => this.clickMove.setTarget(x, y, quiet),
      isLocalMoving: () => this.clickMove.target !== null,
    });

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

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.menuOpen || this.time.now < this.ignoreClicksUntil || pointer.button !== 0) return;
      // Typing a message: a click must not walk off, open a menu or change scene.
      if (isPointerUiBlocked()) return;
      if (this.joystick.owns(pointer) || this.cameraZoom.ownsPointer(pointer)) return;
      if (this.cameraZoom.isPinching()) return;
      if (this.dockImg.getBounds().contains(pointer.worldX, pointer.worldY)) {
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          SHORE_DOCK.tx * TILE,
          SHORE_DOCK.ty * TILE,
        );
        if (d < 140) {
          this.clickMove.clear();
          this.goFishing();
        } else {
          this.clickMove.setTarget(SHORE_DOCK.tx * TILE, (SHORE_DOCK.ty - 0.8) * TILE);
        }
        return;
      }
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

    // Gentle ocean shimmer — swap between two water tiles.
    this.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => {
        for (const img of this.oceanTiles) {
          img.setTexture(img.texture.key === 'tile-ocean' ? 'tile-ocean2' : 'tile-ocean');
        }
      },
    });

    if (data?.spawn !== 'fishing') {
      toast(this, sx, sy - 50, 'The shore!', '#a8e6cf');
    }
  }

  private buildMap() {
    for (let ty = 0; ty < SHORE_MAP_H; ty++) {
      for (let tx = 0; tx < SHORE_MAP_W; tx++) {
        let key = 'tile-grass';
        if (ty >= SHORE_OCEAN_ROW) key = 'tile-ocean';
        else if (ty >= SHORE_OCEAN_ROW - 2) key = 'tile-sand';
        const img = placeGroundTile(this, tx, ty, key, -100);
        if (key === 'tile-ocean') this.oceanTiles.push(img as Phaser.GameObjects.Image);
      }
    }

    // Wide ice path from town (north) down to the dock.
    for (let ty = 0; ty <= SHORE_OCEAN_ROW - 2; ty++) {
      for (const tx of [11, 12, 13]) {
        placeGroundTile(this, tx, ty, 'tile-path', -99);
      }
    }
    for (let tx = 9; tx <= 15; tx++) {
      placeGroundTile(this, tx, SHORE_OCEAN_ROW - 2, 'tile-path', -99);
    }

    this.dockImg = this.add.image(SHORE_DOCK.tx * TILE, SHORE_DOCK.ty * TILE, 'dock');
    scalePropToHeight(this.dockImg, DOCK_DISPLAY_H);
    this.dockImg.setDepth(propDepth(this.dockImg, SHORE_DOCK.ty * TILE + 10));
    this.add
      .text(SHORE_DOCK.tx * TILE, SHORE_DOCK.ty * TILE - this.dockImg.displayHeight / 2 - 12, 'Fishing dock', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);

    this.interactables.push({
      x: SHORE_DOCK.tx * TILE,
      y: SHORE_DOCK.ty * TILE,
      radius: 120,
      label: `E / click — Go fishing · bait ${fishingBaitCount(State.data.inventory)}`,
      action: () => this.goFishing(),
      targets: [this.dockImg],
    });

    // North edge auto-returns to town (no interactable — walk off the path).
    const townSignTx = 14.2;
    const townSignTy = 1.8;
    const townSign = this.add.image(townSignTx * TILE, townSignTy * TILE, 'signpost');
    scalePropToHeight(townSign, SIGN_DISPLAY_H);
    townSign.setDepth(propDepth(townSign, townSignTy * TILE + 12));
    this.add
      .text(townSignTx * TILE, townSignTy * TILE - townSign.displayHeight / 2 - 10, '↑ Town', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffe066',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);

    this.scatterDecor();
    this.decoSolids.push({ x: townSignTx * TILE, y: townSignTy * TILE + 12, w: 28, h: 18 });
  }

  private scatterDecor() {
    type Spot = {
      tex: string;
      tx: number;
      ty: number;
      displayH?: number;
      solid?: [number, number, number?];
    };
    const spots: Spot[] = [
      { tex: 'tree', tx: 2, ty: 2.4, displayH: TREE_DISPLAY_H, solid: [48, 36, 22] },
      { tex: 'tree', tx: 22, ty: 2.6, displayH: TREE_DISPLAY_H, solid: [48, 36, 22] },
      { tex: 'tree', tx: 3.2, ty: 8.2, displayH: TREE_DISPLAY_H * 0.9, solid: [44, 32, 18] },
      { tex: 'tree', tx: 20.8, ty: 8.3, displayH: TREE_DISPLAY_H * 0.9, solid: [44, 32, 18] },
      { tex: 'bush', tx: 6.5, ty: 4.2, displayH: PROP_DISPLAY_H * 0.85, solid: [40, 24, 8] },
      { tex: 'bush', tx: 17.5, ty: 4.3, displayH: PROP_DISPLAY_H * 0.85, solid: [40, 24, 8] },
      { tex: 'wildflower', tx: 4.2, ty: 5.4, displayH: 48 },
      { tex: 'wildflower', tx: 19.5, ty: 5.6, displayH: 48 },
      { tex: 'rock', tx: 2.5, ty: 9.2, displayH: PROP_DISPLAY_H * 0.85, solid: [40, 28, 6] },
      { tex: 'rock', tx: 21.5, ty: 9.3, displayH: PROP_DISPLAY_H * 0.85, solid: [40, 28, 6] },
      { tex: 'bench', tx: 8.5, ty: 7.4, displayH: PROP_DISPLAY_H, solid: [90, 32, 8] },
      { tex: 'bench', tx: 15.5, ty: 7.4, displayH: PROP_DISPLAY_H, solid: [90, 32, 8] },
      { tex: 'streetlamp', tx: 9.8, ty: 6.2, displayH: LAMP_DISPLAY_H, solid: [22, 20, 28] },
      { tex: 'streetlamp', tx: 14.2, ty: 6.2, displayH: LAMP_DISPLAY_H, solid: [22, 20, 28] },
      { tex: 'barrel', tx: 10.2, ty: 9.1, displayH: PROP_DISPLAY_H * 0.85, solid: [40, 34, 6] },
      { tex: 'crate', tx: 13.8, ty: 9.15, displayH: PROP_DISPLAY_H * 0.85, solid: [44, 34, 6] },
    ];
    this.decoSolids = [];
    for (const spot of spots) {
      const img = this.add.image(spot.tx * TILE, spot.ty * TILE, spot.tex);
      const displayH =
        spot.displayH ??
        (spot.tex === 'tree' ? TREE_DISPLAY_H : spot.tex === 'streetlamp' ? LAMP_DISPLAY_H : PROP_DISPLAY_H);
      scalePropToHeight(img, displayH);
      // Always pass a ground Y (matches Town/Park) so flower feet sort correctly.
      const footY = spot.solid ? spot.ty * TILE + (spot.solid[2] ?? 0) : spot.ty * TILE;
      img.setDepth(propDepth(img, footY));
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
    // Block walking into the ocean — a wall along the shoreline.
    addSolid(SHORE_WORLD_W / 2, SHORE_OCEAN_ROW * TILE + 8, SHORE_WORLD_W, 24);
    // Dock is walkable up to the edge but solid enough to feel planted.
    addSolid(SHORE_DOCK.tx * TILE, SHORE_DOCK.ty * TILE + 10, 160, 40);
    for (const s of this.decoSolids) addSolid(s.x, s.y, s.w, s.h);
    this.physics.add.collider(this.player, solids);
  }

  /** Start fishing — unless the pet is too tired to play. */
  private goFishing() {
    if (!hasFishingBait(State.data.inventory)) {
      toast(
        this,
        this.player.x,
        this.player.y - 56,
        'You need bait — Daniel sells it for 3 coins!',
        '#ffe066',
      );
      return;
    }
    if (!State.hasEnergy(FISHING_ENERGY_PER_CAST)) {
      toast(
        this,
        this.player.x,
        this.player.y - 56,
        tooTiredMessage(State.data.petName, FISHING_ENERGY_PER_CAST),
        '#ffb3d1',
      );
      return;
    }
    this.scene.start('Fishing');
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
        emptyHint: 'no food — try fishing!',
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
    for (const npc of this.npcs) {
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
              onClose: () => {
                this.hud.refresh();
                this.closeMenu();
              },
              keepMenuOpen: () => {
                this.menuOpen = true;
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

  private setHighlight(targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[]) {
    this.glowed = updateInteractionHighlight(this.glowed, targets);
  }

  update() {
    if (!this.player) return;

    this.worldMultiplayer.applyCorrection();
    const speed = 220;
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
    }
    applyPenguinMotion(this.player, this.facing, vx, moving);
    // Sort by the feet, not the sprite box: the dance sheet is a different size.
    this.player.setDepth(characterDepth(penguinDepthTarget(this.player)));
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.pet.update(this.player.x, this.player.y, body.velocity.x, body.velocity.y);
    this.worldMultiplayer.update(this.facing, moving, this.game.loop.delta);

    for (const npc of this.npcs) npc.update();

    // Auto-return near the north path edge.
    if (!uiOpen && this.player.y < 36 && Math.abs(this.player.x - 12 * TILE) < 90) {
      this.scene.start('Town', { spawn: 'shore' });
      return;
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
      requestLeave();
    }
  }
}
