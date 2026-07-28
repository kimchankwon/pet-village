import Phaser from 'phaser';
import {
  SLED_DIFFICULTIES,
  SLED_COUNTDOWN_MS,
  SLED_MAX_PLAYERS,
  SLED_PROGRESS_TO_PIXELS,
  generateSledCourse,
  sledDifficultyConfig,
  type SledCourseItem,
  type SledDifficulty,
  type SledEffect,
} from '@pet-village/multiplayer-protocol';
import { configurePlayerPenguin, generateTextures } from '../sprites/pixelart';
import { bindGameActivity } from '../systems/multiplayerGameActivity';
import { hasMultiplayerTicketIssuer, requestMultiplayerTicket } from '../systems/multiplayerTickets';
import {
  connectSledRun,
  type SledRacerSnapshot,
  type SledRunConnection,
  type SledRunSnapshot,
} from '../systems/sledRunClient';
import { SteerAckClock, SteerTrace } from '../systems/sledRunLatency';
import { newLocalSled, stepLocalSled, type LocalSled } from '../systems/sledLocalSled';
import { shouldSendSteer, steerAxisFrom } from '../systems/sledRunPolicy';
import {
  reconcileLocalProgress,
  reconcileLocalX,
  stepSledMotion,
  type SledMotion,
} from '../systems/sledRunPrediction';
import { sledRunReward } from '../systems/sledRunRewards';
import { State } from '../systems/GameState';

const COLOR_TINT: Record<string, number> = {
  blue: 0x58a6ff, green: 0x53d769, pink: 0xff7eb6, black: 0x5d6470,
  red: 0xf2545b, purple: 0x9b6dff, orange: 0xffa43a, darkpurple: 0x65449c,
  brown: 0x9b6a43, peach: 0xffb38a, darkgreen: 0x2f8b57, lightblue: 0x84d8ff,
};

export class SledRunScene extends Phaser.Scene {
  private snapshot?: SledRunSnapshot;
  private connection?: SledRunConnection;
  private sceneEpoch = 0;
  private solo = false;
  /** Our own sled, simulated here: its lane, its speed, and the things it hits. */
  private localSled: LocalSled = newLocalSled(0);
  /** Items this run has already bumped us, so a wide rock only counts once. */
  private claimedItems = new Set<string>();
  private course: SledCourseItem[] = [];
  private courseKey = '';
  private racerViews = new Map<string, Phaser.GameObjects.Container>();
  /** Predicted motion per racer, so steering shows up before the server agrees. */
  private motions = new Map<string, SledMotion>();
  /** Round trip measured from the input echoes, for aligning snapshots in time. */
  private ackClock = new SteerAckClock();
  /** The lanes we predicted, so a snapshot is judged against its own moment. */
  private steerTrace = new SteerTrace();
  /** When the newest snapshot landed, so followers know how stale it is. */
  private snapshotAt = 0;
  private courseGraphics!: Phaser.GameObjects.Graphics;
  private queueText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Text;
  private parkButton!: Phaser.GameObjects.Text;
  private difficultyButtons: Phaser.GameObjects.Text[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private previousSteering: -1 | 0 | 1 = 0;
  private lastSteerSentAt = 0;
  private localCountdownEnd = 0;
  private previousPhase = '';
  private previousRound = -1;
  private rewardText = '';
  private lobbyNote = '';
  private disconnected = false;
  /** Dropped but still trying: nothing we predict now can be sent or believed. */
  private reconnecting = false;
  /** Take the next snapshot as the truth rather than reconciling toward it. */
  private resyncFromServer = false;

  constructor() {
    super('SledRun');
  }

  create() {
    generateTextures(this);
    bindGameActivity(this, 'SledRun');
    this.sceneEpoch += 1;
    const epoch = this.sceneEpoch;
    this.snapshot = undefined;
    this.connection = undefined;
    this.solo = false;
    this.localSled = newLocalSled(0);
    this.claimedItems.clear();
    this.course = [];
    this.courseKey = '';
    this.racerViews.clear();
    this.motions.clear();
    this.ackClock = new SteerAckClock();
    this.steerTrace = new SteerTrace();
    this.snapshotAt = 0;
    this.previousPhase = '';
    this.previousRound = -1;
    this.rewardText = '';
    this.lobbyNote = '';
    this.disconnected = false;
    this.reconnecting = false;
    this.resyncFromServer = false;
    this.cameras.main.setBackgroundColor('#79bee7');
    this.drawMountain();
    this.courseGraphics = this.add.graphics().setDepth(20);
    this.buildUi();

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyEsc = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.sceneEpoch += 1;
      void this.connection?.disconnect();
      this.connection = undefined;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

    if (hasMultiplayerTicketIssuer() && import.meta.env.VITE_MULTIPLAYER_URL) {
      this.statusText.setText('Connecting to the mountain…');
      void this.connect(epoch);
    } else {
      this.startSolo('Solo practice • multiplayer unavailable');
    }
  }

  private async connect(epoch: number) {
    try {
      const ticket = await requestMultiplayerTicket();
      const connection = await connectSledRun(ticket, () => this.sceneEpoch === epoch && this.scene.isActive());
      if (this.sceneEpoch !== epoch) {
        await connection.disconnect();
        return;
      }
      this.connection = connection;
      connection.onState((snapshot) => {
        if (this.sceneEpoch !== epoch) return;
        this.acceptSnapshot(snapshot);
      });
      connection.onConnectionState((state) => {
        if (this.sceneEpoch !== epoch) return;
        if (state === 'reconnecting') {
          // Steering does not reach the server while dropped, so predicting on it
          // would build a lane nobody else will ever agree with.
          this.reconnecting = true;
          this.statusText.setText('Connection lost • reconnecting…');
        } else if (state === 'connected') {
          const resumed = this.reconnecting;
          this.disconnected = false;
          this.reconnecting = false;
          this.lastSteerSentAt = Number.NEGATIVE_INFINITY;
          this.previousSteering = 0;
          // Inputs sent into the drop were never applied and the round trip across
          // it means nothing: take the first snapshot back as the sled's real lane
          // and measure the connection again from there.
          if (resumed) {
            this.resyncFromServer = true;
            this.ackClock = new SteerAckClock();
            this.steerTrace.clear();
          }
        } else {
          const interrupted = this.snapshot?.phase === 'countdown' || this.snapshot?.phase === 'racing';
          this.connection = undefined;
          if (interrupted) {
            this.disconnected = true;
            this.refreshUi();
          } else {
            this.startSolo('Solo practice • multiplayer disconnected');
          }
        }
      });
    } catch (error) {
      if (this.sceneEpoch !== epoch) return;
      console.warn('Sled Run multiplayer unavailable; using solo practice', error);
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? Number((error as { code?: unknown }).code)
        : undefined;
      const reason = code === 426
        ? 'Update required for multiplayer • solo practice'
        : code === 409
          ? 'Already racing in another tab • solo practice'
          : code === 403
            ? 'Online races are busy • solo practice'
            : 'Connection unavailable • solo practice';
      this.startSolo(reason);
    }
  }

  private startSolo(note: string) {
    this.solo = true;
    this.lobbyNote = note;
    const snapshot: SledRunSnapshot = {
      localSessionId: 'solo', phase: 'lobby', leader: 'solo', difficulty: 'easy', seed: '',
      countdownAt: 0, startedAt: 0, serverTime: Date.now(), round: 0,
      racers: [{
        sessionId: 'solo', userId: 'solo', displayName: 'You', penguinColor: 'blue',
        x: 0, progress: 0, speed: 0, steering: 0, inputSeq: 0,
        effect: '', effectUntil: 0, rank: 0, finishedAt: 0,
      }],
    };
    this.snapshot = snapshot;
    this.acceptSnapshot(snapshot);
  }

  private acceptSnapshot(snapshot: SledRunSnapshot) {
    this.snapshot = snapshot;
    this.snapshotAt = this.time.now;
    const nextCourseKey = `${snapshot.seed}:${snapshot.difficulty}:${snapshot.round}`;
    if (snapshot.seed && nextCourseKey !== this.courseKey) {
      this.courseKey = nextCourseKey;
      this.course = generateSledCourse(snapshot.seed, snapshot.difficulty);
    }
    if (snapshot.phase !== this.previousPhase || snapshot.round !== this.previousRound) {
      if (snapshot.phase === 'countdown') {
        this.rewardText = '';
        // Fresh run: drop last run's predicted positions instead of blending
        // every sled all the way back from the finish line.
        this.motions.clear();
        this.steerTrace.clear();
        this.ackClock.clearPending();
        this.localSled = newLocalSled(
          snapshot.racers.find((racer) => racer.sessionId === snapshot.localSessionId)?.x ?? 0,
        );
        this.claimedItems.clear();
        this.localCountdownEnd = this.time.now + Math.max(0, snapshot.countdownAt - snapshot.serverTime);
        this.previousSteering = 0;
        this.lastSteerSentAt = Number.NEGATIVE_INFINITY;
      } else if (snapshot.phase === 'racing') {
        // The start signal puts everyone at full speed. Our own sled runs its own
        // race from here, so it leaves the line at that speed too.
        this.localSled = { ...this.localSled, speed: sledDifficultyConfig(snapshot.difficulty).baseSpeed };
      } else if (snapshot.phase === 'finished' && this.previousPhase === 'racing') {
        const local = snapshot.racers.find((racer) => racer.sessionId === snapshot.localSessionId);
        const reward = local ? sledRunReward(snapshot.difficulty, local.rank) : undefined;
        if (reward) {
          State.rewardSledRun(reward.coins, reward.happiness);
          this.rewardText = ` • +${reward.coins} coins`;
        }
      }
      this.previousPhase = snapshot.phase;
      this.previousRound = snapshot.round;
    }
    this.reconcileLocalSled(snapshot);
    this.syncRacerViews();
    this.refreshUi();
  }

  /**
   * Judge a snapshot against the lane we predicted at the moment it was made —
   * one round trip back — and absorb only what is left over. The latency between
   * the key and the server cancels out here, so a held key is never dragged short
   * and a released one never creeps onward; what survives is real disagreement,
   * such as an input the server's rate limit refused.
   */
  private reconcileLocalSled(snapshot: SledRunSnapshot) {
    if (this.solo) return;
    const local = snapshot.racers.find((racer) => racer.sessionId === snapshot.localSessionId);
    if (!local) return;
    // First snapshot after a reconnect: the server kept racing without us, so
    // there is no prediction worth keeping — adopt its lane outright.
    if (this.resyncFromServer) {
      this.resyncFromServer = false;
      this.motions.set(local.sessionId, { x: local.x, progress: local.progress });
      // The race carried on without us, so the sled we were simulating is fiction:
      // take the server's, including whatever effect it has us under — its clock is
      // the snapshot's, so the expiry is re-read against ours.
      this.localSled = {
        x: local.x,
        progress: local.progress,
        speed: local.speed,
        effect: local.effect,
        effectUntil: local.effect ? this.time.now + Math.max(0, local.effectUntil - snapshot.serverTime) : 0,
      };
      this.steerTrace.clear();
      this.ackClock.clearPending();
      return;
    }
    this.ackClock.acked(local.inputSeq, this.snapshotAt);
    const motion = this.motions.get(local.sessionId);
    if (this.disconnected || this.reconnecting || snapshot.phase !== 'racing' || local.rank > 0 || !motion) return;
    // Without a measured round trip there is no moment to compare against.
    if (!this.ackClock.measured) return;
    const traced = this.steerTrace.sample(this.snapshotAt - this.ackClock.roundTripMs);
    if (traced === undefined) return;
    const { steeringSpeed, trackHalfWidth } = sledDifficultyConfig(snapshot.difficulty);
    const x = reconcileLocalX(this.localSled.x, local.x, traced, steeringSpeed, trackHalfWidth);
    // Snapshots already in flight were made before this correction, so the trace
    // they will be compared against has to move with it.
    this.steerTrace.shift(x - this.localSled.x);
    this.localSled = { ...this.localSled, x };
    this.motions.set(local.sessionId, { ...motion, x });
  }

  /**
   * Whether the drawn race is the snapshot verbatim. Solo practice writes its own
   * simulation into the snapshot, a dropped connection has nothing left to predict
   * from, and outside a race nobody is moving at all.
   */
  private get authoritativeView() {
    return this.solo || this.disconnected || this.reconnecting || this.snapshot?.phase !== 'racing';
  }

  /** The effect the player is under — ours is called here, not sent to us. */
  private get localEffect(): SledEffect {
    const snapshot = this.snapshot;
    if (!snapshot) return '';
    if (!this.authoritativeView) return this.localSled.effect;
    return snapshot.racers.find((racer) => racer.sessionId === snapshot.localSessionId)?.effect ?? '';
  }

  /** Where the crest is: above this the mountain, below it the run itself. */
  private get trackTopY() {
    return 112;
  }

  /** The sled sits high up, because the run scrolls toward the bottom of the screen. */
  private get playerY() {
    return this.scale.height * 0.44;
  }

  /** Half-width of the drawn snow path at a screen row — it widens as it nears us. */
  private trackEdgeAt(y: number) {
    const top = this.trackTopY;
    const ratio = (y - top) / Math.max(1, this.scale.height - top);
    return 265 + Phaser.Math.Clamp(ratio, 0, 1) * 105;
  }

  /**
   * Screen x for a track offset on a given row. The painted path narrows toward
   * the crest, so lane offsets have to narrow with it — drawn at a fixed scale, a
   * sled at full lock rides the snow bank up top and floats well inside the path
   * lower down. Everything on a row shares the scale, so a hit still looks like
   * one at the moment the server calls it.
   */
  private laneX(offset: number, y: number, trackHalfWidth: number) {
    const inset = 30;
    const usable = Math.max(1, this.trackEdgeAt(y) - inset);
    return this.scale.width / 2 + (offset / Math.max(1, trackHalfWidth)) * usable;
  }

  private drawMountain() {
    const width = this.scale.width;
    const height = this.scale.height;
    const center = width / 2;
    const top = this.trackTopY;
    const topEdge = this.trackEdgeAt(top);
    const bottomEdge = this.trackEdgeAt(height);
    const graphics = this.add.graphics().setDepth(-20);
    graphics.fillStyle(0x79bee7).fillRect(0, 0, width, height);
    graphics.fillStyle(0xa9d2e8, 1);
    graphics.fillTriangle(-80, 190, center * 0.35, 42, center * 0.75, 190);
    graphics.fillTriangle(center * 0.45, 190, center, 18, center * 1.42, 190);
    graphics.fillTriangle(center * 1.15, 190, center * 1.7, 55, width + 70, 190);
    graphics.fillStyle(0xf6fbff, 1);
    graphics.fillTriangle(center - 65, 92, center, 18, center + 64, 92);
    graphics.fillTriangle(center * 0.35 - 35, 92, center * 0.35, 42, center * 0.35 + 40, 98);
    graphics.fillStyle(0x6f91a8, 1);
    graphics.fillTriangle(0, height, center - topEdge, top, center - bottomEdge, height);
    graphics.fillTriangle(width, height, center + topEdge, top, center + bottomEdge, height);
    graphics.fillStyle(0xf2f8fc, 1);
    graphics.fillPoints([
      new Phaser.Geom.Point(center - topEdge, top), new Phaser.Geom.Point(center + topEdge, top),
      new Phaser.Geom.Point(center + bottomEdge, height), new Phaser.Geom.Point(center - bottomEdge, height),
    ], true);
    graphics.lineStyle(5, 0xd0e5f1, 1).strokePoints([
      new Phaser.Geom.Point(center - topEdge, top), new Phaser.Geom.Point(center - bottomEdge, height),
    ]).strokePoints([
      new Phaser.Geom.Point(center + topEdge, top), new Phaser.Geom.Point(center + bottomEdge, height),
    ]);
    for (let index = 0; index < 14; index += 1) {
      const y = 155 + index * 42;
      this.drawPine(graphics, center - this.trackEdgeAt(y) - 30, y, 0.65 + (index % 3) * 0.08);
      this.drawPine(graphics, center + this.trackEdgeAt(y + 16) + 30, y + 16, 0.65 + ((index + 1) % 3) * 0.08);
    }
  }

  private drawPine(graphics: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    graphics.fillStyle(0x315f58, 1).fillTriangle(x, y - 34 * scale, x - 18 * scale, y + 12 * scale, x + 18 * scale, y + 12 * scale);
    graphics.fillStyle(0x274d49, 1).fillTriangle(x, y - 14 * scale, x - 23 * scale, y + 27 * scale, x + 23 * scale, y + 27 * scale);
    graphics.fillStyle(0xeaf7ff, 0.85).fillTriangle(x, y - 34 * scale, x - 8 * scale, y - 12 * scale, x + 8 * scale, y - 12 * scale);
  }

  private buildUi() {
    const center = this.scale.width / 2;
    this.add.rectangle(center, 31, 300, 48, 0x173a57, 0.92).setStrokeStyle(2, 0xeaf7ff).setDepth(100);
    this.add.text(center, 30, 'SLED RUN', {
      fontFamily: 'monospace', fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(101);
    this.queueText = this.add.text(16, 16, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
      backgroundColor: '#173a57dd', padding: { x: 8, y: 6 },
    }).setDepth(101);
    this.statusText = this.add.text(center, 70, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#173a57',
      backgroundColor: '#ffffffdd', padding: { x: 9, y: 5 }, align: 'center',
    }).setOrigin(0.5).setDepth(101);
    this.hudText = this.add.text(this.scale.width - 16, 16, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', align: 'right',
      backgroundColor: '#173a57dd', padding: { x: 8, y: 6 },
    }).setOrigin(1, 0).setDepth(101);

    this.difficultyButtons = SLED_DIFFICULTIES.map((difficulty, index) => {
      const label = difficulty[0]!.toUpperCase() + difficulty.slice(1);
      const button = this.makeButton(center - 118 + index * 118, 112, label, () => this.chooseDifficulty(difficulty));
      return button;
    });
    this.startButton = this.makeButton(center, 158, 'START RUN', () => this.startRace()).setStyle({ fontSize: '18px' });
    this.parkButton = this.makeButton(62, this.scale.height - 32, '← PARK', () => this.leave()).setScrollFactor(0);
    this.add.text(center, this.scale.height - 26, '← / → or A / D  •  tap either side to steer', {
      fontFamily: 'monospace', fontSize: '12px', color: '#173a57',
      backgroundColor: '#ffffffcc', padding: { x: 7, y: 4 },
    }).setOrigin(0.5).setDepth(101);
  }

  private makeButton(x: number, y: number, label: string, action: () => void) {
    const button = this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
      backgroundColor: '#2d6f98', padding: { x: 12, y: 7 },
    }).setOrigin(0.5).setDepth(105).setInteractive({ useHandCursor: true });
    button.on('pointerover', () => button.setBackgroundColor('#4194c5'));
    button.on('pointerout', () => button.setBackgroundColor('#2d6f98'));
    button.on('pointerdown', action);
    return button;
  }

  private chooseDifficulty(difficulty: SledDifficulty) {
    if (!this.snapshot || this.snapshot.phase !== 'lobby' || this.snapshot.leader !== this.snapshot.localSessionId) return;
    if (this.solo) {
      this.snapshot.difficulty = difficulty;
      this.acceptSnapshot(this.snapshot);
    } else this.connection?.setDifficulty(difficulty);
  }

  private startRace() {
    if (!this.snapshot || this.snapshot.leader !== this.snapshot.localSessionId || (this.snapshot.phase !== 'lobby' && this.snapshot.phase !== 'finished')) return;
    if (!this.solo) {
      this.connection?.start();
      return;
    }
    const racer = this.snapshot.racers[0]!;
    Object.assign(racer, { x: 0, progress: 0, speed: 0, effect: '', effectUntil: 0, rank: 0, finishedAt: 0 });
    this.snapshot.round += 1;
    this.snapshot.seed = `solo-${Date.now()}-${this.snapshot.round}`;
    this.snapshot.phase = 'countdown';
    this.snapshot.countdownAt = Date.now() + SLED_COUNTDOWN_MS;
    this.snapshot.serverTime = Date.now();
    this.localCountdownEnd = this.time.now + SLED_COUNTDOWN_MS;
    // The sled and its claimed items are reset by the countdown, in acceptSnapshot.
    this.acceptSnapshot(this.snapshot);
  }

  private syncRacerViews() {
    if (!this.snapshot) return;
    const live = new Set(this.snapshot.racers.map((racer) => racer.sessionId));
    for (const [id, view] of this.racerViews) {
      if (!live.has(id)) { view.destroy(); this.racerViews.delete(id); this.motions.delete(id); }
    }
    for (const racer of this.snapshot.racers) {
      if (this.racerViews.has(racer.sessionId)) continue;
      const tube = this.add.ellipse(0, 10, 54, 25, 0xf24f88).setStrokeStyle(4, 0xffffff);
      const penguin = this.add.sprite(0, -4, 'penguin-down', 0).setTint(COLOR_TINT[racer.penguinColor] ?? 0x58a6ff);
      configurePlayerPenguin(penguin);
      const name = this.add.text(0, 32, racer.displayName, {
        fontFamily: 'monospace', fontSize: '11px', color: '#173a57',
        backgroundColor: '#ffffffcc', padding: { x: 3, y: 1 },
      }).setOrigin(0.5);
      this.racerViews.set(racer.sessionId, this.add.container(0, 0, [tube, penguin, name]).setDepth(50));
    }
  }

  private refreshUi() {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const leader = snapshot.leader === snapshot.localSessionId;
    this.queueText.setText(`${snapshot.racers.length}/${SLED_MAX_PLAYERS} RACERS\n${leader ? '★ You are leader' : 'Waiting for leader'}`);
    const local = snapshot.racers.find((racer) => racer.sessionId === snapshot.localSessionId);
    const config = sledDifficultyConfig(snapshot.difficulty);
    // Read from our own sled: the snapshot's copy of it is a round trip behind, so
    // a bump would show in the HUD later than on screen.
    const progress = local ? this.motionFor(local).progress : 0;
    const speed = local && !local.rank && !this.authoritativeView ? this.localSled.speed : (local?.speed ?? 0);
    const place = local?.rank ? `Finished #${local.rank}` : `${Math.round((progress / config.courseLength) * 100)}%`;
    this.hudText.setText(`${snapshot.difficulty.toUpperCase()}\n${place}\n${Math.round(speed)} speed`);
    const showLobby = snapshot.phase === 'lobby' || snapshot.phase === 'finished';
    this.parkButton.setVisible(showLobby || this.disconnected);
    this.startButton.setVisible(showLobby && leader && !this.disconnected).setText(snapshot.phase === 'finished' ? 'RUN AGAIN' : 'START RUN');
    this.difficultyButtons.forEach((button, index) => {
      const active = SLED_DIFFICULTIES[index] === snapshot.difficulty;
      button.setVisible(snapshot.phase === 'lobby' && !this.disconnected).setAlpha(active ? 1 : 0.55);
    });
    if (this.disconnected) {
      this.statusText.setText('Connection lost • this run ended • return to Park');
    } else if (snapshot.phase === 'lobby') {
      this.statusText.setText(this.lobbyNote || (leader ? 'Choose a difficulty • start when everyone is ready' : 'Waiting at the top for the leader to start…'));
    } else if (snapshot.phase === 'finished') {
      const results = snapshot.racers.filter((racer) => racer.rank > 0)
        .sort((a, b) => a.rank - b.rank)
        .map((racer) => `#${racer.rank} ${racer.displayName}`).join('  •  ');
      this.statusText.setText(`FINISH!  ${results}${this.rewardText}`);
    }
  }

  private renderCourse(localProgress: number) {
    const graphics = this.courseGraphics.clear();
    const center = this.scale.width / 2;
    const playerY = this.playerY;
    const config = sledDifficultyConfig(this.snapshot?.difficulty ?? 'easy');
    for (const item of this.course) {
      // The sled runs toward the bottom of the screen, so the course scrolls
      // upward: whatever is still ahead sits *below* the player.
      const y = playerY + (item.progress - localProgress) * SLED_PROGRESS_TO_PIXELS;
      if (y < this.trackTopY || y > this.scale.height + 65) continue;
      const x = this.laneX(item.x, y, config.trackHalfWidth);
      if (item.kind === 'ice') {
        graphics.fillStyle(0x72d9ee, 0.72).fillEllipse(x, y, 88, 40);
        graphics.lineStyle(3, 0xd9fbff, 0.9).strokeEllipse(x, y, 76, 30);
      } else if (item.kind === 'rock') {
        graphics.fillStyle(0x677887, 1).fillPoints([
          new Phaser.Geom.Point(x - 28, y + 18), new Phaser.Geom.Point(x - 19, y - 16),
          new Phaser.Geom.Point(x + 12, y - 23), new Phaser.Geom.Point(x + 30, y + 14),
        ], true);
        graphics.lineStyle(3, 0x435361).strokePoints([
          new Phaser.Geom.Point(x - 28, y + 18), new Phaser.Geom.Point(x - 19, y - 16),
          new Phaser.Geom.Point(x + 12, y - 23), new Phaser.Geom.Point(x + 30, y + 14),
        ], true);
      } else {
        graphics.fillStyle(0x7b4b2b, 1).fillRect(x - 22, y - 18, 44, 36);
        graphics.fillStyle(0xc78a50, 1).fillEllipse(x, y - 18, 44, 18);
        graphics.lineStyle(3, 0x6a3d22).strokeEllipse(x, y - 18, 27, 10);
      }
    }
    const finish = this.snapshot ? config.courseLength : 0;
    const finishY = playerY + (finish - localProgress) * SLED_PROGRESS_TO_PIXELS;
    if (finishY > this.trackTopY && finishY < this.scale.height + 20) {
      const half = Math.round(this.trackEdgeAt(finishY));
      graphics.fillStyle(0x1d3347).fillRect(center - half, finishY - 8, half * 2, 16);
      for (let x = center - half; x < center + half; x += 28) {
        graphics.fillStyle((Math.floor((x - center + half) / 28) % 2) ? 0xffffff : 0x1d3347).fillRect(x, finishY - 8, 14, 16);
      }
    }
  }

  private renderRacers(localProgress: number) {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const playerY = this.playerY;
    const config = sledDifficultyConfig(snapshot.difficulty);
    const localEffect = this.localEffect;
    snapshot.racers.forEach((racer, index) => {
      const view = this.racerViews.get(racer.sessionId);
      if (!view) return;
      const motion = this.motionFor(racer);
      // Our own wobble comes from the collision we called, so it starts the instant
      // the rock is hit rather than when the server hears about it.
      const effect = racer.sessionId === snapshot.localSessionId ? localEffect : racer.effect;
      const lobby = snapshot.phase === 'lobby' || snapshot.phase === 'countdown';
      const y = lobby ? playerY + (index % 2) * 46 : playerY + (motion.progress - localProgress) * SLED_PROGRESS_TO_PIXELS;
      const x = this.laneX(motion.x, y, config.trackHalfWidth);
      // Sleds nearer the bottom are nearer the camera, so they draw in front.
      view.setPosition(x, y).setAlpha(racer.rank > 0 ? 0.7 : 1).setDepth(50 + Math.round(y));
      view.setAngle(effect === 'obstacle' ? Math.sin(this.time.now * 0.03) * 10 : effect === 'ice' ? Math.sin(this.time.now * 0.02) * 3 : 0);
    });
  }

  private motionFor(racer: SledRacerSnapshot): SledMotion {
    return this.motions.get(racer.sessionId) ?? { x: racer.x, progress: racer.progress };
  }

  /**
   * Advance every sled's motion by a frame.
   *
   * Our own sled is simulated outright — lane, collisions, effect, speed and how
   * far down the hill it has got — because all of those follow from a collision,
   * and a collision has to be judged against the lane the player can see. What the
   * server sends back about us is a correction, not the truth: `reconcileLocalSled`
   * trims the lane and `reconcileLocalProgress` eases the hill, both gently enough
   * that a dodge is never taken back. Everyone else follows their snapshot carried
   * forward by its own age — that is the slightly delayed view of their race.
   */
  private stepMotions(deltaMs: number, steering: -1 | 0 | 1) {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const config = sledDifficultyConfig(snapshot.difficulty);
    const authoritative = this.authoritativeView;
    const ageMs = Math.max(0, this.time.now - this.snapshotAt);
    for (const racer of snapshot.racers) {
      // Outside a race nobody is moving, and a dropped connection has nothing left
      // to predict from: in both cases the snapshot is exactly what to draw. Solo
      // practice draws it too, because there it *is* the local simulation.
      if (authoritative || racer.rank > 0) {
        this.motions.set(racer.sessionId, { x: racer.x, progress: racer.progress });
        continue;
      }
      if (racer.sessionId === snapshot.localSessionId) {
        const sled = this.advanceLocalSled(deltaMs, steering, snapshot.difficulty);
        const progress = reconcileLocalProgress(sled.progress, racer, ageMs, config.courseLength, deltaMs);
        this.localSled = { ...sled, progress };
        this.motions.set(racer.sessionId, { x: sled.x, progress });
        continue;
      }
      this.motions.set(racer.sessionId, stepSledMotion(this.motionFor(racer), {
        server: racer,
        steering: null,
        steeringSpeed: config.steeringSpeed,
        trackHalfWidth: config.trackHalfWidth,
        courseLength: config.courseLength,
        deltaMs,
        ageMs,
      }));
    }
    const local = this.motions.get(snapshot.localSessionId);
    if (local && !authoritative) this.steerTrace.record(this.time.now, local.x);
  }

  /**
   * One frame of our own sled, and a report of anything it ran into. The server
   * needs the report to show the bump to the other racers and to keep scoring the
   * finish; it does not look for the collision itself, because its copy of our
   * lane is a round trip old.
   */
  private advanceLocalSled(deltaMs: number, steering: -1 | 0 | 1, difficulty: SledDifficulty): LocalSled {
    const step = stepLocalSled(this.localSled, {
      steering,
      course: this.course,
      claimed: this.claimedItems,
      config: sledDifficultyConfig(difficulty),
      deltaMs,
      now: this.time.now,
    });
    this.localSled = step.sled;
    for (const item of step.hits) {
      this.claimedItems.add(item.id);
      this.connection?.sendHit(item.id);
    }
    return step.sled;
  }

  private updateSolo(deltaMs: number, steering: -1 | 0 | 1) {
    const snapshot = this.snapshot;
    if (!snapshot || !this.solo) return;
    if (snapshot.phase === 'countdown') {
      if (this.time.now < this.localCountdownEnd) return;
      snapshot.phase = 'racing';
      snapshot.racers[0]!.speed = sledDifficultyConfig(snapshot.difficulty).baseSpeed;
      this.acceptSnapshot(snapshot);
      return;
    }
    if (snapshot.phase !== 'racing') return;
    const racer = snapshot.racers[0]!;
    if (racer.rank > 0) return;
    const config = sledDifficultyConfig(snapshot.difficulty);
    // Practice runs the same sled the multiplayer one does; with nobody to report
    // to, its state simply is the snapshot.
    const sled = this.advanceLocalSled(deltaMs, steering, snapshot.difficulty);
    Object.assign(racer, {
      x: sled.x, progress: sled.progress, speed: sled.speed,
      effect: sled.effect, effectUntil: sled.effectUntil,
    });
    if (sled.progress >= config.courseLength) {
      racer.rank = 1;
      racer.finishedAt = this.time.now;
      snapshot.phase = 'finished';
      this.acceptSnapshot(snapshot);
    }
  }

  private leave() {
    this.scene.start('WestPark', { spawn: 'sled-run' });
  }

  update(_time: number, delta: number) {
    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.leave();
      return;
    }
    if (!this.snapshot) return;
    const pointer = this.input.activePointer;
    const steering = steerAxisFrom({
      left: this.cursors.left.isDown || this.keyA.isDown,
      right: this.cursors.right.isDown || this.keyD.isDown,
      pointerDown: pointer.isDown,
      pointerX: pointer.x,
      width: this.scale.width,
    });
    if (!this.reconnecting
      && (this.snapshot.phase === 'countdown' || this.snapshot.phase === 'racing')
      && shouldSendSteer(this.previousSteering, steering, this.time.now, this.lastSteerSentAt)) {
      this.ackClock.sent(this.connection?.sendSteer(steering) ?? 0, this.time.now);
      this.previousSteering = steering;
      this.lastSteerSentAt = this.time.now;
    }
    this.updateSolo(delta, steering);
    this.stepMotions(delta, steering);
    const local = this.snapshot.racers.find((racer) => racer.sessionId === this.snapshot!.localSessionId);
    const localProgress = local ? this.motionFor(local).progress : 0;
    this.renderCourse(localProgress);
    this.renderRacers(localProgress);
    if (!this.disconnected && this.snapshot.phase === 'countdown') {
      const seconds = Math.max(1, Math.ceil((this.localCountdownEnd - this.time.now) / 1_000));
      this.statusText.setText(`${seconds}…  Everyone starts together!`);
    } else if (!this.disconnected && this.snapshot.phase === 'racing') {
      const effect = this.localEffect;
      const banner = effect === 'ice' ? ' • ICE BOOST!' : effect === 'obstacle' ? ' • BUMPED!' : '';
      this.statusText.setText(`Race to the lodge!${banner}`);
    }
    if (this.solo) this.refreshUi();
  }
}
