import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_DEFENSE_WINDOWS,
  BOSSES,
  PHASE_THRESHOLDS,
  WINDOW_FLOOR_MS,
  counterDamage,
  defenseWindows,
  phaseFromHp,
  scaledBossHp,
} from './expeditionRules';
import {
  beginAbility,
  beginBossTurn,
  createCombat,
  finishBossChain,
  finishSweep,
  onSweepTap,
  resolveDefense,
  simulateCompetentFight,
  startChainHits,
} from './expeditionCombat';
import { buildSweep } from './expeditionSweep';
import { abilityById } from './expeditionRules';

test('phase boundaries land on exactly 66% / 33%', () => {
  assert.ok(Math.abs(PHASE_THRESHOLDS.phase2 - 2 / 3) < 1e-12);
  assert.ok(Math.abs(PHASE_THRESHOLDS.phase3 - 1 / 3) < 1e-12);

  const max = 300;
  // Just above 66% → phase 1
  assert.equal(phaseFromHp(Math.floor(max * (2 / 3)) + 1, max), 1);
  // Exactly 66% → phase 2
  assert.equal(phaseFromHp(Math.floor(max * (2 / 3)), max), 2);
  // Exactly 33% → phase 3
  assert.equal(phaseFromHp(Math.floor(max * (1 / 3)), max), 3);
  assert.equal(phaseFromHp(0, max), 3);
});

test('window maths matches the published table including the ±40 ms floor', () => {
  // Easy phase I dodge: 150 * 1.3 * 1.0 = 195
  assert.equal(defenseWindows('easy', 1).dodgeMs, 195);
  // Hard phase III parry: 80 * 0.78 * 0.80 = 49.92 → 50
  assert.equal(defenseWindows('hard', 3).parryMs, 50);
  // Hard phase III dodge: 150 * 0.78 * 0.80 = 93.6 → 94
  assert.equal(defenseWindows('hard', 3).dodgeMs, 94);
  // Floor: even if we had absurd multipliers, never below 40.
  assert.ok(defenseWindows('hard', 3).perfectParryMs >= WINDOW_FLOOR_MS);
  assert.equal(BASE_DEFENSE_WINDOWS.dodgeMs, 150);
  assert.equal(BASE_DEFENSE_WINDOWS.parryMs, 80);
  assert.equal(BASE_DEFENSE_WINDOWS.perfectParryMs, 35);
});

test('parry inside the window pays mana; outside does not', () => {
  const state = createCombat('gustave', 'normal');
  state.combatPhase = 'boss-react';
  beginBossTurn(state, 1);
  // Force a simple 1-hit normal chain.
  state.chain = [{ index: 0, kind: 'normal', damage: 9, atMs: 0 }];
  state.chainHitIndex = 0;
  startChainHits(state);
  const manaBefore = state.mana;
  const ok = resolveDefense(state, 'parry', 0);
  assert.equal(ok.success, true);
  assert.equal(ok.perfect, true);
  assert.equal(ok.manaGained, 2);
  assert.equal(state.mana, manaBefore + 2);

  // Fresh chain, mistimed.
  state.chain = [{ index: 0, kind: 'normal', damage: 9, atMs: 0 }];
  state.chainHitIndex = 0;
  state.chainHitsResolved = 0;
  const mana2 = state.mana;
  const miss = resolveDefense(state, 'parry', 500);
  assert.equal(miss.success, false);
  assert.equal(miss.manaGained, 0);
  assert.equal(state.mana, mana2);
  assert.ok(miss.damageTaken > 0);
});

test('parry against a gradient hit takes damage; dodge works on both kinds', () => {
  const state = createCombat('maelle', 'normal');
  state.chain = [{ index: 0, kind: 'gradient', damage: 14, atMs: 0 }];
  state.chainHitIndex = 0;
  state.combatPhase = 'their-turn-hit';
  const parry = resolveDefense(state, 'parry', 0);
  assert.equal(parry.success, false);
  assert.ok(parry.damageTaken > 0);

  state.petHp = 100;
  state.chain = [{ index: 0, kind: 'gradient', damage: 14, atMs: 0 }];
  state.chainHitIndex = 0;
  const dodgeG = resolveDefense(state, 'dodge', 0);
  assert.equal(dodgeG.success, true);
  assert.equal(dodgeG.damageTaken, 0);

  state.chain = [{ index: 0, kind: 'normal', damage: 8, atMs: 0 }];
  state.chainHitIndex = 0;
  const dodgeN = resolveDefense(state, 'dodge', 0);
  assert.equal(dodgeN.success, true);
  assert.equal(dodgeN.damageTaken, 0);
});

test('fully-parried normal chain fires the counter; a single miss does not', () => {
  const state = createCombat('gustave', 'easy');
  state.combatPhase = 'boss-react';
  beginBossTurn(state, 2);
  // Force a 3-hit all-normal chain.
  state.chain = [
    { index: 0, kind: 'normal', damage: 7, atMs: 0 },
    { index: 1, kind: 'normal', damage: 7, atMs: 300 },
    { index: 2, kind: 'normal', damage: 7, atMs: 600 },
  ];
  state.chainHitIndex = 0;
  startChainHits(state);
  for (let i = 0; i < 3; i++) resolveDefense(state, 'parry', 0);
  const bossBefore = state.bossHp;
  const result = finishBossChain(state);
  assert.equal(result.fullyParried, true);
  assert.equal(result.allPerfect, true);
  assert.equal(result.counterDmg, counterDamage(3, true)); // 10+12=22, *2=44
  assert.equal(state.bossHp, bossBefore - 44);

  // Miss one.
  const state2 = createCombat('gustave', 'easy');
  state2.combatPhase = 'boss-react';
  beginBossTurn(state2, 3);
  state2.chain = [
    { index: 0, kind: 'normal', damage: 7, atMs: 0 },
    { index: 1, kind: 'normal', damage: 7, atMs: 300 },
  ];
  state2.chainHitIndex = 0;
  startChainHits(state2);
  resolveDefense(state2, 'parry', 0);
  resolveDefense(state2, 'none', 0);
  const r2 = finishBossChain(state2);
  assert.equal(r2.fullyParried, false);
  assert.equal(r2.counterDmg, 0);
});

test('counter formula: 10 + 4×hits, doubled if all perfect', () => {
  assert.equal(counterDamage(4, false), 26);
  assert.equal(counterDamage(4, true), 52);
  assert.equal(counterDamage(1, false), 14);
  assert.equal(counterDamage(1, true), 28);
});

test('scaled boss HP matches the plan table', () => {
  assert.equal(scaledBossHp(260, 'easy'), 208);
  assert.equal(scaledBossHp(260, 'normal'), 260);
  assert.equal(scaledBossHp(260, 'hard'), 325);
  assert.equal(scaledBossHp(340, 'easy'), 272);
  assert.equal(scaledBossHp(340, 'normal'), 340);
  assert.equal(scaledBossHp(340, 'hard'), 425);
  assert.equal(scaledBossHp(460, 'easy'), 368);
  assert.equal(scaledBossHp(460, 'normal'), 460);
  assert.equal(scaledBossHp(460, 'hard'), 575);
});

test('Nibble grants mana; paid ability spends it; sweep damages the boss', () => {
  const state = createCombat('gustave', 'normal');
  assert.equal(state.mana, 5);
  const nibble = abilityById('nibble');
  const sweep = buildSweep('nibble', 'normal', 1);
  beginAbility(state, nibble, sweep);
  for (const arc of state.sweep!.arcs) {
    onSweepTap(state, arc.perfectCenterDeg);
  }
  const before = state.bossHp;
  const result = finishSweep(state);
  assert.ok(result.totalDamage > 0);
  assert.equal(state.bossHp, before - result.totalDamage);
  assert.equal(result.bravo, true);
  assert.equal(state.mana, 8); // start 5 + Nibble grant 2 + Bravo refund 1
});

test('balance guard: competent player survives Easy/Normal for all bosses', () => {
  for (const boss of ['gustave', 'maelle', 'renoir'] as const) {
    for (const difficulty of ['easy', 'normal'] as const) {
      const result = simulateCompetentFight(boss, difficulty, 42);
      assert.ok(
        result.won,
        `${boss}/${difficulty} should be winnable (turns=${result.turns}, pet=${result.petHp}, boss=${result.bossHp})`,
      );
      assert.ok(result.survived);
      assert.ok(
        result.turns >= 3 && result.turns <= 60,
        `${boss}/${difficulty} turns ${result.turns} outside 3–60`,
      );
    }
  }
});

test('balance guard: hard fights resolve without infinite loops', () => {
  for (const boss of ['gustave', 'maelle', 'renoir'] as const) {
    const result = simulateCompetentFight(boss, 'hard', 7, 100);
    assert.ok(
      result.won || result.turns >= 10,
      `${boss}/hard should either win or run a meaningful fight (turns=${result.turns})`,
    );
    // Hard may kill a merely-competent player on Renoir; just no hang.
    assert.ok(result.turns <= 100);
  }
});

test('Gustave base HP and Maelle/Renoir tables exist', () => {
  assert.equal(BOSSES.gustave.baseHp, 260);
  assert.equal(BOSSES.maelle.baseHp, 340);
  assert.equal(BOSSES.renoir.baseHp, 460);
  assert.equal(BOSSES.gustave.signature, 'charge');
  assert.equal(BOSSES.maelle.signature, 'stance');
  assert.equal(BOSSES.renoir.signature, 'canvas');
});
