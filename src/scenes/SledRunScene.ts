import Phaser from 'phaser';
import {
  SLED_DIFFICULTIES,
  SLED_COUNTDOWN_MS,
  SLED_EFFECTS,
  SLED_MAX_PLAYERS,
  SLED_PROGRESS_TO_PIXELS,
  SLED_RACER_RADIUS,
  generateSledCourse,
  sledDifficultyConfig,
  type SledCourseItem,
  type SledDifficulty,
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
import { shouldSendSteer, steerAxisFrom } from '../systems/sledRunPolicy';
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
  private soloHits = new Set<string>();
  private course: SledCourseItem[] = [];
  private courseKey = '';
  private racerViews = new Map<string, Phaser.GameObjects.Container>();
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
    this.soloHits.clear();
    this.course = [];
    this.courseKey = '';
    this.racerViews.clear();
    this.previousPhase = '';
    this.previousRound = -1;
    this.rewardText = '';
    this.lobbyNote = '';
    this.disconnected = false;
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
          this.statusText.setText('Connection lost • reconnecting…');
        } else if (state === 'connected') {
          this.disconnected = false;
          this.lastSteerSentAt = Number.NEGATIVE_INFINITY;
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
        x: 0, progress: 0, speed: 0, effect: '', effectUntil: 0, rank: 0, finishedAt: 0,
      }],
    };
    this.snapshot = snapshot;
    this.acceptSnapshot(snapshot);
  }

  private acceptSnapshot(snapshot: SledRunSnapshot) {
    this.snapshot = snapshot;
    const nextCourseKey = `${snapshot.seed}:${snapshot.difficulty}:${snapshot.round}`;
    if (snapshot.seed && nextCourseKey !== this.courseKey) {
      this.courseKey = nextCourseKey;
      this.course = generateSledCourse(snapshot.seed, snapshot.difficulty);
    }
    if (snapshot.phase !== this.previousPhase || snapshot.round !== this.previousRound) {
      if (snapshot.phase === 'countdown') {
        this.rewardText = '';
        this.localCountdownEnd = this.time.now + Math.max(0, snapshot.countdownAt - snapshot.serverTime);
        this.previousSteering = 0;
        this.lastSteerSentAt = Number.NEGATIVE_INFINITY;
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
    this.syncRacerViews();
    this.refreshUi();
  }

  private drawMountain() {
    const width = this.scale.width;
    const height = this.scale.height;
    const center = width / 2;
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
    graphics.fillTriangle(0, height, center - 205, 112, center - 335, height);
    graphics.fillTriangle(width, height, center + 205, 112, center + 335, height);
    graphics.fillStyle(0xf2f8fc, 1);
    graphics.fillPoints([
      new Phaser.Geom.Point(center - 205, 112), new Phaser.Geom.Point(center + 205, 112),
      new Phaser.Geom.Point(center + 335, height), new Phaser.Geom.Point(center - 335, height),
    ], true);
    graphics.lineStyle(5, 0xd0e5f1, 1).strokePoints([
      new Phaser.Geom.Point(center - 205, 112), new Phaser.Geom.Point(center - 335, height),
    ]).strokePoints([
      new Phaser.Geom.Point(center + 205, 112), new Phaser.Geom.Point(center + 335, height),
    ]);
    for (let index = 0; index < 14; index += 1) {
      const y = 155 + index * 42;
      const spread = 220 + index * 10;
      this.drawPine(graphics, center - spread, y, 0.65 + (index % 3) * 0.08);
      this.drawPine(graphics, center + spread, y + 16, 0.65 + ((index + 1) % 3) * 0.08);
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
    this.soloHits.clear();
    this.acceptSnapshot(this.snapshot);
  }

  private syncRacerViews() {
    if (!this.snapshot) return;
    const live = new Set(this.snapshot.racers.map((racer) => racer.sessionId));
    for (const [id, view] of this.racerViews) {
      if (!live.has(id)) { view.destroy(); this.racerViews.delete(id); }
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
    const place = local?.rank ? `Finished #${local.rank}` : `${Math.round(((local?.progress ?? 0) / config.courseLength) * 100)}%`;
    this.hudText.setText(`${snapshot.difficulty.toUpperCase()}\n${place}\n${Math.round(local?.speed ?? 0)} speed`);
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
    const playerY = this.scale.height * 0.68;
    for (const item of this.course) {
      const y = playerY - (item.progress - localProgress) * SLED_PROGRESS_TO_PIXELS;
      if (y < 88 || y > this.scale.height + 65) continue;
      const x = center + item.x;
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
    const finish = this.snapshot ? sledDifficultyConfig(this.snapshot.difficulty).courseLength : 0;
    const finishY = playerY - (finish - localProgress) * SLED_PROGRESS_TO_PIXELS;
    if (finishY > 90 && finishY < this.scale.height) {
      graphics.fillStyle(0x1d3347).fillRect(center - 245, finishY - 8, 490, 16);
      for (let x = center - 245; x < center + 245; x += 28) {
        graphics.fillStyle((Math.floor((x - center + 245) / 28) % 2) ? 0xffffff : 0x1d3347).fillRect(x, finishY - 8, 14, 16);
      }
    }
  }

  private renderRacers() {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const local = snapshot.racers.find((racer) => racer.sessionId === snapshot.localSessionId) ?? snapshot.racers[0];
    const localProgress = local?.progress ?? 0;
    const center = this.scale.width / 2;
    const playerY = this.scale.height * 0.68;
    snapshot.racers.forEach((racer, index) => {
      const view = this.racerViews.get(racer.sessionId);
      if (!view) return;
      const lobby = snapshot.phase === 'lobby' || snapshot.phase === 'countdown';
      const x = center + racer.x;
      const y = lobby ? 225 + (index % 2) * 58 : playerY - (racer.progress - localProgress) * SLED_PROGRESS_TO_PIXELS;
      view.setPosition(x, y).setAlpha(racer.rank > 0 ? 0.7 : 1).setDepth(50 + Math.round(y));
      view.setAngle(racer.effect === 'obstacle' ? Math.sin(this.time.now * 0.03) * 10 : racer.effect === 'ice' ? Math.sin(this.time.now * 0.02) * 3 : 0);
    });
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
    const config = sledDifficultyConfig(snapshot.difficulty);
    const dt = Math.min(deltaMs, 100) / 1_000;
    if (racer.effect && this.time.now >= racer.effectUntil) racer.effect = '';
    const activeEffect = racer.effect === 'obstacle' || racer.effect === 'ice'
      ? racer.effect as keyof typeof SLED_EFFECTS
      : undefined;
    const multiplier = activeEffect ? SLED_EFFECTS[activeEffect].multiplier : 1;
    racer.speed += (config.baseSpeed * multiplier - racer.speed) * Math.min(1, dt * 7);
    racer.x = Phaser.Math.Clamp(racer.x + steering * config.steeringSpeed * dt, -config.trackHalfWidth, config.trackHalfWidth);
    const before = racer.progress;
    racer.progress += racer.speed * dt;
    for (const item of this.course) {
      if (this.soloHits.has(item.id) || item.progress + item.radius < before || item.progress - item.radius > racer.progress) continue;
      if (Math.abs(item.x - racer.x) > item.radius + SLED_RACER_RADIUS) continue;
      this.soloHits.add(item.id);
      const effectKey: keyof typeof SLED_EFFECTS = item.kind === 'ice' ? 'ice' : 'obstacle';
      racer.effect = effectKey;
      const effect = SLED_EFFECTS[effectKey];
      racer.effectUntil = this.time.now + effect.durationMs;
      racer.speed = config.baseSpeed * effect.multiplier;
    }
    if (racer.progress >= config.courseLength) {
      racer.progress = config.courseLength;
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
    if ((this.snapshot.phase === 'countdown' || this.snapshot.phase === 'racing') && shouldSendSteer(this.previousSteering, steering, this.time.now, this.lastSteerSentAt)) {
      this.connection?.sendSteer(steering);
      this.previousSteering = steering;
      this.lastSteerSentAt = this.time.now;
    }
    this.updateSolo(delta, steering);
    const local = this.snapshot.racers.find((racer) => racer.sessionId === this.snapshot!.localSessionId);
    this.renderCourse(local?.progress ?? 0);
    this.renderRacers();
    if (!this.disconnected && this.snapshot.phase === 'countdown') {
      const seconds = Math.max(1, Math.ceil((this.localCountdownEnd - this.time.now) / 1_000));
      this.statusText.setText(`${seconds}…  Everyone starts together!`);
    } else if (!this.disconnected && this.snapshot.phase === 'racing') {
      const localEffect = local?.effect === 'ice' ? ' • ICE BOOST!' : local?.effect === 'obstacle' ? ' • BUMPED!' : '';
      this.statusText.setText(`Race to the lodge!${localEffect}`);
    }
    if (this.solo) this.refreshUi();
  }
}
