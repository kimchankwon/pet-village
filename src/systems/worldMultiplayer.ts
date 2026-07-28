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
  approachPointForWave,
  handleRemotePlayerPointerDown,
  canInitiateWave,
  isNewWave,
  pendingWaveDecision,
  isNewWaveForLocalPlayer,
  normalizePenguinColor,
  positionCorrectionAction,
  LOCAL_PENGUIN_WAVE_TEXTURE_KEY,
  remoteMovementDecision,
  remotePetMovementDecision,
  remotePlayerPresentation,
  remotePenguinTextureKey,
  remotePenguinWalkAnimKey,
  remotePenguinWaveTextureKey,
  stepRemotePosition,
  visibleSceneRows,
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
import { localDisplayName } from './localProfile';
import { State } from './GameState';
import { toast } from './UI';
import { isPointerUiBlocked, isUiBlocked } from './nav';
import { ChatComposer } from './chatComposer';
import { ChatLogView } from './chatLogView';
import { appendChatLog } from './chatLog';
import { chatBubbleAlpha, chatBubbleDurationMs, isNewChat } from './chat';
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
  chat: ChatBubble;
  lastChatId?: string;
};

/** One speech bubble and how long it still has to live. */
type ChatBubble = {
  text: Phaser.GameObjects.Text;
  startedAt: number | null;
  durationMs: number;
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
  /**
   * Walk the local player somewhere — used to close in on a wave target.
   * `quiet` suppresses the click marker, for the re-aims of a walk in progress.
   */
  moveLocalTo?: (x: number, y: number, quiet: boolean) => void;
  /** True while the local player is still walking to a click-move target. */
  isLocalMoving?: () => boolean;
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

/**
 * Speech bubbles sit above the nametag and are deliberately louder than it:
 * wider, brighter, and centred, because a message is the thing you are meant to
 * read. Wrapping keeps a long line from spilling across the scene.
 */
function chatBubbleStyle(): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#ffffff',
    backgroundColor: '#2b2145ee',
    padding: { x: 7, y: 5 },
    align: 'center',
    wordWrap: { width: 176 },
    stroke: '#101426',
    strokeThickness: 3,
  };
}

function createChatBubble(scene: Phaser.Scene, x: number, y: number): ChatBubble {
  return {
    text: scene.add.text(x, y, '', chatBubbleStyle()).setOrigin(0.5, 1).setVisible(false),
    startedAt: null,
    durationMs: 0,
  };
}

/** Start a bubble's stay on screen; longer messages get longer. */
function showChatBubble(bubble: ChatBubble, text: string, now: number) {
  bubble.text.setText(text).setVisible(true).setAlpha(1);
  bubble.startedAt = now;
  bubble.durationMs = chatBubbleDurationMs(text);
}

/**
 * Keep a bubble over its owner's nametag, or retire it once its time is up.
 * `labelTop` is the top edge of the nametag, so the two never overlap.
 */
function drawChatBubble(bubble: ChatBubble, x: number, labelTop: number, depth: number, now: number) {
  if (bubble.startedAt === null) return;
  const alpha = chatBubbleAlpha(now - bubble.startedAt, bubble.durationMs);
  if (alpha === null) {
    bubble.startedAt = null;
    bubble.text.setVisible(false);
    return;
  }
  bubble.text.setPosition(x, labelTop - 2).setAlpha(alpha).setDepth(depth);
}

/** Shared multiplayer renderer/controller for every free-roaming world scene. */
export class WorldMultiplayer {
  private readonly scene: Phaser.Scene;
  private readonly sceneId: WorldSceneId;
  private readonly localPlayer: Phaser.Physics.Arcade.Sprite;
  private readonly pet: Pet;
  private readonly cancelLocalMovement: () => void;
  private readonly moveLocalTo?: (x: number, y: number, quiet: boolean) => void;
  private readonly isLocalMoving?: () => boolean;
  private readonly networkOffsetX: number;
  private readonly networkOffsetY: number;
  private readonly depthFor: (sprite: Phaser.GameObjects.Sprite) => number;
  private readonly localMarker: Phaser.GameObjects.Ellipse;
  private readonly localPlayerLabel: Phaser.GameObjects.Text;
  private readonly localChat: ChatBubble;
  private readonly chatComposer: ChatComposer;
  private readonly chatLog: ChatLogView;
  private readonly remotes = new Map<string, RemoteAvatar>();
  private readonly unsubscribe: () => void;
  private readonly releaseWorld: () => void;
  private lastPose: PresencePose;
  private lastSentAt = -Infinity;
  private localWaveStartedAt: number | null = null;
  private pendingWave: {
    sessionId: string;
    startedAt: number;
    /** Where the target stood when this leg was aimed, to spot them moving on. */
    aimedAt: { x: number; y: number };
  } | null = null;
  private disposed = false;

  constructor(scene: Phaser.Scene, options: WorldMultiplayerOptions) {
    this.scene = scene;
    this.sceneId = options.sceneId;
    this.localPlayer = options.localPlayer;
    this.pet = options.pet;
    this.cancelLocalMovement = options.cancelLocalMovement;
    this.moveLocalTo = options.moveLocalTo;
    this.isLocalMoving = options.isLocalMoving;
    this.networkOffsetX = options.networkOffsetX ?? 0;
    this.networkOffsetY = options.networkOffsetY ?? 0;
    this.depthFor = options.depthFor ?? feetDepth;
    this.localMarker = scene.add
      .ellipse(this.localPlayer.x, this.localPlayer.y + 12, 46, 18, 0x2d8cff, 0.34)
      .setStrokeStyle(3, 0x66b6ff, 0.98)
      .setDepth(this.depthFor(this.localPlayer) - 1);
    // Your own nametag, on the same terms as everyone else's: always on, at any
    // distance, so a crowd reads the same way from either side of it. Your pet
    // already carries its own label (see Pet), so this is the player only.
    this.localPlayerLabel = scene.add
      .text(this.localPlayer.x, this.localPlayer.y, localDisplayName(), labelStyle('#ffe066'))
      .setOrigin(0.5, 1);
    this.localChat = createChatBubble(scene, this.localPlayer.x, this.localPlayer.y);
    // T is claimed here rather than in each scene: every world scene builds one
    // of these, so chat arrives everywhere at once.
    this.chatComposer = new ChatComposer(scene, {
      canOpen: () => !this.disposed && !isUiBlocked(),
      onSend: (text) => this.say(text),
    });
    // Built here for the same reason: every world scene has one, so the log is
    // wherever you are.
    this.chatLog = new ChatLogView(scene);

    const pose = this.currentPose('down', false);
    this.lastPose = { ...pose, sentAt: scene.time.now };
    this.releaseWorld = multiplayerBridge.activateWorld(this.sceneId, pose);
    this.unsubscribe = multiplayerBridge.subscribe((rows) => this.syncRows(rows));

    // Clicking a remote penguin stops propagation, so this only fires for clicks
    // elsewhere — exactly the gesture that should call off an approach.
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.cancelPendingWave, this);

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
    const action = positionCorrectionAction(correction, this.sceneId);
    if (action === 'ignore' || !correction) return false;
    if (action === 'switch-scene') {
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
    this.updateLocalLabel();
    this.chatComposer.update(now);
    this.chatLog.update();
    drawChatBubble(
      this.localChat,
      this.localPlayer.x,
      this.localPlayerLabel.y - this.localPlayerLabel.height,
      this.depthFor(this.localPlayer) + 3,
      now,
    );
    this.applyLocalWave(now);
    for (const remote of this.remotes.values()) this.updateRemote(remote, now, deltaMs);
    this.updatePendingWave(now);
  }

  private updateLocalLabel() {
    this.localPlayerLabel
      .setText(localDisplayName())
      .setPosition(this.localPlayer.x, this.localPlayer.y - this.localPlayer.displayHeight / 2 - 4)
      .setDepth(this.depthFor(this.localPlayer) + 2);
  }

  /** True while the chat composer has the keyboard. */
  isChatting() {
    return this.chatComposer.isOpen();
  }

  /** Open the composer from the bottom bar's Chat button, as T would. */
  openChat() {
    return this.chatComposer.requestOpen();
  }

  /**
   * Send what the composer collected. Peers see it through the room state; the
   * sender's own bubble is shown here, because the local session is filtered out
   * of the presence snapshot. The bridge owns the cooldown and the connection
   * check and says whether the message really went out, so the bubble is never
   * shown for one the server would have dropped.
   */
  private say(text: string) {
    if (!multiplayerBridge.chat(text)) return false;
    showChatBubble(this.localChat, text, this.scene.time.now);
    appendChatLog({ kind: 'message', name: localDisplayName(), text, at: performance.now() });
    return true;
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
    if (!avatar || !avatar.row.active) return;
    if (!canInitiateWave(
      { x: this.localPlayer.x, y: this.localPlayer.y },
      { x: avatar.player.x, y: avatar.player.y },
      avatar.row.active,
      REMOTE_INTERACTION_RADIUS,
    )) {
      this.approach(avatar);
      return;
    }
    this.pendingWave = null;
    this.playLocalWave();
    multiplayerBridge.wave(avatar.row.sessionId);
    toast(this.scene, this.localPlayer.x, this.localPlayer.y - 70, `You wave to ${avatar.row.name}!`, '#ffe066');
  }

  /** Called off by any click elsewhere, and when the scene tears down. */
  cancelPendingWave() {
    this.pendingWave = null;
  }

  /** Walk over to someone clicked from too far away; the wave fires on arrival. */
  private approach(avatar: RemoteAvatar) {
    if (!this.moveLocalTo) return;
    const target = approachPointForWave(
      { x: this.localPlayer.x, y: this.localPlayer.y },
      { x: avatar.player.x, y: avatar.player.y },
      REMOTE_INTERACTION_RADIUS,
    );
    const queued = this.pendingWave?.sessionId === avatar.row.sessionId;
    this.pendingWave = {
      sessionId: avatar.row.sessionId,
      startedAt: queued ? this.pendingWave!.startedAt : this.scene.time.now,
      aimedAt: { x: avatar.player.x, y: avatar.player.y },
    };
    // Only the first leg pings the click marker: re-aiming at someone who keeps
    // walking would restamp the ring under your feet over and over.
    this.moveLocalTo(target.x, target.y, queued);
    if (!queued) {
      toast(this.scene, this.localPlayer.x, this.localPlayer.y - 70, `Walking over to ${avatar.row.name}…`, '#bfe6ff');
    }
  }

  private updatePendingWave(now: number) {
    const pending = this.pendingWave;
    if (!pending) return;
    const avatar = this.remotes.get(pending.sessionId);
    const decision = pendingWaveDecision({
      present: Boolean(avatar),
      active: Boolean(avatar?.row.active),
      distance: avatar
        ? Phaser.Math.Distance.Between(this.localPlayer.x, this.localPlayer.y, avatar.player.x, avatar.player.y)
        : Infinity,
      radius: REMOTE_INTERACTION_RADIUS,
      walking: this.isLocalMoving?.() ?? false,
      elapsedMs: now - pending.startedAt,
      targetMovedPx: avatar
        ? Phaser.Math.Distance.Between(pending.aimedAt.x, pending.aimedAt.y, avatar.player.x, avatar.player.y)
        : 0,
    });
    if (decision === 'walking') return;
    if (decision === 'cancel' || !avatar) {
      this.pendingWave = null;
      return;
    }
    if (decision === 'wave') this.waveTo(avatar.row.sessionId);
    // They kept walking and we ran out of path: aim at where they are now.
    else this.approach(avatar);
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

  /** True while the local wave one-shot is playing (scenes suppress input). */
  isWaving() {
    return this.localWaveStartedAt !== null;
  }

  private applyLocalWave(now: number) {
    if (this.localWaveStartedAt === null) return;
    const frame = waveAnimationFrame(now - this.localWaveStartedAt);
    if (frame === null) {
      this.localWaveStartedAt = null;
      return;
    }
    // Scene movement runs before this, so hold the penguin still every frame —
    // otherwise the wave plays while the player slides.
    this.localPlayer.setVelocity(0, 0);
    this.localPlayer.stop().setFlipX(false).setTexture(LOCAL_PENGUIN_WAVE_TEXTURE_KEY, frame);
  }

  private syncRows(rows: RemotePresence[]) {
    if (this.disposed) return;
    const visible = new Set<string>();
    for (const row of visibleSceneRows(rows, this.sceneId)) {
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
    const color = normalizePenguinColor(row.penguinColor);
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
      .setOrigin(0.5, 1);
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
      chat: createChatBubble(this.scene, local.x, local.y),
      lastChatId: row.chatId,
    };
    player.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      if (isPointerUiBlocked()) return;
      handleRemotePlayerPointerDown(event, this.cancelLocalMovement, () => this.waveTo(row.sessionId));
    });
    this.remotes.set(row.sessionId, remote);
    this.refreshRemote(remote, row);
  }

  private refreshRemote(remote: RemoteAvatar, row: RemotePresence) {
    const previousWaveId = remote.lastWaveId;
    const previousChatId = remote.lastChatId;
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

    const color = normalizePenguinColor(row.penguinColor);
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

    // Everyone nearby sees the flipper go up; only the target gets the toast.
    if (isNewWave(previousWaveId, row.waveId)) remote.waveStartedAt = this.scene.time.now;
    if (isNewWaveForLocalPlayer(previousWaveId, row.waveId, row.waveTarget, row.localSessionId)) {
      toast(this.scene, remote.player.x, remote.player.y - remote.player.displayHeight / 2, `${row.name} waves hello!`, '#bfe6ff');
    }
    remote.lastWaveId = row.waveId;

    // A message shows once: the id changes per send, so a state patch about
    // someone walking must not replay the bubble they posted a minute ago.
    if (isNewChat(previousChatId, row.chatId) && row.chatText) {
      showChatBubble(remote.chat, row.chatText, this.scene.time.now);
      // The log keeps what the bubble lets go of, and keeps exactly what the
      // bubble showed: someone two scenes away is not in earshot either way.
      appendChatLog({ kind: 'message', name: row.name, text: row.chatText, at: performance.now() });
    }
    remote.lastChatId = row.chatId;
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
      .setPosition(remote.pet.x, remote.pet.y - remote.pet.displayHeight / 2 - 3)
      .setDepth(this.depthFor(remote.pet) + 2);
    drawChatBubble(
      remote.chat,
      remote.player.x,
      remote.playerLabel.y - remote.playerLabel.height,
      this.depthFor(remote.player) + 3,
      now,
    );
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
    remote.chat.text.destroy();
    this.remotes.delete(sessionId);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this);
    this.scene.events.off(Phaser.Scenes.Events.DESTROY, this.dispose, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.cancelPendingWave, this);
    this.unsubscribe();
    this.releaseWorld();
    this.pendingWave = null;
    this.chatComposer.dispose();
    this.chatLog.dispose();
    this.localMarker.destroy();
    this.localPlayerLabel.destroy();
    this.localChat.text.destroy();
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

