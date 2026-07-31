/**
 * Prints the fishing minigame balance table.
 *
 *   npm run sim:fishing
 *
 * Every cell is a catch rate over `TRIALS` simulated fights. Read it as: can a
 * player of this skill land a fish of this size? Nothing should be 0.00, and
 * nothing at the big end should be 1.00.
 */

import {
  PLAYER_MODELS,
  SIM_SIZES,
  runSim,
} from '../src/systems/fishingSimulation.ts';

const TRIALS = 4000;
const MINIGAMES = ['keepitin', 'sweep'] as const;

const pct = (n: number) => (n * 100).toFixed(0).padStart(3) + '%';

for (const minigame of MINIGAMES) {
  console.log(`\n${minigame === 'keepitin' ? 'KEEP IT IN' : 'THE SWEEP'}  (${TRIALS} fights per cell)`);
  console.log('  size  ' + PLAYER_MODELS.map((m) => m.name.padStart(8)).join('') + '     avg fight');
  console.log('  ' + '-'.repeat(46));
  for (const size of SIM_SIZES) {
    const cells = PLAYER_MODELS.map((model, i) =>
      pct(runSim(minigame, size, model, TRIALS, 1234 + size * 17 + i * 101).catchRate).padStart(8),
    );
    const avgDuration = runSim(minigame, size, PLAYER_MODELS[1]!, TRIALS, 99 + size).meanDurationS;
    console.log(
      `  ${String(size).padStart(3)}cm ` + cells.join('') + `      ${avgDuration.toFixed(1)}s`,
    );
  }
}

console.log('\ncolumns = player skill model; avg fight = "average" player fight length\n');
