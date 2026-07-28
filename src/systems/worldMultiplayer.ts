import Phaser from 'phaser';
import { ensureRemotePenguinTextures, penguinDrawScale } from '../sprites/pixelart';
import { Pet } from './Pet';
import {
  multiplayerBridge,
  type RemotePresence,
  type WorldPose,
  type WorldSceneId,
} from './multiplayerBridge';
import {
  handleRemotePlayerPointerDown,
  canInitiateWave,
  isNewWaveForLocalPlayer,
  LOCAL_PENGUIN_WAVE_TEXTURE_KEY,
  remoteMovementDecision,
  remotePetMovementDecision,
  remotePlayerPresentation,
  remotePenguinTextureKey,
  remotePenguinWalkAnimKey,
  remotePenguinWaveTextureKey,
  stepRemotePosition,
  waveAnimationFrame,
} from './multiplayerPresentation';
import { shouldSendPresence, type PresencePose } from './multiplayerPolicy';
import {
  isClassicSpecies,
  isPuffleSpecies,
  migratePetSpecies,
  petAnimKey,
  petDrawScale,
  petTextureKey,
  type PetSpecies,
} from './pets';
import { feetDepth } from './depth';
import { toast } from './UI';
import { phaserWorldSceneKey, translateWorldCoordinates } from './worldCoordinates';
import {
  ACCESSORIES,
  ACCESSORY_LAYOUT,
  SPECIES_ACCESSORY_NUDGE,
  accessoryWearable,
  type AccessoryId,
} from './accessories';

const REMOTE_INTERACTION_RADIUS = 92;

type RemoteAvatar = {
  row: RemotePresence;
  player: Phaser.GameObjects.Sprite;
  pet: Phaser.GameObjects.Sprite;
  playerLabel: Phaser.GameObjects.Text;
  petLabel: Phaser.GameObjects.Text;
  petSpecies: PetSpecies;
  color: string;
  accessories: Array<{ id: AccessoryId; image: Phaser.GameObjects.Image }>;
  accessoryKey: string;
  accessoryRetryAt: number;
  lastWaveId?: string;
  waveStartedAt: number | null;
};

export type RemoteInteractable = {
  x: number;
  y: number;
  radius: number;
  label: string;
  action: () => void;
  targets: Phaser.GameObjects.Sprite[];
};

export type WorldMultiplayerOptions = {
  sceneId: WorldSceneId;
  localPlayer: Phaser.Physics.Arcade.Sprite;
  pet: Pet;
  cancelLocalMovement: () => void;
  /** Screen-space interiors can be centred differently on each client. */
  networkOffsetX?: number;
  networkOffsetY?: number;
  depthFor?: (sprite: Phaser.GameObjects.Sprite) => number;
};

function labelStyle(color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: 'monospace',
    fontSize: '11px',
    color,
    backgroundColor: '#18213bcc',
    padding: { x: 4, y: 2 },
    stroke: '#101426',
    strokeThickness: 2,
  };
}

/** Shared multiplayer renderer/controller for every free-roaming world scene. */
export class WorldMultiplayer {
  private readonly scene: Phaser.Scene;
  private readonly sceneId: WorldSceneId;
  private readonly localPlayer: Phaser.Physics.Arcade.Sprite;
  private readonly pet: Pet;
  private readonly cancelLocalMovement: () => void;
  private readonly networkOffsetX: number;
  private readonly networkOffsetY: number;
  private readonly depthFor: (sprite: Phaser.GameObjects.Sprite) => number;
  private readonly localMarker: Phaser.GameObjects.Ellipse;
  private readonly remotes = new Map<string, RemoteAvatar>();
  private readonly unsubscribe: () => void;
  private readonly releaseWorld: () => void;
  private lastPose: PresencePose;
  private lastSentAt = -Infinity;
  private localWaveStartedAt: number | null = null;
  private disposed = false;

  constructor(scene: Phaser.Scene, options: WorldMultiplayerOptions) {
    this.scene = scene;
    this.sceneId = options.sceneId;
    this.localPlayer = options.localPlayer;
    this.pet = options.pet;
    this.cancelLocalMovement = options.cancelLocalMovement;
    this.networkOffsetX = options.networkOffsetX ?? 0;
    this.networkOffsetY = options.networkOffsetY ?? 0;
    this.depthFor = options.depthFor ?? feetDepth;
    this.localMarker = scene.add
      .ellipse(this.localPlayer.x, this.localPlayer.y + 12, 46, 18, 0x2d8cff, 0.34)
      .setStrokeStyle(3, 0x66b6ff, 0.98)
      .setDepth(this.depthFor(this.localPlayer) - 1);

    const pose = this.currentPose('down', false);
    this.lastPose = { ...pose, sentAt: scene.time.now };
    this.releaseWorld = multiplayerBridge.activateWorld(this.sceneId, pose);
    this.unsubscribe = multiplayerBridge.subscribe((rows) => this.syncRows(rows));

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.dispose, this);
  }

  private currentPose(facing: WorldPose['facing'], moving: boolean): WorldPose {
    const pose: WorldPose = {
      x: this.localPlayer.x,
      y: this.localPlayer.y,
      petX: this.pet.sprite.x,
      petY: this.pet.sprite.y,
      facing,
      moving,
    };
    return translateWorldCoordinates(
      pose,
      -this.networkOffsetX,
      -this.networkOffsetY,
    );
  }

  applyCorrection() {
    const correction = multiplayerBridge.consumePositionCorrection(this.sceneId);
    if (!correction) return false;
    if (correction.sceneId !== this.sceneId) {
      this.cancelLocalMovement();
      this.scene.scene.start(phaserWorldSceneKey(correction.sceneId));
      return true;
    }
    const localCorrection = translateWorldCoordinates(
      correction,
      this.networkOffsetX,
      this.networkOffsetY,
    );
    this.cancelLocalMovement();
    this.localPlayer.setPosition(localCorrection.x, localCorrection.y).setVelocity(0, 0);
    this.pet.sprite.setPosition(localCorrection.petX, localCorrection.petY);
    return true;
  }

  update(facing: WorldPose['facing'], moving: boolean, deltaMs: number) {
    if (this.disposed) return;
    const now = this.scene.time.now;
    const pose = this.currentPose(facing, moving);
    const nextPresence: PresencePose = {
      ...pose,
      sentAt: now,
    };
    if (shouldSendPresence(this.lastPose, nextPresence, now, this.lastSentAt)) {
      multiplayerBridge.send(pose);
      this.lastPose = nextPresence;
      this.lastSentAt = now;
    }

    this.localMarker
      .setPosition(
        this.localPlayer.x,
        this.localPlayer.y + this.localPlayer.displayHeight / 2 - 3,
      )
      .setDepth(this.depthFor(this.localPlayer) - 1);
    this.applyLocalWave(now);
    for (const remote of this.remotes.values()) this.updateRemote(remote, now, deltaMs);
  }

  playLocalWave() {
    if (this.disposed) return;
    this.cancelLocalMovement();
    this.localPlayer.setVelocity(0, 0);
    this.localWaveStartedAt = this.scene.time.now;
    this.applyLocalWave(this.scene.time.now);
  }

  waveTo(remote: RemotePresence | string) {
    const avatar = typeof remote === 'string' ? this.remotes.get(remote) : this.remotes.get(remote.sessionId);
    if (!avatar || !canInitiateWave(
      { x: this.localPlayer.x, y: this.localPlayer.y },
      { x: avatar.player.x, y: avatar.player.y },
      avatar.row.active,
      REMOTE_INTERACTION_RADIUS,
    )) return;
    this.playLocalWave();
    multiplayerBridge.wave(avatar.row.sessionId);
    toast(this.scene, this.localPlayer.x, this.localPlayer.y - 70, `You wave to ${avatar.row.name}!`, '#ffe066');
  }

  getRemoteInteractable(): RemoteInteractable | null {
    let nearest: RemoteAvatar | null = null;
    let nearestDistance = Infinity;
    for (const remote of this.remotes.values()) {
      if (!remote.row.active) continue;
      const distance = Phaser.Math.Distance.Between(
        this.localPlayer.x,
        this.localPlayer.y,
        remote.player.x,
        remote.player.y,
      );
      if (distance <= REMOTE_INTERACTION_RADIUS && distance < nearestDistance) {
        nearest = remote;
        nearestDistance = distance;
      }
    }
    if (!nearest) return null;
    const selected = nearest;
    return {
      x: selected.player.x,
      y: selected.player.y,
      radius: REMOTE_INTERACTION_RADIUS,
      label: `E / Space / click — Wave to ${selected.row.name}`,
      action: () => this.waveTo(selected.row.sessionId),
      targets: [selected.player],
    };
  }

  private applyLocalWave(now: number) {
    if (this.localWaveStartedAt === null) return;
    const frame = waveAnimationFrame(now - this.localWaveStartedAt);
    if (frame === null) {
      this.localWaveStartedAt = null;
      return;
    }
    this.localPlayer.stop().setFlipX(false).setTexture(LOCAL_PENGUIN_WAVE_TEXTURE_KEY, frame);
  }

  private syncRows(rows: RemotePresence[]) {
    if (this.disposed) return;
    const visible = new Set<string>();
    for (const row of rows) {
      if (row.sceneId !== this.sceneId || (!row.active && !row.activity)) continue;
      visible.add(row.sessionId);
      const existing = this.remotes.get(row.sessionId);
      if (!existing) this.createRemote(row);
      else this.refreshRemote(existing, row);
    }
    for (const [sessionId, remote] of this.remotes) {
      if (!visible.has(sessionId)) this.destroyRemote(sessionId, remote);
    }
  }

  private createRemote(row: RemotePresence) {
    const local = this.localPresence(row);
    ensureRemotePenguinTextures(this.scene, row.penguinColor);
    const color = normalizeColor(row.penguinColor);
    const petSpecies = migratePetSpecies(row.petSpecies);
    const player = this.scene.add
      .sprite(local.x, local.y, remotePenguinTextureKey(row.facing, color), 0)
      .setScale(penguinDrawScale(this.scene))
      .setInteractive({ useHandCursor: true });
    const pet = this.scene.add
      .sprite(local.petX, local.petY, petTextureKey(petSpecies, 'idle1'))
      .setScale(petDrawScale(this.scene, petSpecies));
    const presentation = remotePlayerPresentation(row);
    const playerLabel = this.scene.add
      .text(local.x, local.y, presentation.playerLabel, labelStyle(presentation.labelColor))
      .setOrigin(0.5, 1);
    const petLabel = this.scene.add
      .text(local.petX, local.petY, presentation.petLabel, labelStyle('#bfe6ff'))
      .setOrigin(0.5, 0);
    const remote: RemoteAvatar = {
      row,
      player,
      pet,
      playerLabel,
      petLabel,
      petSpecies,
      color,
      accessories: [],
      accessoryKey: '',
      accessoryRetryAt: 0,
      lastWaveId: row.waveId,
      waveStartedAt: null,
    };
    player.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      handleRemotePlayerPointerDown(event, this.cancelLocalMovement, () => this.waveTo(row.sessionId));
    });
    this.remotes.set(row.sessionId, remote);
    this.refreshRemote(remote, row);
  }

  private refreshRemote(remote: RemoteAvatar, row: RemotePresence) {
    const previousWaveId = remote.lastWaveId;
    remote.row = row;
    const presentation = remotePlayerPresentation(row);
    remote.playerLabel.setText(presentation.playerLabel).setColor(presentation.labelColor);
    remote.petLabel.setText(presentation.petLabel);
    remote.player.setAlpha(presentation.alpha);
    remote.pet.setAlpha(presentation.alpha);
    remote.playerLabel.setAlpha(presentation.alpha);
    remote.petLabel.setAlpha(presentation.alpha);
    if (presentation.interactive) remote.player.setInteractive({ useHandCursor: true });
    else remote.player.disableInteractive();

    const color = normalizeColor(row.penguinColor);
    if (color !== remote.color) {
      ensureRemotePenguinTextures(this.scene, color);
      remote.color = color;
      remote.player.stop().setTexture(remotePenguinTextureKey(row.facing, color), 0);
    }
    const species = migratePetSpecies(row.petSpecies);
    if (species !== remote.petSpecies) {
      remote.petSpecies = species;
      remote.pet.stop().setTexture(petTextureKey(species, 'idle1')).setScale(petDrawScale(this.scene, species));
    }
    this.refreshRemoteAccessories(remote);

    if (isNewWaveForLocalPlayer(previousWaveId, row.waveId, row.waveTarget, row.localSessionId)) {
      remote.waveStartedAt = this.scene.time.now;
      toast(this.scene, remote.player.x, remote.player.y - remote.player.displayHeight / 2, `${row.name} waves hello!`, '#bfe6ff');
    }
    remote.lastWaveId = row.waveId;
  }

  private refreshRemoteAccessories(remote: RemoteAvatar) {
    const key = `${remote.petSpecies}:${JSON.stringify(remote.row.equippedAccessories)}`;
    if (key === remote.accessoryKey) return;
    if (this.scene.time.now < remote.accessoryRetryAt) return;

    const desired: Array<{ id: AccessoryId; texture: string }> = [];
    for (const id of Object.values(remote.row.equippedAccessories)) {
      if (!id) continue;
      const def = ACCESSORIES[id];
      if (!def || !remotePetCanWear(remote.petSpecies, id)) continue;
      if (!this.scene.textures.exists(def.texture)) {
        remote.accessoryRetryAt = this.scene.time.now + 1_000;
        return;
      }
      desired.push({ id, texture: def.texture });
    }

    remote.accessoryRetryAt = 0;
    for (const accessory of remote.accessories) accessory.image.destroy();
    remote.accessories = desired.map(({ id, texture }) => ({
      id,
      image: this.scene.add.image(remote.pet.x, remote.pet.y, texture).setOrigin(0.5, 0.5),
    }));
    remote.accessoryKey = key;
  }

  private syncRemoteAccessories(remote: RemoteAvatar) {
    const sprite = remote.pet;
    const frameIndex = sprite.anims.currentFrame?.index ?? 0;
    const walking = sprite.anims.currentAnim?.key.endsWith('-walk') && sprite.anims.isPlaying;
    const bob = walking && frameIndex % 2 === 1 ? sprite.scaleY : 0;
    const speciesNudges = SPECIES_ACCESSORY_NUDGE[remote.petSpecies];
    for (const { id, image } of remote.accessories) {
      const layout = ACCESSORY_LAYOUT[id];
      const nudge = speciesNudges?.[id];
      const nx = (nudge?.x ?? 0) * sprite.scaleX;
      const ny = (nudge?.y ?? 0) * sprite.scaleX;
      const ox = ((layout?.offsetX ?? 0) + nx) * (sprite.flipX ? -1 : 1);
      const oy = (layout?.offsetY ?? 0) + ny;
      image
        .setPosition(sprite.x + ox, sprite.y + oy + bob)
        .setScale(sprite.scaleX * (layout?.scale ?? 1))
        .setFlipX(sprite.flipX)
        .setVisible(sprite.visible)
        .setAlpha(sprite.alpha)
        .setDepth(this.depthFor(sprite) + 1);
    }
  }

  private updateRemote(remote: RemoteAvatar, now: number, deltaMs: number) {
    this.refreshRemoteAccessories(remote);
    const local = this.localPresence(remote.row);
    const playerFrom = { x: remote.player.x, y: remote.player.y };
    const playerDecision = remoteMovementDecision(
      playerFrom,
      local,
      remote.row.facing,
      remote.row.moving,
      remote.player.flipX,
    );
    const playerPosition = stepRemotePosition(playerFrom, local, deltaMs);
    remote.player.setPosition(playerPosition.x, playerPosition.y).setFlipX(playerDecision.flipX);

    const waveFrame = remote.waveStartedAt === null ? null : waveAnimationFrame(now - remote.waveStartedAt);
    if (remote.waveStartedAt !== null && waveFrame === null) remote.waveStartedAt = null;
    if (waveFrame !== null) {
      remote.player.stop().setFlipX(false).setTexture(remotePenguinWaveTextureKey(remote.color), waveFrame);
    } else if (playerDecision.walking) {
      remote.player.play(remotePenguinWalkAnimKey(playerDecision.facing, remote.color), true);
    } else {
      remote.player.stop().setTexture(remotePenguinTextureKey(playerDecision.facing, remote.color), 0);
    }

    const petFrom = { x: remote.pet.x, y: remote.pet.y };
    const petTarget = { x: local.petX, y: local.petY };
    const petDecision = remotePetMovementDecision(petFrom, petTarget, remote.pet.flipX);
    const petPosition = stepRemotePosition(petFrom, petTarget, deltaMs);
    remote.pet.setPosition(petPosition.x, petPosition.y).setFlipX(petDecision.flipX);
    if (petDecision.walking) remote.pet.play(petAnimKey(remote.petSpecies, 'walk'), true);
    else remote.pet.stop().setTexture(petTextureKey(remote.petSpecies, 'idle1'));
    this.syncRemoteAccessories(remote);

    remote.player.setDepth(this.depthFor(remote.player));
    remote.pet.setDepth(this.depthFor(remote.pet));
    remote.playerLabel
      .setPosition(remote.player.x, remote.player.y - remote.player.displayHeight / 2 - 4)
      .setDepth(this.depthFor(remote.player) + 2);
    remote.petLabel
      .setPosition(remote.pet.x, remote.pet.y + remote.pet.displayHeight / 2 + 3)
      .setDepth(this.depthFor(remote.pet) + 2);
  }

  private localPresence(row: RemotePresence): RemotePresence {
    return translateWorldCoordinates(row, this.networkOffsetX, this.networkOffsetY);
  }

  private destroyRemote(sessionId: string, remote: RemoteAvatar) {
    for (const accessory of remote.accessories) accessory.image.destroy();
    remote.player.destroy();
    remote.pet.destroy();
    remote.playerLabel.destroy();
    remote.petLabel.destroy();
    this.remotes.delete(sessionId);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this);
    this.scene.events.off(Phaser.Scenes.Events.DESTROY, this.dispose, this);
    this.unsubscribe();
    this.releaseWorld();
    this.localMarker.destroy();
    for (const [sessionId, remote] of this.remotes) this.destroyRemote(sessionId, remote);
  }
}

function remotePetCanWear(species: PetSpecies, id: AccessoryId) {
  const wear = accessoryWearable(ACCESSORIES[id]);
  if (wear === 'penguin') return false;
  if (wear === 'puffle') return isPuffleSpecies(species);
  if (wear === 'classic') return isClassicSpecies(species);
  return species === wear;
}

function normalizeColor(color: string) {
  // ensureRemotePenguinTextures and texture-key helpers apply the same fallback;
  // deriving it from the final key avoids exporting palette internals here.
  return remotePenguinTextureKey('down', color).split('-')[2] ?? 'blue';
}
