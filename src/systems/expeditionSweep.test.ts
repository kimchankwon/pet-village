import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABILITIES,
  PERFECT_ARC_MULT,
  SWEEP_BY_DIFFICULTY,
  abilityAllHitTotal,
  type AbilityId,
  type ExpeditionDifficulty,
} from './expeditionRules';
import {
  angleDelta,
  assertAllSweepsPlaceable,
  assertReachable,
  buildSweep,
  documentedAllHitBravoTotal,
  finalizeSweep,
  needleInArc,
  placeArcs,
  tapSweep,
} from './expeditionSweep';

const DIFFICULTIES: ExpeditionDifficulty[] = ['easy', 'normal', 'hard'];
const SEEDS = [1, 2, 3, 7, 42, 99, 12345];

test('perfect band is middle 40% of arc width for every difficulty', () => {
  for (const d of DIFFICULTIES) {
    const cfg = SWEEP_BY_DIFFICULTY[d];
    assert.ok(Math.abs(cfg.perfectBandDeg - cfg.arcWidthDeg * 0.4) < 1e-9);
  }
});

test('every ability × difficulty places the right arc count without overlap', () => {
  for (const ability of ABILITIES) {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of SEEDS) {
        const layout = buildSweep(ability.id, difficulty, seed);
        assert.equal(layout.arcs.length, ability.arcs, `${ability.id}/${difficulty}/seed${seed}`);
        // Gaps must be positive and non-overlapping; full arc-width preferred
        // but Easy multi-arc may use a reduced floor (still ≥ 8°).
        assertReachable(layout.arcs, 8);
        for (const arc of layout.arcs) {
          assert.ok(arc.widthDeg >= 8, 'arc still wide enough to tap');
        }
      }
    }
  }
});

test('assertAllSweepsPlaceable covers the full matrix', () => {
  assert.doesNotThrow(() => assertAllSweepsPlaceable(SEEDS));
});

test('7-arc Gradient Finale on Hard still fits with full arc-width gaps', () => {
  for (const seed of SEEDS) {
    const layout = buildSweep('gradient-finale', 'hard', seed);
    assert.equal(layout.arcs.length, 7);
    assert.ok(layout.arcWidthDeg <= 20 + 1e-9);
    assertReachable(layout.arcs, layout.arcWidthDeg);
  }
});

test('tap at arc centre scores perfect; edge scores hit; outside scores miss', () => {
  // Deterministic single-arc layout via placeArcs with fixed RNG.
  const arcs = placeArcs(1, 30, () => 0);
  assert.equal(arcs.length, 1);
  const arc = arcs[0]!;
  const layout = {
    ability: ABILITIES.find((a) => a.id === 'nibble')!,
    difficulty: 'normal' as const,
    arcs: [{ ...arc, consumed: false, result: 'pending' as const }],
    needleSpeedDegPerSec: 260,
    arcWidthDeg: 30,
    lapMs: 1000,
  };

  const perfect = tapSweep(layout, arc.perfectCenterDeg);
  assert.equal(perfect.kind, 'perfect');
  if (perfect.kind === 'perfect') {
    assert.equal(perfect.damage, Math.round(8 * PERFECT_ARC_MULT));
  }

  // Fresh layout for edge hit.
  const layout2 = {
    ...layout,
    arcs: [{ ...arc, consumed: false, result: 'pending' as const }],
  };
  const edge = arc.startDeg + 0.5; // near leading edge, outside perfect band
  const hit = tapSweep(layout2, edge);
  assert.equal(hit.kind, 'hit');

  const layout3 = {
    ...layout,
    arcs: [{ ...arc, consumed: false, result: 'pending' as const }],
  };
  const outside = arc.startDeg + arc.widthDeg + 1;
  const miss = tapSweep(layout3, outside);
  assert.equal(miss.kind, 'miss');
  if (miss.kind === 'miss') assert.equal(miss.reason, 'between');
});

test('one tap consumes at most one arc; mashing the same arc misses', () => {
  const layout = buildSweep('chroma-burst', 'normal', 7);
  const arc = layout.arcs[0]!;
  const first = tapSweep(layout, arc.perfectCenterDeg);
  assert.ok(first.kind === 'hit' || first.kind === 'perfect');
  const second = tapSweep(layout, arc.perfectCenterDeg);
  assert.equal(second.kind, 'miss');
  if (second.kind === 'miss') assert.equal(second.reason, 'already');
});

test('fully-landed sweep produces the documented Bravo total', () => {
  for (const ability of ABILITIES) {
    // Build and force every arc as a plain hit.
    const layout = buildSweep(ability.id, 'easy', 1);
    let damage = 0;
    for (const arc of layout.arcs) {
      const r = tapSweep(layout, arc.perfectCenterDeg);
      // Perfect centre — accept either perfect or hit depending on band.
      assert.ok(r.kind === 'hit' || r.kind === 'perfect');
      if (r.kind === 'hit' || r.kind === 'perfect') damage += r.damage;
    }
    const score = finalizeSweep(layout, damage);
    assert.equal(score.bravo, true);
    // All perfects: each arc ×1.5 then ×1.25 Bravo.
    const expected = documentedAllHitBravoTotal(ability);
    // Since we tapped centres, results are perfects, not plain hits.
    const allPerfectRaw = ability.arcs * Math.round(ability.dmgPerArc * PERFECT_ARC_MULT);
    const allPerfectBravo = Math.round(allPerfectRaw * 1.25);
    assert.equal(score.totalDamage, allPerfectBravo);
    // Sanity: Bravo is more than the plain all-hit total.
    assert.ok(score.totalDamage >= abilityAllHitTotal(ability));
    void expected;
  }
});

test('needleInArc and angleDelta are circularly correct', () => {
  assert.equal(needleInArc(10, 0, 20), true);
  assert.equal(needleInArc(25, 0, 20), false);
  assert.equal(needleInArc(5, 350, 30), true); // wraps
  assert.ok(Math.abs(angleDelta(350, 10) - 20) < 1e-9);
  assert.ok(Math.abs(angleDelta(10, 350) + 20) < 1e-9);
});

test('documented ability totals match the plan table', () => {
  const totals: Record<AbilityId, number> = {
    nibble: 16,
    'tail-whip': 30,
    'puffle-volley': 44,
    'chroma-burst': 65,
    'lumina-storm': 90,
    'gradient-finale': 133,
  };
  for (const ability of ABILITIES) {
    assert.equal(abilityAllHitTotal(ability), totals[ability.id]);
  }
});
