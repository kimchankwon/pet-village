import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { State } from '../systems/GameState';
import { bottomButtons, HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { ClickMove } from '../systems/ClickMove';
import { characterDepth, propDepth } from '../systems/depth';
import { isUiBlocked, requestLeave } from '../systems/nav';
import { Joystick } from '../systems/Joystick';
import { clothesPetMenuOption } from '../systems/petClothesMenu';
import { feedPetMenuOption } from '../systems/petFeedMenu';
import { TILE } from '../systems/townMap';
import {
  SHORE_DOCK,
  SHORE_MAP_H,
  SHORE_MAP_W,
  SHORE_OCEAN_ROW,
  SHORE_WORLD_H,
  SHORE_WORLD_W,
} from '../systems/shoreMap';
import { WandererNpc, type NpcTalkCallbacks } from '../systems/WandererNpc';
import { miniteenTexPrefix } from '../systems/miniteen';

interface Interactable {
  x: number;
  y: number;
  radius: number;
  label: string;
  action: () => void;
  targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[];
}

/** Sparse shore villager — same roam/talk pattern as town NPCs. */
class ShoreVillager extends WandererNpc {
  private lines: string[];

  constructor(
    scene: Phaser.Scene,
    name: string,
    texPrefix: string,
    waypoints: { x: number; y: number }[],
    lines: string[],
  ) {
    super(scene, { name, texPrefix, waypoints, scale: 1.5, speed: 40 });
    this.lines = lines;
  }

  protected override openTalk(cbs: NpcTalkCallbacks) {
    const line = this.pickLine(this.lines);
    this.playBounce();
    const menu = new Menu(this.scene, this.name, [{ label: 'Wave goodbye', onSelect: () => this.hop() }], {
      subtitle: line,
      anchor: 'bottom',
      face: this.faceKey(),
    });
    menu.onClose = cbs.onClose;
  }
}

/**
 * Outdoor coastal overworld — larger/scrollable, ocean along the south edge.
 * Reached from Town's south path; fishing spot on the dock starts FishingScene.
 */
export class ShoreScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private pet!: Pet;
  private npcs: WandererNpc[] = [];
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
  private pointerHeld = false;
  private glowed: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] = [];
  private ignoreClicksUntil = 0;
  private decoSolids: { x: number; y: number; w: number; h: number }[] = [];
  private oceanTiles: Phaser.GameObjects.Image[] = [];
  private dockImg!: Phaser.GameObjects.Image;

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

    // From town → top path; from fishing → near the dock.
    let sx = 9 * TILE;
    let sy = 2.2 * TILE;
    if (data?.spawn === 'fishing') {
      sx = SHORE_DOCK.tx * TILE;
      sy = (SHORE_DOCK.ty - 1.1) * TILE;
    }

    this.player = this.physics.add.sprite(sx, sy, 'penguin-down', 0);
    this.player.setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(34, 16).setOffset(10, 42);

    this.pet = new Pet(this, sx - 30, sy + 10);
    this.pet.sprite.setInteractive({ useHandCursor: true });
    this.pet.sprite.on('pointerdown', () => {
      this.ignoreClicksUntil = this.time.now + 200;
      if (!this.menuOpen && !isUiBlocked()) this.pet.speak();
    });

    this.npcs = [
      new ShoreVillager(
        this,
        'THEpalee',
        miniteenTexPrefix('thepalee'),
        [
          { x: 4 * TILE, y: 4.5 * TILE },
          { x: 6 * TILE, y: 6 * TILE },
          { x: 3.5 * TILE, y: 5.5 * TILE },
        ],
        [
          'The tide sounds nicer when nobody is shouting.',
          'Tea first. Then maybe a cast.',
          'Frogs prefer quiet ponds. This ocean is… loud. In a good way.',
        ],
      ),
      new ShoreVillager(
        this,
        'CHANDALEE',
        miniteenTexPrefix('chandalee'),
        [
          { x: 13 * TILE, y: 4.2 * TILE },
          { x: 15 * TILE, y: 5.8 * TILE },
          { x: 14 * TILE, y: 6.2 * TILE },
        ],
        [
          'One day every otter will know this shoreline! Ha!',
          'I practised my splash. Ten out of ten.',
          'Catch anything good? Show me later!',
        ],
      ),
    ];

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

    bottomButtons(
      this,
      [{ label: '[ Pet ]', onTap: () => { if (!this.menuOpen) this.openPetMenu(); } }],
      () => {
        this.ignoreClicksUntil = this.time.now + 150;
      },
    );

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.menuOpen || this.time.now < this.ignoreClicksUntil || pointer.button !== 0) return;
      if (this.joystick.owns(pointer)) return;
      if (this.dockImg.getBounds().contains(pointer.worldX, pointer.worldY)) {
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          SHORE_DOCK.tx * TILE,
          SHORE_DOCK.ty * TILE,
        );
        if (d < 140) {
          this.clickMove.clear();
          this.scene.start('Fishing');
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
        const img = this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, key).setDepth(-100);
        if (key === 'tile-ocean') this.oceanTiles.push(img);
      }
    }

    // Path from town (north) down to the dock.
    for (let ty = 0; ty <= SHORE_OCEAN_ROW - 2; ty++) {
      this.add.image(8 * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      this.add.image(9 * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
    }
    for (let tx = 7; tx <= 11; tx++) {
      this.add.image(tx * TILE + TILE / 2, (SHORE_OCEAN_ROW - 2) * TILE + TILE / 2, 'tile-path').setDepth(-99);
    }

    this.dockImg = this.add.image(SHORE_DOCK.tx * TILE, SHORE_DOCK.ty * TILE, 'dock').setScale(1.45);
    this.dockImg.setDepth(propDepth(this.dockImg, SHORE_DOCK.ty * TILE + 6));
    this.add
      .text(SHORE_DOCK.tx * TILE, SHORE_DOCK.ty * TILE - 48, 'Fishing dock', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);

    this.interactables.push({
      x: SHORE_DOCK.tx * TILE,
      y: SHORE_DOCK.ty * TILE,
      radius: 90,
      label: 'E / click — Go fishing',
      action: () => this.scene.start('Fishing'),
      targets: [this.dockImg],
    });

    // North return to town
    const northX = 9 * TILE;
    const northY = 0.9 * TILE;
    const sign = this.add.image(northX + 36, northY, 'signpost').setScale(1.15);
    sign.setDepth(propDepth(sign, northY));
    this.add
      .text(northX, northY - 26, '← Town', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.interactables.push({
      x: northX,
      y: northY,
      radius: 80,
      label: 'E / click — Back to town',
      action: () => this.scene.start('Town', { spawn: 'shore' }),
      targets: [sign],
    });

    this.scatterDecor();
  }

  private scatterDecor() {
    type Spot = { tex: string; tx: number; ty: number; scale?: number; solid?: [number, number, number?] };
    const spots: Spot[] = [
      { tex: 'tree', tx: 1.5, ty: 2.2, scale: 1.3, solid: [34, 26, 16] },
      { tex: 'tree', tx: 16.3, ty: 2.4, scale: 1.3, solid: [34, 26, 16] },
      { tex: 'bush', tx: 5, ty: 3.5, scale: 1.1, solid: [26, 16, 6] },
      { tex: 'bush', tx: 13, ty: 3.6, scale: 1.1, solid: [26, 16, 6] },
      { tex: 'wildflower', tx: 3.2, ty: 4.2, scale: 1.15 },
      { tex: 'wildflower', tx: 14.5, ty: 4.4, scale: 1.15 },
      { tex: 'rock', tx: 2, ty: 6.6, scale: 1.1, solid: [28, 18, 5] },
      { tex: 'rock', tx: 15.8, ty: 6.7, scale: 1.1, solid: [28, 18, 5] },
      { tex: 'bench', tx: 6.5, ty: 5.6, scale: 1.1, solid: [50, 20, 5] },
      { tex: 'bench', tx: 11.5, ty: 5.6, scale: 1.1, solid: [50, 20, 5] },
      { tex: 'streetlamp', tx: 7.5, ty: 4.8, scale: 1.25, solid: [16, 14, 18] },
      { tex: 'streetlamp', tx: 10.5, ty: 4.8, scale: 1.25, solid: [16, 14, 18] },
      { tex: 'barrel', tx: 7.8, ty: 6.7, scale: 1.1, solid: [26, 22, 4] },
      { tex: 'crate', tx: 10.3, ty: 6.75, scale: 1.05, solid: [28, 22, 4] },
    ];
    this.decoSolids = [];
    for (const spot of spots) {
      const img = this.add.image(spot.tx * TILE, spot.ty * TILE, spot.tex).setScale(spot.scale ?? 1.3);
      const footY = spot.solid ? spot.ty * TILE + (spot.solid[2] ?? 0) : undefined;
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
    addSolid(SHORE_DOCK.tx * TILE, SHORE_DOCK.ty * TILE + 6, 90, 28);
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
        emptyHint: 'no food — try fishing!',
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
    for (const npc of this.npcs) {
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
            });
          },
          targets: [npc.sprite],
        };
        bestDist = d;
      }
    }
    return best;
  }

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
    this.player.setDepth(characterDepth(this.player));
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.pet.update(this.player.x, this.player.y, body.velocity.x, body.velocity.y);
    for (const npc of this.npcs) npc.update();

    // Auto-return near the north path edge.
    if (!uiOpen && this.player.y < 36 && Math.abs(this.player.x - 9 * TILE) < 70) {
      this.scene.start('Town', { spawn: 'shore' });
      return;
    }

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
      requestLeave();
    }
  }
}
