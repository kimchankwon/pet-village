import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State, ITEMS } from '../systems/GameState';
import { HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { ClickMove } from '../systems/ClickMove';
import { feetDepth } from '../systems/depth';
import { isUiBlocked, requestLeave } from '../systems/nav';

const TILE = 48;
const WORLD_W = 32 * TILE;
const WORLD_H = 24 * TILE;

interface Interactable {
  x: number;
  y: number;
  radius: number;
  label: string;
  action: () => void;
}

export class TownScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private pet!: Pet;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private hud!: HUD;
  private prompt!: Prompt;
  private interactables: Interactable[] = [];
  private menuOpen = false;
  private facing: 'up' | 'down' | 'side' = 'down';
  private clickMove!: ClickMove;

  constructor() {
    super('Town');
  }

  create(data: { spawn?: 'house' | 'arcade' }) {
    generateTextures(this);
    this.interactables = [];
    this.menuOpen = false;

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
      sx = 24 * TILE;
      sy = 16 * TILE;
    }

    this.player = this.physics.add.sprite(sx, sy, 'penguin-down', 0);
    this.player.setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(34, 16).setOffset(10, 42);

    this.pet = new Pet(this, sx - 30, sy + 10);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.buildColliders();

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.hud = new HUD(this);
    this.prompt = new Prompt(this);
    this.clickMove = new ClickMove(this);

    // Club Penguin-style: click ground to walk; click a nearby interactable to use it.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.menuOpen || pointer.button !== 0) return;
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
    });

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

    if (!localStorage.getItem('pet-village-welcomed')) {
      localStorage.setItem('pet-village-welcomed', '1');
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

    // Player's house (enter via door at its base)
    const house = this.add.image(6.5 * TILE, 6 * TILE, 'house').setScale(2);
    house.setDepth(house.y + house.displayHeight / 2);
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
      x: 6.5 * TILE,
      y: 8.2 * TILE,
      radius: 70,
      label: 'E / click — Enter house',
      action: () => this.scene.start('House'),
    });

    // Shop with bunny keeper
    const shop = this.add.image(25 * TILE, 6 * TILE, 'shop').setScale(2);
    shop.setDepth(shop.y + shop.displayHeight / 2);
    const bunny = this.add.image(25 * TILE, 8.6 * TILE, 'bunny').setScale(1.2);
    bunny.setDepth(bunny.y + bunny.displayHeight / 2);
    this.add
      .text(25 * TILE, 6 * TILE - shop.displayHeight / 2 - 12, "Bella's Shop", {
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
      y: 8.6 * TILE,
      radius: 80,
      label: 'E / click — Talk to Bella',
      action: () => this.openShop(),
    });

    // Arcade cabinet → paper toss minigame
    const arcade = this.add.image(24 * TILE, 15 * TILE, 'arcade').setScale(1.5);
    arcade.setDepth(arcade.y + arcade.displayHeight / 2);
    this.add
      .text(24 * TILE, 15 * TILE - 50, 'Paper Toss', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: 24 * TILE,
      y: 15 * TILE,
      // must exceed the collider's diagonal reach or some approach angles can never interact
      radius: 90,
      label: 'E / click — Play Paper Toss',
      action: () => this.scene.start('PaperToss'),
    });

    // Trees around the edges and sprinkled through town
    const treeSpots = [
      [2, 2], [10, 3], [19, 2], [29, 3], [2, 10], [29, 10],
      [3, 17], [10, 19], [20, 19], [28, 17], [13, 5], [21, 9],
      [5, 15], [29, 21], [2, 21], [16, 20],
    ];
    for (const [tx, ty] of treeSpots) {
      const tree = this.add.image(tx * TILE, ty * TILE, 'tree').setScale(1.5);
      tree.setDepth(tree.y + tree.displayHeight / 2);
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
    addSolid(25 * TILE, 6.3 * TILE, 140, 80); // shop
    addSolid(24 * TILE, 15 * TILE, 60, 40); // arcade
    const treeSpots = [
      [2, 2], [10, 3], [19, 2], [29, 3], [2, 10], [29, 10],
      [3, 17], [10, 19], [20, 19], [28, 17], [13, 5], [21, 9],
      [5, 15], [29, 21], [2, 21], [16, 20],
    ];
    for (const [tx, ty] of treeSpots) addSolid(tx * TILE, ty * TILE + 20, 40, 30);
    this.physics.add.collider(this.player, solids);
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
        this.menuOpen = false;
      },
    }));
    const menu = new Menu(this, "Bella's Shop", options, `You have ${State.coins} coins`);
    menu.onClose = () => (this.menuOpen = false);
  }

  private openPetMenu() {
    this.menuOpen = true;
    const foods = Object.entries(State.data.inventory).filter(([id]) => ITEMS[id]?.kind === 'food');
    const options = [
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
    menu.onClose = () => (this.menuOpen = false);
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
    menu.onClose = () => (this.menuOpen = false);
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
    // Pet is the fallback — it follows so closely it would otherwise shadow every prompt.
    if (!best) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.pet.sprite.x, this.pet.sprite.y);
      if (d < 50) {
        return {
          x: this.pet.sprite.x,
          y: this.pet.sprite.y,
          radius: 50,
          label: `E / click — ${State.data.petName} (your pet)`,
          action: () => this.openPetMenu(),
        };
      }
    }
    return best;
  }

  update() {
    if (!this.player) return;

    const speed = 220;
    let vx = 0;
    let vy = 0;

    if (!this.menuOpen) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -speed;
      else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = speed;
      if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed;
      else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed;
    }

    // Keyboard overrides click-to-move; otherwise steer toward the tap target.
    if (vx !== 0 || vy !== 0) {
      this.clickMove.clear();
    } else if (!this.menuOpen) {
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

    if (!this.menuOpen) {
      const best = this.nearestInteractable();
      if (best) {
        this.prompt.show(best.label);
        if (Phaser.Input.Keyboard.JustDown(this.keyE)) best.action();
      } else {
        this.prompt.hide();
      }
    } else {
      this.prompt.hide();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) && !isUiBlocked()) {
      requestLeave();
    }
  }
}
