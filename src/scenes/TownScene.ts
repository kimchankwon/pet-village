import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State, ITEMS, WELCOME_KEY } from '../systems/GameState';
import { bottomButtons, HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { ClickMove } from '../systems/ClickMove';
import { feetDepth } from '../systems/depth';
import { forceLeave, isUiBlocked } from '../systems/nav';
import { Joystick } from '../systems/Joystick';
import { BongbongeeNpc } from '../systems/BongbongeeNpc';
import { MiniteenRoster } from '../systems/MiniteenRoster';
import type { WandererNpc } from '../systems/WandererNpc';
import { clothesPetMenuOption } from '../systems/petClothesMenu';

const TILE = 48;
const WORLD_W = 32 * TILE;
const WORLD_H = 24 * TILE;

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

  create(data: { spawn?: 'house' | 'arcade' | 'shop' | 'cafe' }) {
    generateTextures(this);
    this.interactables = [];
    this.menuOpen = false;
    this.ignoreClicksUntil = 0;

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    this.buildMap();

    // Spawn position depends on where we came from.
    let sx = 16 * TILE;
    let sy = 14 * TILE;
    if (data?.spawn === 'house') {
      sx = 6.5 * TILE;
      sy = 8.5 * TILE;
    } else if (data?.spawn === 'arcade') {
      sx = 25 * TILE;
      sy = 17.2 * TILE;
    } else if (data?.spawn === 'shop') {
      sx = 25 * TILE;
      sy = 9.4 * TILE;
    } else if (data?.spawn === 'cafe') {
      sx = 7 * TILE;
      sy = 18.5 * TILE;
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
      // Bongbongee wanders town; Cinnamoroll is inside Cafe Cinnamon.
      new BongbongeeNpc(this, [
        { x: 12 * TILE, y: 15 * TILE },
        { x: 18 * TILE, y: 11 * TILE },
        { x: 27 * TILE, y: 12 * TILE },
        { x: 14 * TILE, y: 19 * TILE },
        { x: 21 * TILE, y: 17 * TILE },
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
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, 6.5 * TILE, 6.3 * TILE);
        if (d < 150) {
          this.clickMove.clear();
          this.scene.start('House');
        } else {
          this.clickMove.setTarget(6.5 * TILE, 8.4 * TILE);
        }
        return;
      }
      if (this.shopImg.getBounds().contains(pointer.worldX, pointer.worldY)) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, 25 * TILE, 6.3 * TILE);
        if (d < 150) {
          this.clickMove.clear();
          this.scene.start('Shop');
        } else {
          this.clickMove.setTarget(25 * TILE, 8.6 * TILE);
        }
        return;
      }
      if (this.cafeImg.getBounds().contains(pointer.worldX, pointer.worldY)) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, 7 * TILE, 16.3 * TILE);
        if (d < 150) {
          this.clickMove.clear();
          this.scene.start('ClothesShop');
        } else {
          this.clickMove.setTarget(7 * TILE, 18.2 * TILE);
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
    for (let ty = 0; ty < 24; ty++) {
      for (let tx = 0; tx < 32; tx++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-grass').setDepth(-100);
      }
    }
    // Paths: a crossroads through the middle of town
    for (let tx = 0; tx < 32; tx++) {
      this.add.image(tx * TILE + TILE / 2, 12 * TILE + TILE / 2, 'tile-path').setDepth(-99);
      this.add.image(tx * TILE + TILE / 2, 13 * TILE + TILE / 2, 'tile-path').setDepth(-99);
    }
    for (let ty = 0; ty < 24; ty++) {
      this.add.image(15 * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      this.add.image(16 * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
    }

    // Player's house — walk near any side and click anywhere on it to enter.
    const house = this.add.image(6.5 * TILE, 6 * TILE, 'house').setScale(2);
    house.setDepth(house.y + house.displayHeight / 2);
    this.houseImg = house;
    this.add
      .text(6.5 * TILE, 6 * TILE - house.displayHeight / 2 - 12, 'My House', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      // Centred on the house body with a radius that covers every side,
      // so standing anywhere near the house lets you enter.
      x: 6.5 * TILE,
      y: 6.3 * TILE,
      radius: 130,
      label: 'E / click — Enter house',
      action: () => this.scene.start('House'),
      targets: [house],
    });

    // Daniel's shop — Daniel is inside; walk near and enter.
    const shop = this.add.image(25 * TILE, 6 * TILE, 'shop').setScale(2);
    shop.setDepth(shop.y + shop.displayHeight / 2);
    this.shopImg = shop;
    this.add
      .text(25 * TILE, 6 * TILE - shop.displayHeight / 2 - 12, "Daniel's Shop", {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: 25 * TILE,
      y: 6.3 * TILE,
      radius: 130,
      label: "E / click — Enter Daniel's Shop",
      action: () => this.scene.start('Shop'),
      targets: [shop],
    });

    // Cafe Cinnamon — SW; Cinnamoroll sells pet clothes inside.
    const cafe = this.add.image(7 * TILE, 16 * TILE, 'cafe').setScale(2);
    cafe.setDepth(cafe.y + cafe.displayHeight / 2);
    this.cafeImg = cafe;
    this.add
      .text(7 * TILE, 16 * TILE - cafe.displayHeight / 2 - 12, 'Cafe Cinnamon', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffe6f2',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: 7 * TILE,
      y: 16.3 * TILE,
      radius: 130,
      label: 'E / click — Enter Cafe Cinnamon',
      action: () => this.scene.start('ClothesShop'),
      targets: [cafe],
    });

    // Arcade cabinet → paper toss minigame (SE, near Daniel's side of town)
    const arcade = this.add.image(25 * TILE, 16 * TILE, 'arcade').setScale(1.5);
    arcade.setDepth(arcade.y + arcade.displayHeight / 2);
    this.add
      .text(25 * TILE, 16 * TILE - 50, 'Paper Toss', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: 25 * TILE,
      y: 16 * TILE,
      radius: 90,
      label: 'E / click — Play Paper Toss',
      action: () => this.scene.start('PaperToss'),
      targets: [arcade],
    });

    // Path spurs to buildings (keep paths clear of clutter)
    for (let ty = 14; ty <= 16; ty++) {
      for (let tx = 23; tx <= 26; tx++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      }
    }
    for (let ty = 8; ty <= 11; ty++) {
      this.add.image(6 * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      this.add.image(7 * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
    }
    for (let ty = 8; ty <= 11; ty++) {
      this.add.image(24 * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      this.add.image(25 * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
    }
    for (let ty = 14; ty <= 17; ty++) {
      this.add.image(6 * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      this.add.image(7 * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
    }

    this.scatterTownDecor();
  }

  /**
   * Light outdoor décor — corners and path edges only, so buildings stay readable.
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
      { tex: 'tree', tx: 2, ty: 2.5, scale: 1.5, solid: [40, 30, 20] },
      { tex: 'tree', tx: 29.5, ty: 3, scale: 1.5, solid: [40, 30, 20] },
      { tex: 'tree', tx: 2, ty: 21, scale: 1.5, solid: [40, 30, 20] },
      { tex: 'tree', tx: 29.5, ty: 21, scale: 1.5, solid: [40, 30, 20] },
      { tex: 'tree', tx: 29.5, ty: 10, scale: 1.45, solid: [40, 30, 20] },
      { tex: 'tree', tx: 2, ty: 10.5, scale: 1.45, solid: [40, 30, 20] },
    ];

    const bushes: Spot[] = [
      { tex: 'bush', tx: 4.5, ty: 4, scale: 1.25, solid: [28, 18, 8] },
      { tex: 'bush', tx: 10, ty: 3.5, scale: 1.2, solid: [28, 18, 8] },
      { tex: 'bush', tx: 22, ty: 3.5, scale: 1.25, solid: [28, 18, 8] },
      { tex: 'bush', tx: 27.5, ty: 4.2, scale: 1.2, solid: [28, 18, 8] },
      { tex: 'bush', tx: 11, ty: 19, scale: 1.2, solid: [28, 18, 8] },
      { tex: 'bush', tx: 20, ty: 19.5, scale: 1.25, solid: [28, 18, 8] },
    ];

    const flowers: Spot[] = [
      { tex: 'wildflower', tx: 5, ty: 8.8, scale: 1.35 },
      { tex: 'wildflower', tx: 9, ty: 9.2, scale: 1.3 },
      { tex: 'wildflower', tx: 23, ty: 8.8, scale: 1.35 },
      { tex: 'wildflower', tx: 27, ty: 9.2, scale: 1.3 },
      { tex: 'wildflower', tx: 10, ty: 17.5, scale: 1.3 },
      { tex: 'wildflower', tx: 22, ty: 18, scale: 1.35 },
    ];

    const hardscape: Spot[] = [
      { tex: 'fountain', tx: 12.5, ty: 10.2, scale: 1.55, solid: [50, 36, 10] },
      { tex: 'bench', tx: 14, ty: 11.2, scale: 1.3, solid: [56, 22, 6] },
      { tex: 'bench', tx: 18.5, ty: 14.2, scale: 1.3, solid: [56, 22, 6] },
      { tex: 'streetlamp', tx: 14.2, ty: 8.2, scale: 1.45, solid: [18, 16, 22] },
      { tex: 'streetlamp', tx: 17.8, ty: 8.2, scale: 1.45, solid: [18, 16, 22] },
      { tex: 'streetlamp', tx: 14.2, ty: 16.2, scale: 1.45, solid: [18, 16, 22] },
      { tex: 'streetlamp', tx: 17.8, ty: 16.2, scale: 1.45, solid: [18, 16, 22] },
      { tex: 'mailbox', tx: 8.6, ty: 8.2, scale: 1.3, solid: [24, 20, 8] },
      { tex: 'fence', tx: 4.2, ty: 8.6, scale: 1.35, solid: [60, 18, 4] },
      { tex: 'fence', tx: 9, ty: 8.6, scale: 1.35, solid: [60, 18, 4] },
      { tex: 'signpost', tx: 9.5, ty: 11.5, scale: 1.25, solid: [20, 16, 10] },
      { tex: 'signpost', tx: 22.5, ty: 11.5, scale: 1.25, solid: [20, 16, 10] },
      { tex: 'rock', tx: 30, ty: 15, scale: 1.3, solid: [32, 20, 6] },
      { tex: 'rock', tx: 1.8, ty: 14.5, scale: 1.3, solid: [32, 20, 6] },
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
    addSolid(6.5 * TILE, 6.3 * TILE, 140, 80); // house
    addSolid(25 * TILE, 6.3 * TILE, 140, 80); // Daniel's shop
    addSolid(7 * TILE, 16.3 * TILE, 140, 80); // Cafe Cinnamon
    addSolid(25 * TILE, 16 * TILE, 60, 40); // arcade
    for (const s of this.decoSolids) addSolid(s.x, s.y, s.w, s.h);
    this.physics.add.collider(this.player, solids);
  }

  private closeMenu() {
    this.menuOpen = false;
    this.ignoreClicksUntil = this.time.now + 250;
  }



  private openPetMenu() {
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
        label: `Feed ${State.data.petName}${foods.length === 0 ? ' (no food — visit shop!)' : ''}`,
        icon: 'fish',
        disabled: foods.length === 0,
        onSelect: () => this.openFeedMenu(),
      },
      {
        label: `Play together (+happy, -energy)`,
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
      // The React shell owns the game menu (resume / colour / pet / exit).
      forceLeave();
    }
  }
}
