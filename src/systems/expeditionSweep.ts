/**
 * Expedition attack QTE — rotating needle + arcs.
 *
 * Pure module: place arcs with a reachability guarantee, score taps as
 * hit / perfect / miss. Seeded RNG so tests can prove every ability ×
 * difficulty pair is physically completable.
 */

import {
  ABILITIES,
  BRAVO_DAMAGE_MULT,
  BRAVO_MANA_REFUND,
  PERFECT_ARC_MULT,
  PERFECT_BAND_FRACTION,
  SWEEP_BY_DIFFICULTY,
  type AbilityDef,
  type AbilityId,
  type ExpeditionDifficulty,
  abilityById,
} from './expeditionRules';

export type Arc = {
  /** Start angle in degrees, [0, 360). */
  startDeg: number;
  /** Inclusive width in degrees. */
  widthDeg: number;
  /** Centre of the perfect band. */
  perfectCenterDeg: number;
  perfectHalfWidthDeg: number;
  consumed: boolean;
  result: 'pending' | 'hit' | 'perfect' | 'miss';
};

export type SweepLayout = {
  ability: AbilityDef;
  difficulty: ExpeditionDifficulty;
  arcs: Arc[];
  needleSpeedDegPerSec: number;
  arcWidthDeg: number;
  /** Full lap duration in ms. */
  lapMs: number;
};

export type TapResult =
  | { kind: 'hit' | 'perfect'; arcIndex: number; damage: number }
  | { kind: 'miss'; reason: 'between' | 'already' | 'empty' };

export type SweepScore = {
  arcResults: Array<'hit' | 'perfect' | 'miss'>;
  rawDamage: number;
  bravo: boolean;
  totalDamage: number;
  manaDelta: number;
};

function normDeg(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

/** Shortest signed distance from a to b on the circle, in (−180, 180]. */
export function angleDelta(from: number, to: number): number {
  let d = normDeg(to) - normDeg(from);
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Whether `needle` sits inside [start, start+width) on the circle. */
export function needleInArc(needleDeg: number, startDeg: number, widthDeg: number): boolean {
  const n = normDeg(needleDeg);
  const s = normDeg(startDeg);
  const rel = normDeg(n - s);
  return rel < widthDeg;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Place `count` arcs around the ring with a **fixed** tap width.
 *
 * Every arc uses exactly `widthDeg` so the correct-tap area never changes
 * between abilities or shrinks under pressure — only spacing and needle
 * speed vary. Arcs are evenly spaced; a small random rotation keeps the
 * pattern from feeling mechanical.
 */
export function placeArcs(
  count: number,
  widthDeg: number,
  random: () => number = Math.random,
): Arc[] {
  if (count < 1) return [];
  const width = widthDeg;
  const step = 360 / count;
  if (width > step + 1e-6) {
    throw new Error(
      `Cannot place ${count} arcs of fixed ${width}° (need step ≥ width, have ${step.toFixed(2)}°)`,
    );
  }
  const rotation = random() * 360;
  const perfectHalf = (width * PERFECT_BAND_FRACTION) / 2;
  const arcs: Arc[] = [];
  for (let i = 0; i < count; i++) {
    const center = rotation + i * step;
    const start = normDeg(center - width / 2);
    arcs.push({
      startDeg: start,
      widthDeg: width,
      perfectCenterDeg: normDeg(center),
      perfectHalfWidthDeg: perfectHalf,
      consumed: false,
      result: 'pending',
    });
  }
  // Gap between arcs is always step - width (equal).
  assertReachable(arcs, step - width);
  return arcs;
}

/**
 * Assert no overlap and every gap ≥ `minGapDeg` (the placement floor used).
 * Callers pass either the preferred arc-width gap or the reduced floor.
 */
export function assertReachable(arcs: readonly Arc[], minGapDeg: number): void {
  if (arcs.length === 0) return;
  const sorted = [...arcs].sort((a, b) => a.startDeg - b.startDeg);
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const next = sorted[(i + 1) % sorted.length]!;
    const curEnd = cur.startDeg + cur.widthDeg;
    let gap: number;
    if (i < sorted.length - 1) {
      gap = next.startDeg - curEnd;
    } else {
      // Wrap: from end of last to start of first + 360.
      gap = next.startDeg + 360 - curEnd;
    }
    if (gap < minGapDeg - 1e-6) {
      throw new Error(
        `Arc gap ${gap.toFixed(2)}° < required ${minGapDeg}° between arcs ${i} and ${(i + 1) % sorted.length}`,
      );
    }
  }
  // Overlap check: each arc's interior must not contain another's start.
  for (let i = 0; i < sorted.length; i++) {
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (needleInArc(b.startDeg, a.startDeg, a.widthDeg - 1e-9)) {
        throw new Error(`Arcs ${i} and ${j} overlap`);
      }
    }
  }
}

export function buildSweep(
  abilityId: AbilityId,
  difficulty: ExpeditionDifficulty,
  seed = 1,
): SweepLayout {
  const ability = abilityById(abilityId);
  const base = SWEEP_BY_DIFFICULTY[difficulty];
  // Fixed tap area for the difficulty tier — ability scale no longer shrinks
  // the hit zone (same area every cast). Needle speed may still vary.
  const arcWidthDeg = base.arcWidthDeg;
  const needleSpeed = base.needleSpeedDegPerSec * (ability.needleSpeedScale ?? 1);
  const random = mulberry32(seed);
  const arcs = placeArcs(ability.arcs, arcWidthDeg, random);
  return {
    ability,
    difficulty,
    arcs,
    needleSpeedDegPerSec: needleSpeed,
    arcWidthDeg,
    lapMs: (360 / needleSpeed) * 1000,
  };
}

/**
 * Score a tap at the given needle angle. Consumes at most one arc.
 * Mashing while outside arcs is a no-op miss (does not auto-fail remaining).
 */
export function tapSweep(layout: SweepLayout, needleDeg: number): TapResult {
  for (let i = 0; i < layout.arcs.length; i++) {
    const arc = layout.arcs[i]!;
    if (!needleInArc(needleDeg, arc.startDeg, arc.widthDeg)) continue;
    if (arc.consumed) return { kind: 'miss', reason: 'already' };
    arc.consumed = true;
    const dist = Math.abs(angleDelta(needleDeg, arc.perfectCenterDeg));
    const perfect = dist <= arc.perfectHalfWidthDeg;
    const base = layout.ability.dmgPerArc;
    if (perfect) {
      arc.result = 'perfect';
      return { kind: 'perfect', arcIndex: i, damage: Math.round(base * PERFECT_ARC_MULT) };
    }
    arc.result = 'hit';
    return { kind: 'hit', arcIndex: i, damage: base };
  }
  return { kind: 'miss', reason: 'between' };
}

/**
 * After the needle completes a full lap, any unconsumed arcs become misses
 * and the final score is computed.
 */
export function finalizeSweep(layout: SweepLayout, damageSoFar: number): SweepScore {
  for (const arc of layout.arcs) {
    if (!arc.consumed) {
      arc.consumed = true;
      arc.result = 'miss';
    }
  }
  const arcResults = layout.arcs.map((a) =>
    a.result === 'pending' ? 'miss' : a.result,
  ) as Array<'hit' | 'perfect' | 'miss'>;
  const landed = arcResults.filter((r) => r === 'hit' || r === 'perfect').length;
  const bravo = landed === layout.ability.arcs;
  let total = damageSoFar;
  let manaDelta = 0;
  if (layout.ability.manaGrant) {
    manaDelta += layout.ability.manaGrant;
  } else {
    manaDelta -= layout.ability.mana;
  }
  if (bravo) {
    total = Math.round(total * BRAVO_DAMAGE_MULT);
    manaDelta += BRAVO_MANA_REFUND;
  }
  return {
    arcResults,
    rawDamage: damageSoFar,
    bravo,
    totalDamage: total,
    manaDelta,
  };
}

/** Documented Bravo total for a perfect all-hit sweep (every arc perfect). */
export function documentedBravoTotal(ability: AbilityDef): number {
  const raw = ability.arcs * Math.round(ability.dmgPerArc * PERFECT_ARC_MULT);
  return Math.round(raw * BRAVO_DAMAGE_MULT);
}

/** Documented all-hit (no perfects) Bravo total. */
export function documentedAllHitBravoTotal(ability: AbilityDef): number {
  return Math.round(ability.arcs * ability.dmgPerArc * BRAVO_DAMAGE_MULT);
}

/** Every ability × difficulty is placeable (used by tests + build-time assert). */
export function assertAllSweepsPlaceable(seeds: number[] = [1, 2, 3, 7, 42]): void {
  for (const ability of ABILITIES) {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (const seed of seeds) {
        buildSweep(ability.id, difficulty, seed);
      }
    }
  }
}
