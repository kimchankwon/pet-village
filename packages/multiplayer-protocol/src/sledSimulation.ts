import {
  SLED_COUNTDOWN_MS,
  SLED_EFFECTS,
  SLED_MAX_PLAYERS,
  SledPlayerState,
  generateSledCourse,
  isSledClaimContradicted,
  isSledDifficulty,
  isSledHitPlausible,
  isSledHitUnavoidable,
  sledDifficultyConfig,
  sledLaneJudgementReach,
  sledLaneTrailSpan,
  type SledCourseItem,
  type SledDifficulty,
  type SledDifficultyConfig,
  type SledEffect,
  type SledHitPayload,
  type SledInputPayload,
  type SledLaneSample,
  type SledRunState,
} from './index.js';

/** A claim the server took back, for the room to tell the client that made it. */
export type SledRejectedClaim = { sessionId: string; itemId: string };

export class SledRaceSimulation {
  private readonly hitItems = new Map<string, Set<string>>();
  private readonly lastInputAt = new Map<string, number>();
  /** Where each racer's accepted steering put them, laid out along the track. */
  private readonly lanes = new Map<string, SledLaneSample[]>();
  /** Which item the racer's current effect came from, so a bad claim can be undone. */
  private readonly effectSource = new Map<string, string>();
  /** How far down the course each racer's claims have been settled. */
  private readonly sweptIndex = new Map<string, number>();
  private rejectedClaims: SledRejectedClaim[] = [];
  private finishCount = 0;
  private course: SledCourseItem[] = [];

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
    this.lanes.delete(sessionId);
    this.effectSource.delete(sessionId);
    this.sweptIndex.delete(sessionId);
    this.rejectedClaims = this.rejectedClaims.filter((claim) => claim.sessionId !== sessionId);
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

  /** Claims the server withdrew, drained by the room and sent back to their author. */
  takeRejectedClaims(): SledRejectedClaim[] {
    if (!this.rejectedClaims.length) return [];
    const claims = this.rejectedClaims;
    this.rejectedClaims = [];
    return claims;
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
    const finishers: Array<{ sessionId: string; racer: SledPlayerState; finishedAt: number }> = [];

    this.state.racers.forEach((racer, sessionId) => {
      if (racer.rank > 0) return;
      if (racer.effect && now >= racer.effectUntil) {
        racer.effect = '';
        this.effectSource.delete(sessionId);
      }
      const multiplier = racer.effect ? SLED_EFFECTS[racer.effect].multiplier : 1;
      const targetSpeed = config.baseSpeed * multiplier;
      racer.speed += (targetSpeed - racer.speed) * Math.min(1, deltaSeconds * 7);
      racer.x = Math.max(
        -config.trackHalfWidth,
        Math.min(config.trackHalfWidth, racer.x + racer.steering * config.steeringSpeed * deltaSeconds),
      );
      const previousProgress = racer.progress;
      racer.progress += racer.speed * deltaSeconds;
      this.recordLane(sessionId, racer, config);
      // Settle what the racer's own steering says about the items now safely
      // behind them, whether or not their client mentioned them.
      this.sweepCourse(sessionId, racer, config, now);
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

  /**
   * Record a collision the racer's own client saw.
   *
   * The server does not test the course as it goes: its copy of a sled's lane is
   * a round trip behind the key being held, so it bumped players who had already
   * dodged. The client tests the course — which both sides generate from the same
   * seed — against the lane it is actually drawing, and the server keeps the
   * verdict so everyone else sees the bump too, a little later.
   *
   * A claim is checked twice. Here, on arrival, against roughly where the server
   * has the racer — all it can do while the client is still ahead of it. Then
   * again in {@link sweepCourse} once the server has driven the racer's own
   * accepted steering past the item, which is when the claim can really be
   * settled. Reports are not what makes the race, only what makes it prompt.
   */
  hit(sessionId: string, payload: SledHitPayload | undefined, now = Date.now()): boolean {
    const racer = this.state.racers.get(sessionId);
    if (!racer || this.state.phase !== 'racing' || racer.rank > 0) return false;
    const itemId = payload?.itemId;
    if (typeof itemId !== 'string') return false;
    const item = this.course.find((candidate) => candidate.id === itemId);
    if (!item) return false;
    const hits = this.hitsFor(sessionId);
    // One effect per item per racer, so a replayed report cannot stack a boost.
    if (hits.has(item.id)) return false;
    const config = sledDifficultyConfig(this.state.difficulty);
    const lane = this.lanes.get(sessionId) ?? [];
    if (!isSledHitPlausible(item, racer, config) || isSledClaimContradicted(item, lane, config)) {
      this.rejectedClaims.push({ sessionId, itemId: item.id });
      return false;
    }
    hits.add(item.id);
    this.applyEffect(sessionId, racer, item, config, now);
    return true;
  }

  private hitsFor(sessionId: string): Set<string> {
    let hits = this.hitItems.get(sessionId);
    if (!hits) {
      hits = new Set();
      this.hitItems.set(sessionId, hits);
    }
    return hits;
  }

  private applyEffect(
    sessionId: string,
    racer: SledPlayerState,
    item: SledCourseItem,
    config: SledDifficultyConfig,
    now: number,
  ) {
    const kind: SledEffect = item.kind === 'ice' ? 'ice' : 'obstacle';
    const effect = SLED_EFFECTS[kind];
    racer.effect = kind;
    racer.effectUntil = now + effect.durationMs;
    racer.speed = config.baseSpeed * effect.multiplier;
    this.effectSource.set(sessionId, item.id);
  }

  /** Where the racer's accepted steering has them now, kept for judging claims. */
  private recordLane(sessionId: string, racer: SledPlayerState, config: SledDifficultyConfig) {
    let lane = this.lanes.get(sessionId);
    if (!lane) {
      lane = [];
      this.lanes.set(sessionId, lane);
    }
    lane.push({ progress: racer.progress, x: racer.x });
    const oldest = racer.progress - sledLaneTrailSpan(config);
    let drop = 0;
    while (drop < lane.length && lane[drop]!.progress < oldest) drop += 1;
    if (drop) lane.splice(0, drop);
  }

  /**
   * Settle the course behind a racer against their own steering history.
   *
   * This is where the race stays the server's. A client that reports nothing is
   * still slowed by every rock its accepted steering drove straight through, and
   * a client that reports an item its steering never brought it near has that
   * claim taken back. Anything the lane leaves genuinely in doubt — the whole
   * point of calling collisions on the client — is left to the racer.
   *
   * Items are settled in course order, and only once the sled is far enough past
   * one that its report has had every chance to arrive.
   */
  private sweepCourse(
    sessionId: string,
    racer: SledPlayerState,
    config: SledDifficultyConfig,
    now: number,
  ) {
    const lane = this.lanes.get(sessionId);
    if (!lane) return;
    let index = this.sweptIndex.get(sessionId) ?? 0;
    while (index < this.course.length) {
      const item = this.course[index]!;
      if (racer.progress <= item.progress + sledLaneJudgementReach(item, config)) break;
      index += 1;
      const hits = this.hitsFor(sessionId);
      if (hits.has(item.id)) {
        if (isSledClaimContradicted(item, lane, config)) this.revokeClaim(sessionId, racer, item, config);
        continue;
      }
      // An unreported ice patch is a boost the racer went without; only the
      // penalties are worth going looking for.
      if (item.kind === 'ice' || !isSledHitUnavoidable(item, lane, config)) continue;
      hits.add(item.id);
      this.applyEffect(sessionId, racer, item, config, now);
    }
    this.sweptIndex.set(sessionId, index);
  }

  /** Undo an effect the racer's own lane says they never earned. */
  private revokeClaim(
    sessionId: string,
    racer: SledPlayerState,
    item: SledCourseItem,
    config: SledDifficultyConfig,
  ) {
    if (this.effectSource.get(sessionId) === item.id) {
      racer.effect = '';
      racer.effectUntil = 0;
      racer.speed = config.baseSpeed;
      this.effectSource.delete(sessionId);
    }
    this.rejectedClaims.push({ sessionId, itemId: item.id });
  }

  private everyRacerFinished() {
    return this.state.racers.size > 0 && [...this.state.racers.values()].every((racer) => racer.rank > 0);
  }

  private resetRacers() {
    this.lastInputAt.clear();
    this.lanes.clear();
    this.effectSource.clear();
    this.sweptIndex.clear();
    this.rejectedClaims = [];
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
    this.lanes.clear();
    this.effectSource.clear();
    this.sweptIndex.clear();
    this.rejectedClaims = [];
    this.course = [];
  }

}

export type SledSimSnapshot = {
  course: SledCourseItem[];
  finishCount: number;
  hitItems: Record<string, string[]>;
  lastInputAt: Record<string, number>;
  lanes: Record<string, SledLaneSample[]>;
  effectSource: Record<string, string>;
  sweptIndex: Record<string, number>;
  rejectedClaims: SledRejectedClaim[];
};

export function dumpSledSimulation(sim: SledRaceSimulation): SledSimSnapshot {
  const anySim = sim as unknown as {
    course: SledCourseItem[];
    finishCount: number;
    hitItems: Map<string, Set<string>>;
    lastInputAt: Map<string, number>;
    lanes: Map<string, SledLaneSample[]>;
    effectSource: Map<string, string>;
    sweptIndex: Map<string, number>;
    rejectedClaims: SledRejectedClaim[];
  };
  return {
    course: anySim.course,
    finishCount: anySim.finishCount,
    hitItems: Object.fromEntries([...anySim.hitItems].map(([id, hits]) => [id, [...hits]])),
    lastInputAt: Object.fromEntries(anySim.lastInputAt),
    lanes: Object.fromEntries(anySim.lanes),
    effectSource: Object.fromEntries(anySim.effectSource),
    sweptIndex: Object.fromEntries(anySim.sweptIndex),
    rejectedClaims: anySim.rejectedClaims,
  };
}

export function loadSledSimulation(state: SledRunState, snapshot?: SledSimSnapshot, seedFactory?: () => string) {
  const sim = new SledRaceSimulation(state, seedFactory);
  if (!snapshot) return sim;
  const anySim = sim as unknown as {
    course: SledCourseItem[];
    finishCount: number;
    hitItems: Map<string, Set<string>>;
    lastInputAt: Map<string, number>;
    lanes: Map<string, SledLaneSample[]>;
    effectSource: Map<string, string>;
    sweptIndex: Map<string, number>;
    rejectedClaims: SledRejectedClaim[];
  };
  anySim.course = snapshot.course;
  anySim.finishCount = snapshot.finishCount;
  anySim.hitItems = new Map(Object.entries(snapshot.hitItems).map(([id, hits]) => [id, new Set(hits)]));
  anySim.lastInputAt = new Map(Object.entries(snapshot.lastInputAt));
  anySim.lanes = new Map(Object.entries(snapshot.lanes));
  anySim.effectSource = new Map(Object.entries(snapshot.effectSource));
  anySim.sweptIndex = new Map(Object.entries(snapshot.sweptIndex));
  anySim.rejectedClaims = snapshot.rejectedClaims;
  return sim;
}
