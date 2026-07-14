import Phaser from 'phaser';
import { generateTextures } from '../sprites/pixelart';
import { MIN_GAME_ENERGY, State } from '../systems/GameState';
import { bottomButtons, HUD, Menu, Prompt, toast } from '../systems/UI';
import { Pet } from '../systems/Pet';
import { ClickMove } from '../systems/ClickMove';
import { characterDepth, propDepth } from '../systems/depth';
import { isInteractSuppressed, isUiBlocked, requestLeave } from '../systems/nav';
import { Joystick } from '../systems/Joystick';
import { attachCameraZoom, type CameraZoom } from '../systems/cameraZoom';
import { clothesPetMenuOption } from '../systems/petClothesMenu';
import { feedPetMenuOption } from '../systems/petFeedMenu';
import { TILE } from '../systems/townMap';
import { PARK_MAP_H, PARK_MAP_W, PARK_PATH_TY, PARK_WORLD_H, PARK_WORLD_W } from '../systems/parkMap';

interface Interactable {
  x: number;
  y: number;
  radius: number;
  label: string;
  action: () => void;
  targets?: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[];
}

/** A playable attraction standing in the park. */
interface ParkBooth {
  /** Texture key for the booth/building art. */
  texture: string;
  /** Name shown on the floating sign. */
  label: string;
  /** Interact prompt. */
  prompt: string;
  /** Mini-game scene started on interact. */
  sceneKey: string;
  /** `spawn` id this park receives when that game exits back here. */
  spawnId: string;
  tx: number;
  ty: number;
  scale: number;
  radius: number;
  /** Collider [w, h, yOffset]. */
  solid: [number, number, number?];
}

type Spot = { tex: string; tx: number; ty: number; scale?: number; solid?: [number, number, number?] };

interface ParkConfig {
  /** Phaser scene key. */
  key: string;
  /** Shown in the arrival toast. */
  displayName: string;
  /** Which park edge walks back to town. */
  exitEdge: 'east' | 'west';
  /** Town `spawn` id used on return. */
  townSpawn: 'west' | 'east';
  booths: ParkBooth[];
  decor: Spot[];
}

/**
 * A small game park flanking town — Club Penguin-style hub like the shore,
 * but hosting the mini-game booths that used to crowd the town square.
 * Walk off the connecting path edge to return to town.
 */
export class ParkScene extends Phaser.Scene {
  private cfg: ParkConfig;
  private player!: Phaser.Physics.Arcade.Sprite;
  private pet!: Pet;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private hud!: HUD;
  private prompt!: Prompt;
  private interactables: Interactable[] = [];
  private menuOpen = false;
  private facing: 'up' | 'down' | 'side' = 'down';
  private clickMove!: ClickMove;
  private joystick!: Joystick;
  private cameraZoom!: CameraZoom;
  private pointerHeld = false;
  private glowed: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] = [];
  private ignoreClicksUntil = 0;
  private decoSolids: { x: number; y: number; w: number; h: number }[] = [];
  private boothImgs: { img: Phaser.GameObjects.Image; booth: ParkBooth }[] = [];

  constructor(cfg: ParkConfig) {
    super(cfg.key);
    this.cfg = cfg;
  }

  create(data: { spawn?: string }) {
    generateTextures(this);
    this.interactables = [];
    this.menuOpen = false;
    this.ignoreClicksUntil = 0;
    this.boothImgs = [];

    this.physics.world.setBounds(0, 0, PARK_WORLD_W, PARK_WORLD_H);
    this.cameras.main.setBounds(0, 0, PARK_WORLD_W, PARK_WORLD_H);

    this.buildMap();

    // From town → just inside the connecting edge; from a game → by its booth.
    const entryX = this.cfg.exitEdge === 'east' ? (PARK_MAP_W - 1.6) * TILE : 1.6 * TILE;
    let sx = entryX;
    let sy = 6 * TILE;
    const fromBooth = this.cfg.booths.find((b) => b.spawnId === data?.spawn);
    if (fromBooth) {
      sx = fromBooth.tx * TILE;
      sy = (fromBooth.ty + 1.6) * TILE;
    }

    this.player = this.physics.add.sprite(sx, sy, 'penguin-down', 0);
    this.player.setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(34, 16).setOffset(10, 42);
    this.facing = 'down';

    this.pet = new Pet(this, sx - 30, sy + 10);
    this.pet.sprite.setInteractive({ useHandCursor: true });
    this.pet.sprite.on('pointerdown', () => {
      this.ignoreClicksUntil = this.time.now + 200;
      if (!this.menuOpen && !isUiBlocked()) this.pet.speak();
    });

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.buildColliders();

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
    this.pointerHeld = false;

    bottomButtons(
      this,
      [{ label: '[ Pet ]', onTap: () => { if (!this.menuOpen) this.openPetMenu(); } }],
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
      if (this.joystick.owns(pointer) || this.cameraZoom.ownsPointer(pointer)) return;
      if (this.cameraZoom.isPinching()) return;
      // Clicking a booth enters its game when near; otherwise walk to it.
      for (const { img, booth } of this.boothImgs) {
        if (!img.getBounds().contains(pointer.worldX, pointer.worldY)) continue;
        const d = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          booth.tx * TILE,
          booth.ty * TILE,
        );
        if (d < booth.radius + 40) {
          this.clickMove.clear();
          this.enterGame(booth.sceneKey);
        } else {
          this.clickMove.setTarget(booth.tx * TILE, (booth.ty + 1.4) * TILE);
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

    if (!fromBooth) {
      toast(this, sx, sy - 50, this.cfg.displayName + '!', '#a8e6cf');
    }
  }

  private buildMap() {
    for (let ty = 0; ty < PARK_MAP_H; ty++) {
      for (let tx = 0; tx < PARK_MAP_W; tx++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-grass').setDepth(-100);
      }
    }

    // Connecting path across the park to the town edge.
    for (const ty of PARK_PATH_TY) {
      for (let tx = 0; tx < PARK_MAP_W; tx++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      }
    }
    // Short stubs from the path up to each booth front.
    for (const booth of this.cfg.booths) {
      const tx = Math.round(booth.tx - 0.5);
      for (let ty = Math.round(booth.ty + 1); ty < PARK_PATH_TY[0]; ty++) {
        this.add.image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 'tile-path').setDepth(-99);
      }
    }

    for (const booth of this.cfg.booths) {
      const img = this.add.image(booth.tx * TILE, booth.ty * TILE, booth.texture).setScale(booth.scale);
      img.setDepth(propDepth(img, booth.ty * TILE));
      this.boothImgs.push({ img, booth });
      this.add
        .text(booth.tx * TILE, booth.ty * TILE - img.displayHeight / 2 - 12, booth.label, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffffff',
          stroke: '#1a1a2e',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(900);
      this.interactables.push({
        x: booth.tx * TILE,
        y: booth.ty * TILE,
        radius: booth.radius,
        label: booth.prompt,
        action: () => this.enterGame(booth.sceneKey),
        targets: [img],
      });
    }

    // Signpost at the town-side edge so the way home is obvious.
    const signTx = this.cfg.exitEdge === 'east' ? PARK_MAP_W - 1.2 : 1.2;
    const sign = this.add.image(signTx * TILE, 4.2 * TILE, 'signpost').setScale(1.3);
    sign.setDepth(propDepth(sign, 4.2 * TILE + 10));
    this.add
      .text(signTx * TILE, 4.2 * TILE - 34, this.cfg.exitEdge === 'east' ? 'Town →' : '← Town', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffe066',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(900);
    this.decoSolids = [{ x: signTx * TILE, y: 4.2 * TILE + 10, w: 18, h: 12 }];

    this.scatterDecor();
  }

  private scatterDecor() {
    for (const spot of this.cfg.decor) {
      const img = this.add.image(spot.tx * TILE, spot.ty * TILE, spot.tex).setScale(spot.scale ?? 1.3);
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
    for (const booth of this.cfg.booths) {
      const [sw, sh, oy = 0] = booth.solid;
      addSolid(booth.tx * TILE, booth.ty * TILE + oy, sw, sh);
    }
    for (const s of this.decoSolids) addSolid(s.x, s.y, s.w, s.h);
    this.physics.add.collider(this.player, solids);
  }

  /** Start a mini-game — unless the pet is too tired to play. */
  private enterGame(sceneKey: string) {
    if (!State.hasEnergy(MIN_GAME_ENERGY)) {
      toast(
        this,
        this.player.x,
        this.player.y - 56,
        `${State.data.petName || 'Your pet'} is too tired to play — needs a nap!`,
        '#ffb3d1',
      );
      return;
    }
    this.scene.start(sceneKey);
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

    // Walk off the connecting-path edge → back to town.
    const onPathBand =
      this.player.y > (PARK_PATH_TY[0] - 0.4) * TILE &&
      this.player.y < (PARK_PATH_TY[1] + 1.4) * TILE;
    if (!uiOpen && onPathBand) {
      if (this.cfg.exitEdge === 'east' && this.player.x > PARK_WORLD_W - 36) {
        this.scene.start('Town', { spawn: this.cfg.townSpawn });
        return;
      }
      if (this.cfg.exitEdge === 'west' && this.player.x < 36) {
        this.scene.start('Town', { spawn: this.cfg.townSpawn });
        return;
      }
    }

    if (!this.menuOpen) {
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

    // I toggles the pet menu — opens it, or closes the topmost menu if open.
    if (Phaser.Input.Keyboard.JustDown(this.keyI)) {
      if (this.menuOpen) Menu.closeTop();
      else if (!isUiBlocked()) this.openPetMenu();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) && !this.menuOpen && !isUiBlocked()) {
      requestLeave();
    }
  }
}

/** West Green — left of town: Skip Rope booth + the Bump arena. */
export class WestParkScene extends ParkScene {
  constructor() {
    super({
      key: 'WestPark',
      displayName: 'The West Green',
      exitEdge: 'east',
      townSpawn: 'west',
      booths: [
        {
          texture: 'skiprope-booth',
          label: 'Skip Rope',
          prompt: 'E / Space / click — Skip Rope',
          sceneKey: 'SkipRope',
          spawnId: 'skiprope',
          tx: 4.4,
          ty: 3.1,
          scale: 1.55,
          radius: 72,
          solid: [52, 40, 0],
        },
        {
          texture: 'bump-arena',
          label: 'Bump!',
          prompt: 'E / Space / click — Play Bump',
          sceneKey: 'Bump',
          spawnId: 'bump',
          tx: 10.6,
          ty: 3.1,
          scale: 1.6,
          radius: 72,
          solid: [58, 38, 4],
        },
      ],
      decor: [
        { tex: 'tree', tx: 1.4, ty: 1.6, scale: 1.3, solid: [34, 26, 16] },
        { tex: 'tree', tx: 13.8, ty: 9.8, scale: 1.3, solid: [34, 26, 16] },
        { tex: 'tree', tx: 1.6, ty: 9.6, scale: 1.25, solid: [34, 26, 16] },
        { tex: 'bush', tx: 7.6, ty: 1.6, scale: 1.1, solid: [26, 16, 6] },
        { tex: 'bush', tx: 12.8, ty: 1.8, scale: 1.1, solid: [26, 16, 6] },
        { tex: 'wildflower', tx: 2.6, ty: 4.1, scale: 1.15 },
        { tex: 'wildflower', tx: 8.2, ty: 8.4, scale: 1.15 },
        { tex: 'wildflower', tx: 13.2, ty: 4.2, scale: 1.15 },
        { tex: 'bench', tx: 5.4, ty: 8, scale: 1.1, solid: [50, 20, 5] },
        { tex: 'bench', tx: 10.6, ty: 8, scale: 1.1, solid: [50, 20, 5] },
        { tex: 'streetlamp', tx: 7.9, ty: 4.3, scale: 1.25, solid: [16, 14, 18] },
        { tex: 'mushroom', tx: 3.4, ty: 10.6, scale: 1.15 },
        { tex: 'stump', tx: 11.8, ty: 10.4, scale: 1.15, solid: [26, 14, 2] },
      ],
    });
  }
}

/** East Green — right of town: the Paper Toss arcade. */
export class EastParkScene extends ParkScene {
  constructor() {
    super({
      key: 'EastPark',
      displayName: 'The East Green',
      exitEdge: 'west',
      townSpawn: 'east',
      booths: [
        {
          texture: 'arcade',
          label: 'Paper Toss',
          prompt: 'E / Space / click — Play Paper Toss',
          sceneKey: 'PaperToss',
          spawnId: 'arcade',
          tx: 8,
          ty: 3.1,
          scale: 1.5,
          radius: 72,
          solid: [58, 38, 2],
        },
      ],
      decor: [
        { tex: 'tree', tx: 14.4, ty: 1.6, scale: 1.3, solid: [34, 26, 16] },
        { tex: 'tree', tx: 2.2, ty: 9.8, scale: 1.3, solid: [34, 26, 16] },
        { tex: 'tree', tx: 14.2, ty: 9.6, scale: 1.25, solid: [34, 26, 16] },
        { tex: 'bush', tx: 4.4, ty: 1.7, scale: 1.1, solid: [26, 16, 6] },
        { tex: 'bush', tx: 11.6, ty: 1.6, scale: 1.1, solid: [26, 16, 6] },
        { tex: 'wildflower', tx: 3, ty: 4.2, scale: 1.15 },
        { tex: 'wildflower', tx: 12.8, ty: 4.1, scale: 1.15 },
        { tex: 'wildflower', tx: 7.4, ty: 8.5, scale: 1.15 },
        { tex: 'bench', tx: 5.6, ty: 8, scale: 1.1, solid: [50, 20, 5] },
        { tex: 'bench', tx: 10.4, ty: 8, scale: 1.1, solid: [50, 20, 5] },
        { tex: 'streetlamp', tx: 5.4, ty: 4.3, scale: 1.25, solid: [16, 14, 18] },
        { tex: 'barrel', tx: 10.4, ty: 4.4, scale: 1.1, solid: [26, 22, 4] },
        { tex: 'rock', tx: 12.6, ty: 10.4, scale: 1.1, solid: [28, 18, 5] },
      ],
    });
  }
}
