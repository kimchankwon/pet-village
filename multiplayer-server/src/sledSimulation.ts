import {
  SLED_COUNTDOWN_MS,
  SLED_EFFECTS,
  SLED_MAX_PLAYERS,
  SLED_RACER_RADIUS,
  SledPlayerState,
  generateSledCourse,
  isSledDifficulty,
  sledDifficultyConfig,
  type SledDifficulty,
  type SledInputPayload,
  type SledRunState,
} from '@pet-village/multiplayer-protocol';

export class SledRaceSimulation {
  private readonly hitItems = new Map<string, Set<string>>();
  private readonly lastInputAt = new Map<string, number>();
  private finishCount = 0;
  private course: ReturnType<typeof generateSledCourse> = [];

  constructor(
    private readonly state: SledRunState,
    private readonly seedFactory: () => string = () => crypto.randomUUID(),
  ) {}

  join(sessionId: string, profile: { userId: string; displayName: string; penguinColor: string }): boolean {
    if (this.state.racers.has(sessionId)) return true;
    if ([...this.state.racers.values()].some((racer) => racer.userId === profile.userId)) return false;
    if (this.state.racers.size >= SLED_MAX_PLAYERS) return false;
    if (this.state.phase !== 'lobby' && this.state.phase !== 'finished') return false;
    const racer = new SledPlayerState();
    Object.assign(racer, profile);
    this.state.racers.set(sessionId, racer);
    if (!this.state.leader) this.state.leader = sessionId;
    if (this.state.phase === 'lobby') this.placeLobbyRacers();
    return true;
  }

  leave(sessionId: string) {
    if (!this.state.racers.delete(sessionId)) return;
    this.hitItems.delete(sessionId);
    this.lastInputAt.delete(sessionId);
    if (this.state.leader === sessionId) {
      this.state.leader = this.state.racers.keys().next().value ?? '';
    }
    if (this.state.racers.size === 0) this.resetEmptyLobby();
    else if (this.state.phase === 'racing' && this.everyRacerFinished()) this.state.phase = 'finished';
    else if (this.state.phase === 'lobby') this.placeLobbyRacers();
  }

  setDifficulty(sessionId: string, difficulty: unknown): boolean {
    if (
      sessionId !== this.state.leader ||
      this.state.phase !== 'lobby' ||
      !isSledDifficulty(difficulty)
    ) return false;
    this.state.difficulty = difficulty;
    return true;
  }

  start(sessionId: string, now = Date.now()): boolean {
    if (
      sessionId !== this.state.leader ||
      (this.state.phase !== 'lobby' && this.state.phase !== 'finished') ||
      this.state.racers.size === 0
    ) return false;
    this.state.round += 1;
    this.state.seed = this.seedFactory();
    this.course = generateSledCourse(this.state.seed, this.state.difficulty);
    this.state.countdownAt = now + SLED_COUNTDOWN_MS;
    this.state.startedAt = 0;
    this.state.serverTime = now;
    this.state.phase = 'countdown';
    this.finishCount = 0;
    this.hitItems.clear();
    this.resetRacers();
    return true;
  }

  input(sessionId: string, payload: SledInputPayload, now = Date.now()): boolean {
    const racer = this.state.racers.get(sessionId);
    if (
      !racer ||
      (this.state.phase !== 'countdown' && this.state.phase !== 'racing') ||
      !payload ||
      !Number.isInteger(payload.seq) ||
      payload.seq <= racer.inputSeq ||
      (payload.steering !== -1 && payload.steering !== 0 && payload.steering !== 1) ||
      now - (this.lastInputAt.get(sessionId) ?? Number.NEGATIVE_INFINITY) < 12
    ) return false;
    racer.steering = payload.steering;
    racer.inputSeq = payload.seq;
    this.lastInputAt.set(sessionId, now);
    return true;
  }

  step(deltaMs: number, now = Date.now()) {
    if (this.state.phase === 'countdown') {
      this.state.serverTime = now;
      if (now < this.state.countdownAt) return;
      this.state.phase = 'racing';
      this.state.startedAt = this.state.countdownAt;
      const baseSpeed = sledDifficultyConfig(this.state.difficulty).baseSpeed;
      this.state.racers.forEach((racer) => { racer.speed = baseSpeed; });
      return;
    }
    if (this.state.phase !== 'racing') return;
    const deltaSeconds = Math.min(Math.max(deltaMs, 0), 100) / 1_000;
    const config = sledDifficultyConfig(this.state.difficulty);
    const course = this.course;
    const finishers: Array<{ sessionId: string; racer: SledPlayerState; finishedAt: number }> = [];

    this.state.racers.forEach((racer, sessionId) => {
      if (racer.rank > 0) return;
      if (racer.effect && now >= racer.effectUntil) racer.effect = '';
      const multiplier = racer.effect ? SLED_EFFECTS[racer.effect].multiplier : 1;
      const targetSpeed = config.baseSpeed * multiplier;
      racer.speed += (targetSpeed - racer.speed) * Math.min(1, deltaSeconds * 7);
      racer.x = Math.max(
        -config.trackHalfWidth,
        Math.min(config.trackHalfWidth, racer.x + racer.steering * config.steeringSpeed * deltaSeconds),
      );
      const previousProgress = racer.progress;
      racer.progress += racer.speed * deltaSeconds;
      this.applyCourseEffects(sessionId, racer, previousProgress, course, now);
      if (racer.progress >= config.courseLength) {
        const travelled = Math.max(Number.EPSILON, racer.progress - previousProgress);
        const crossingFraction = Math.min(1, Math.max(0, (config.courseLength - previousProgress) / travelled));
        racer.progress = config.courseLength;
        finishers.push({
          sessionId,
          racer,
          finishedAt: now - deltaSeconds * 1_000 * (1 - crossingFraction),
        });
      }
    });

    finishers.sort((a, b) => a.finishedAt - b.finishedAt || a.sessionId.localeCompare(b.sessionId));
    finishers.forEach(({ racer, finishedAt }) => {
      racer.finishedAt = finishedAt;
      racer.rank = ++this.finishCount;
      racer.steering = 0;
    });

    if (this.everyRacerFinished()) this.state.phase = 'finished';
  }

  private applyCourseEffects(
    sessionId: string,
    racer: SledPlayerState,
    previousProgress: number,
    course: ReturnType<typeof generateSledCourse>,
    now: number,
  ) {
    let hits = this.hitItems.get(sessionId);
    if (!hits) {
      hits = new Set();
      this.hitItems.set(sessionId, hits);
    }
    for (const item of course) {
      if (
        hits.has(item.id) ||
        item.progress + item.radius < previousProgress ||
        item.progress - item.radius > racer.progress ||
        Math.abs(item.x - racer.x) > item.radius + SLED_RACER_RADIUS
      ) continue;
      hits.add(item.id);
      racer.effect = item.kind === 'ice' ? 'ice' : 'obstacle';
      const effect = SLED_EFFECTS[racer.effect];
      racer.effectUntil = now + effect.durationMs;
      racer.speed = sledDifficultyConfig(this.state.difficulty).baseSpeed * effect.multiplier;
    }
  }

  private everyRacerFinished() {
    return this.state.racers.size > 0 && [...this.state.racers.values()].every((racer) => racer.rank > 0);
  }

  private resetRacers() {
    this.lastInputAt.clear();
    const count = this.state.racers.size;
    let index = 0;
    this.state.racers.forEach((racer) => {
      racer.x = (index - (count - 1) / 2) * 74;
      racer.progress = 0;
      racer.speed = 0;
      racer.steering = 0;
      racer.inputSeq = 0;
      racer.effect = '';
      racer.effectUntil = 0;
      racer.finishedAt = 0;
      racer.rank = 0;
      index += 1;
    });
  }

  stopInput(sessionId: string) {
    const racer = this.state.racers.get(sessionId);
    if (racer) racer.steering = 0;
  }

  private placeLobbyRacers() {
    this.resetRacers();
  }

  private resetEmptyLobby() {
    this.state.phase = 'lobby';
    this.state.leader = '';
    this.state.difficulty = 'easy';
    this.state.seed = '';
    this.state.countdownAt = 0;
    this.state.startedAt = 0;
    this.state.serverTime = 0;
    this.finishCount = 0;
    this.hitItems.clear();
    this.lastInputAt.clear();
  }

}
