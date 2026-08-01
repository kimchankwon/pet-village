/**
 * Expedition turn state machine — pure, no Phaser.
 *
 * Owns phase selection, chain generation, defense resolution, counters,
 * signature boss mechanics (Gustave charge, Maelle stance, Renoir canvas).
 */

import {
  BOSSES,
  CANVAS_HEAL_FRACTION,
  CANVAS_TURN_INTERVAL,
  DIFFICULTY_SCALES,
  MANA_CAP,
  MANA_START,
  MAELLE_STANCE_EFFECTS,
  PET_MAX_HP,
  counterDamage,
  defenseWindows,
  nextMaelleStance,
  offeredAbilities,
  phaseFromHp,
  scaledBossHp,
  type AbilityDef,
  type AttackDef,
  type ExpeditionBossId,
  type ExpeditionDifficulty,
  type ExpeditionPhase,
  type HitKind,
  type MaelleStance,
} from './expeditionRules';
import { finalizeSweep, tapSweep, type SweepLayout } from './expeditionSweep';

export type CombatPhase =
  | 'your-turn'
  | 'sweep'
  | 'boss-react'
  | 'their-turn-tell'
  | 'their-turn-hit'
  | 'counter'
  | 'won'
  | 'lost';

export type ChainHit = {
  index: number;
  kind: HitKind;
  damage: number;
  /** Time from chain start (after tell) when this hit lands, ms. */
  atMs: number;
};

export type DefenseAction = 'dodge' | 'parry' | 'none';

export type DefenseResult = {
  action: DefenseAction;
  success: boolean;
  perfect: boolean;
  damageTaken: number;
  manaGained: number;
  /** Counts toward a full-chain counter (successful non-gradient parries + normal parries). */
  parryCount: boolean;
};

export type CombatState = {
  bossId: ExpeditionBossId;
  difficulty: ExpeditionDifficulty;
  petHp: number;
  petMaxHp: number;
  bossHp: number;
  bossMaxHp: number;
  mana: number;
  phase: ExpeditionPhase;
  combatPhase: CombatPhase;
  /** Gustave charge stacks 0–3. */
  charge: number;
  /** Maelle current stance. */
  stance: MaelleStance;
  /** Renoir: boss attack turns completed. */
  renoirTurns: number;
  /** Whether the previous Renoir chain was fully parried. */
  lastChainFullyParried: boolean;
  activeAttack: AttackDef | null;
  chain: ChainHit[];
  chainHitIndex: number;
  chainParries: number;
  chainPerfectParries: number;
  chainHitsResolved: number;
  sweep: SweepLayout | null;
  sweepDamage: number;
  pendingAbility: AbilityDef | null;
  turn: number;
  log: string[];
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function createCombat(
  bossId: ExpeditionBossId,
  difficulty: ExpeditionDifficulty,
): CombatState {
  const boss = BOSSES[bossId];
  const bossMaxHp = scaledBossHp(boss.baseHp, difficulty);
  return {
    bossId,
    difficulty,
    petHp: PET_MAX_HP,
    petMaxHp: PET_MAX_HP,
    bossHp: bossMaxHp,
    bossMaxHp,
    mana: MANA_START,
    phase: 1,
    combatPhase: 'your-turn',
    charge: 0,
    stance: 'offensive',
    renoirTurns: 0,
    lastChainFullyParried: false,
    activeAttack: null,
    chain: [],
    chainHitIndex: 0,
    chainParries: 0,
    chainPerfectParries: 0,
    chainHitsResolved: 0,
    sweep: null,
    sweepDamage: 0,
    pendingAbility: null,
    turn: 0,
    log: [],
  };
}

export function refreshPhase(state: CombatState): void {
  state.phase = phaseFromHp(state.bossHp, state.bossMaxHp);
}

function clampMana(n: number): number {
  return Math.max(0, Math.min(MANA_CAP, n));
}

function applyBossDamage(state: CombatState, raw: number): number {
  let dmg = raw;
  if (state.bossId === 'maelle') {
    // Offensive takes +20%; defensive −30%.
    dmg = Math.round(dmg * MAELLE_STANCE_EFFECTS[state.stance].damageTaken);
  }
  const dealt = Math.min(state.bossHp, Math.max(0, dmg));
  state.bossHp -= dealt;
  refreshPhase(state);
  return dealt;
}

function applyPetDamage(state: CombatState, raw: number): number {
  let dmg = raw;
  if (state.bossId === 'maelle') {
    dmg = Math.round(dmg * MAELLE_STANCE_EFFECTS[state.stance].damageDealt);
  }
  const dealt = Math.min(state.petHp, Math.max(0, dmg));
  state.petHp -= dealt;
  return dealt;
}

/**
 * Start a player ability: spend mana (except Nibble grant-on-finish) and
 * enter the sweep QTE. Mana for paid abilities is reserved at selection.
 */
export function beginAbility(state: CombatState, ability: AbilityDef, sweep: SweepLayout): void {
  if (state.combatPhase !== 'your-turn') {
    throw new Error(`Cannot begin ability during ${state.combatPhase}`);
  }
  if (ability.mana > 0 && state.mana < ability.mana) {
    throw new Error(`Not enough mana for ${ability.name}`);
  }
  // Paid abilities spend immediately so you can't double-cast.
  if (ability.mana > 0) {
    state.mana = clampMana(state.mana - ability.mana);
  }
  state.pendingAbility = ability;
  state.sweep = sweep;
  state.sweepDamage = 0;
  state.combatPhase = 'sweep';
}

export function onSweepTap(state: CombatState, needleDeg: number): ReturnType<typeof tapSweep> {
  if (state.combatPhase !== 'sweep' || !state.sweep) {
    return { kind: 'miss', reason: 'empty' };
  }
  const result = tapSweep(state.sweep, needleDeg);
  if (result.kind === 'hit' || result.kind === 'perfect') {
    state.sweepDamage += result.damage;
  }
  return result;
}

/**
 * Needle finished its lap — apply damage, Bravo, Nibble mana grant, then
 * hand the turn to the boss (or end the fight).
 */
export function finishSweep(state: CombatState): {
  totalDamage: number;
  bravo: boolean;
  bossHp: number;
  won: boolean;
} {
  if (state.combatPhase !== 'sweep' || !state.sweep || !state.pendingAbility) {
    throw new Error('No active sweep');
  }
  const score = finalizeSweep(state.sweep, state.sweepDamage);
  // finalizeSweep subtracts mana for paid abilities, but we already spent —
  // recompute manaDelta for grants / Bravo only.
  let manaDelta = 0;
  if (state.pendingAbility.manaGrant) {
    manaDelta += state.pendingAbility.manaGrant;
  }
  if (score.bravo) {
    manaDelta += 1; // BRAVO_MANA_REFUND
  }
  state.mana = clampMana(state.mana + manaDelta);

  const dealt = applyBossDamage(state, score.totalDamage);
  state.log.push(
    `${state.pendingAbility.name}: ${dealt} dmg${score.bravo ? ' (Bravo!)' : ''}`,
  );
  state.sweep = null;
  state.pendingAbility = null;
  state.sweepDamage = 0;

  if (state.bossHp <= 0) {
    state.combatPhase = 'won';
    return { totalDamage: dealt, bravo: score.bravo, bossHp: 0, won: true };
  }
  state.combatPhase = 'boss-react';
  return { totalDamage: dealt, bravo: score.bravo, bossHp: state.bossHp, won: false };
}

function attackPool(state: CombatState): AttackDef[] {
  const boss = BOSSES[state.bossId];
  const phaseDef = boss.phases.find((p) => p.phase === state.phase) ?? boss.phases[0]!;
  let pool = [...phaseDef.attacks];

  // Gustave: at 3 charge, next turn is forced Overcharge Burst.
  if (state.bossId === 'gustave' && state.charge >= 3) {
    const over = pool.find((a) => a.isOvercharge);
    if (over) return [over];
    // Look in phase 3 for Overcharge even if we're somehow early.
    const p3 = boss.phases.find((p) => p.phase === 3);
    const forced = p3?.attacks.find((a) => a.isOvercharge);
    if (forced) return [forced];
  }

  // Maelle defensive: prefer shorter chains (fewer hits).
  if (state.bossId === 'maelle' && state.stance === 'defensive') {
    pool = [...pool].sort((a, b) => a.hits - b.hits);
  }
  return pool;
}

function pickAttack(state: CombatState, random: () => number): AttackDef {
  const pool = attackPool(state);
  // Gustave forced overcharge already returns a 1-element pool.
  if (state.bossId === 'gustave' && state.charge >= 3 && pool[0]?.isOvercharge) {
    return pool[0];
  }
  // Maelle virtuose: prefer longest chain with a gradient.
  if (state.bossId === 'maelle' && state.stance === 'virtuose') {
    const withGrad = pool.filter((a) => (a.gradientHits?.length ?? 0) > 0);
    const ranked = (withGrad.length ? withGrad : pool).sort((a, b) => b.hits - a.hits);
    return ranked[0]!;
  }
  const i = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[i]!;
}

function hitTimes(attack: AttackDef, hitCount: number): number[] {
  const baseGap = attack.gapMs ?? 360;
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < hitCount; i++) {
    times.push(t);
    let gap = baseGap;
    switch (attack.shape) {
      case 'accelerating':
        gap = Math.max(180, baseGap - i * 50);
        break;
      case 'uneven':
        gap = i === 0 ? baseGap * 1.55 : baseGap * 0.7;
        break;
      case 'tight':
        gap = Math.max(160, baseGap * 0.75);
        break;
      case 'early':
        gap = i === 0 ? baseGap * 0.55 : baseGap;
        break;
      case 'shortening':
        gap = Math.max(160, baseGap - i * 40);
        break;
      case 'near-simultaneous':
        gap = i >= hitCount - 3 ? Math.max(90, baseGap * 0.35) : baseGap;
        break;
      case 'single':
      case 'even':
      case 'alternating':
      default:
        gap = baseGap;
        break;
    }
    t += gap;
  }
  return times;
}

function buildChain(state: CombatState, attack: AttackDef): ChainHit[] {
  const scales = DIFFICULTY_SCALES[state.difficulty];
  let hits = attack.hits + scales.extraHits;
  // Maelle defensive: trim one hit if the chain is long enough.
  if (state.bossId === 'maelle' && state.stance === 'defensive' && hits > 2) {
    hits -= 1;
  }
  // Cap chains at 6 as documented.
  hits = Math.min(6, Math.max(1, hits));

  const gradientSet = new Set<number>(attack.gradientHits ?? []);
  // Hard: +1 gradient per chain (first free non-gradient slot).
  if (scales.extraGradient > 0) {
    let added = 0;
    for (let i = 0; i < hits && added < scales.extraGradient; i++) {
      if (!gradientSet.has(i)) {
        gradientSet.add(i);
        added++;
      }
    }
  }
  // Maelle virtuose: guarantee at least one gradient.
  if (state.bossId === 'maelle' && state.stance === 'virtuose' && gradientSet.size === 0) {
    gradientSet.add(Math.min(hits - 1, 1));
  }
  // Alternating shape: force odd indices to gradient if not already set.
  if (attack.shape === 'alternating') {
    for (let i = 1; i < hits; i += 2) gradientSet.add(i);
  }

  const times = hitTimes(attack, hits);
  const dmgScale = scales.theirDamage;
  return times.map((atMs, index) => ({
    index,
    kind: gradientSet.has(index) ? ('gradient' as const) : ('normal' as const),
    damage: Math.max(1, Math.round(attack.dmgPerHit * dmgScale)),
    atMs,
  }));
}

/**
 * After the player's sweep, the boss winds up and fires a chain.
 * Call this once combatPhase is 'boss-react' (or to force an AI turn in tests).
 */
export function beginBossTurn(state: CombatState, seed = 1): {
  attack: AttackDef;
  chain: ChainHit[];
  tellMs: number;
  canvasHeal: number;
} {
  if (state.combatPhase !== 'boss-react' && state.combatPhase !== 'your-turn') {
    // Allow tests to drive boss turns after setup.
  }
  const random = mulberry32(seed + state.turn * 97);
  const attack = pickAttack(state, random);
  const chain = buildChain(state, attack);

  // Renoir canvas heal at the start of every third boss turn, unless last
  // chain was fully parried.
  let canvasHeal = 0;
  if (state.bossId === 'renoir') {
    state.renoirTurns += 1;
    if (
      state.renoirTurns % CANVAS_TURN_INTERVAL === 0 &&
      !state.lastChainFullyParried
    ) {
      canvasHeal = Math.max(1, Math.round(state.bossMaxHp * CANVAS_HEAL_FRACTION));
      state.bossHp = Math.min(state.bossMaxHp, state.bossHp + canvasHeal);
      state.log.push(`Canvas restores ${canvasHeal} HP`);
    }
  }

  state.activeAttack = attack;
  state.chain = chain;
  state.chainHitIndex = 0;
  state.chainParries = 0;
  state.chainPerfectParries = 0;
  state.chainHitsResolved = 0;
  state.combatPhase = 'their-turn-tell';
  state.turn += 1;

  // Gustave charge bookkeeping is applied when the chain finishes.
  return {
    attack,
    chain,
    tellMs: attack.tellMs ?? 700,
    canvasHeal,
  };
}

export function startChainHits(state: CombatState): void {
  state.combatPhase = 'their-turn-hit';
  state.chainHitIndex = 0;
}

/**
 * Resolve one hit. `inputOffsetMs` is signed time from the perfect centre
 * (0 = dead on). `action` is what the player pressed (or none).
 */
export function resolveDefense(
  state: CombatState,
  action: DefenseAction,
  inputOffsetMs: number,
): DefenseResult {
  const hit = state.chain[state.chainHitIndex];
  if (!hit) {
    return {
      action,
      success: false,
      perfect: false,
      damageTaken: 0,
      manaGained: 0,
      parryCount: false,
    };
  }
  const windows = defenseWindows(state.difficulty, state.phase);
  const abs = Math.abs(inputOffsetMs);

  let success = false;
  let perfect = false;
  let manaGained = 0;
  let damageTaken = 0;
  let parryCount = false;

  if (action === 'dodge') {
    if (abs <= windows.dodgeMs) {
      success = true;
    }
  } else if (action === 'parry') {
    if (hit.kind === 'gradient') {
      // Parry always fails on gradient — read the red, dodge instead.
      success = false;
    } else if (abs <= windows.perfectParryMs) {
      success = true;
      perfect = true;
      manaGained = 2;
      parryCount = true;
    } else if (abs <= windows.parryMs) {
      success = true;
      manaGained = 1;
      parryCount = true;
    }
  }

  if (!success) {
    damageTaken = applyPetDamage(state, hit.damage);
  } else {
    state.mana = clampMana(state.mana + manaGained);
    if (parryCount) {
      state.chainParries += 1;
      if (perfect) state.chainPerfectParries += 1;
    }
  }

  state.chainHitsResolved += 1;
  state.chainHitIndex += 1;

  return { action, success, perfect, damageTaken, manaGained, parryCount };
}

/**
 * After the last hit of a chain: fire counter if fully parried, apply
 * Gustave charge, rotate Maelle stance, check win/loss, return to your turn.
 */
export function finishBossChain(state: CombatState): {
  counterDmg: number;
  fullyParried: boolean;
  allPerfect: boolean;
  lost: boolean;
  won: boolean;
} {
  const hitCount = state.chain.length;
  // Fully parried = every hit was successfully parried (not dodged).
  // Gradient hits cannot be parried, so a chain with gradients can never
  // fully-parry for the counter — by design (dodge the reds).
  const fullyParried =
    hitCount > 0 &&
    state.chainParries === hitCount &&
    state.chain.every((h) => h.kind === 'normal');
  const allPerfect = fullyParried && state.chainPerfectParries === hitCount;

  let counterDmg = 0;
  if (fullyParried) {
    counterDmg = counterDamage(hitCount, allPerfect);
    applyBossDamage(state, counterDmg);
    state.combatPhase = 'counter';
    state.log.push(`Counter! ${counterDmg} dmg`);
  }

  state.lastChainFullyParried = fullyParried;

  // Gustave charge.
  if (state.bossId === 'gustave' && state.activeAttack) {
    if (state.activeAttack.isOvercharge) {
      state.charge = 0;
    } else if (state.activeAttack.chargeGain) {
      state.charge = Math.min(3, state.charge + state.activeAttack.chargeGain);
    }
  }

  // Maelle rotates stance between turns.
  if (state.bossId === 'maelle') {
    state.stance = nextMaelleStance(state.stance);
  }

  state.activeAttack = null;
  state.chain = [];
  state.chainHitIndex = 0;

  if (state.petHp <= 0) {
    state.combatPhase = 'lost';
    return { counterDmg, fullyParried, allPerfect, lost: true, won: false };
  }
  if (state.bossHp <= 0) {
    state.combatPhase = 'won';
    return { counterDmg, fullyParried, allPerfect, lost: false, won: true };
  }
  state.combatPhase = 'your-turn';
  return { counterDmg, fullyParried, allPerfect, lost: false, won: false };
}

/**
 * Scripted balance sim: competent player lands 80% of sweep arcs (half of
 * those perfect), parries normal hits, dodges gradients. Returns turn count
 * and whether the pet survived.
 */
export function simulateCompetentFight(
  bossId: ExpeditionBossId,
  difficulty: ExpeditionDifficulty,
  seed = 1,
  maxTurns = 80,
): { turns: number; survived: boolean; won: boolean; petHp: number; bossHp: number } {
  const state = createCombat(bossId, difficulty);
  const random = mulberry32(seed);
  let turns = 0;

  while (turns < maxTurns && state.combatPhase !== 'won' && state.combatPhase !== 'lost') {
    turns += 1;
    // Player turn: pick best affordable paid ability or Nibble.
    const offer = offeredAbilities(state.mana);
    const pick =
      offer.filter((a) => a.id !== 'nibble').sort((a, b) => b.mana - a.mana)[0] ?? offer[0]!;

    // Approximate sweep without geometry: 80% arcs land, 50% of those perfect.
    const arcs = pick.arcs;
    let dmg = 0;
    let landed = 0;
    for (let i = 0; i < arcs; i++) {
      if (random() < 0.8) {
        landed += 1;
        const perfect = random() < 0.5;
        dmg += perfect ? Math.round(pick.dmgPerArc * 1.5) : pick.dmgPerArc;
      }
    }
    if (landed === arcs) dmg = Math.round(dmg * 1.25);

    if (pick.mana > 0) state.mana = clampMana(state.mana - pick.mana);
    if (pick.manaGrant) state.mana = clampMana(state.mana + pick.manaGrant);
    if (landed === arcs) state.mana = clampMana(state.mana + 1);
    applyBossDamage(state, dmg);
    if (state.bossHp <= 0) {
      state.combatPhase = 'won';
      break;
    }

    state.combatPhase = 'boss-react';
    beginBossTurn(state, seed + turns);
    startChainHits(state);
    while (state.chainHitIndex < state.chain.length) {
      const hit = state.chain[state.chainHitIndex]!;
      const action: DefenseAction = hit.kind === 'gradient' ? 'dodge' : 'parry';
      // Competent: always inside the window, never perfect-parry stack abuse —
      // 40% perfect parries.
      const windows = defenseWindows(state.difficulty, state.phase);
      let offset = 0;
      if (action === 'parry' && random() >= 0.4) {
        offset = Math.floor(windows.perfectParryMs + 1);
        if (offset > windows.parryMs) offset = Math.floor(windows.parryMs * 0.5);
      }
      resolveDefense(state, action, offset);
    }
    finishBossChain(state);
  }

  return {
    turns,
    survived: state.petHp > 0,
    won: state.combatPhase === 'won',
    petHp: state.petHp,
    bossHp: state.bossHp,
  };
}

