/**
 * Expedition — Clair Obscur-style boss duel rules.
 *
 * Pure data + pure functions. No Phaser. Boss identity (HP, attack pool,
 * signature mechanic) lives here; difficulty is a separate multiplier table
 * so the nine-fight grid stays maintainable.
 */

export type ExpeditionDifficulty = 'easy' | 'normal' | 'hard';
export type ExpeditionBossId = 'gustave' | 'maelle' | 'renoir';
export type ExpeditionPhase = 1 | 2 | 3;
export type MaelleStance = 'offensive' | 'defensive' | 'virtuose';
export type HitKind = 'normal' | 'gradient';

export type AbilityId =
  | 'nibble'
  | 'tail-whip'
  | 'puffle-volley'
  | 'chroma-burst'
  | 'lumina-storm'
  | 'gradient-finale';

export type AbilityDef = {
  id: AbilityId;
  name: string;
  mana: number;
  arcs: number;
  dmgPerArc: number;
  /** Nibble grants mana instead of spending it. */
  manaGrant?: number;
  /** Puffle Volley arcs are narrower but the needle is slower. */
  arcWidthScale?: number;
  needleSpeedScale?: number;
};

export type AttackShape =
  | 'single'
  | 'even'
  | 'accelerating'
  | 'uneven'
  | 'tight'
  | 'early'
  | 'shortening'
  | 'alternating'
  | 'near-simultaneous';

export type AttackDef = {
  id: string;
  name: string;
  hits: number;
  dmgPerHit: number;
  shape: AttackShape;
  /** 0-based indices that are gradient (red) hits. */
  gradientHits?: readonly number[];
  /** Gustave: charge stacks added on use. */
  chargeGain?: number;
  /** Gustave: forced when charge reaches 3; spends all stacks. */
  isOvercharge?: boolean;
  /** Maelle: only available in this stance (undefined = any). */
  stance?: MaelleStance;
  /** Base tell duration before the first hit (ms). */
  tellMs?: number;
  /** Gap between hits in ms (shape may warp this). */
  gapMs?: number;
};

export type BossPhaseDef = {
  phase: ExpeditionPhase;
  title: string;
  attacks: readonly AttackDef[];
};

export type BossDef = {
  id: ExpeditionBossId;
  name: string;
  /** One-line personality for the pick screen. */
  blurb: string;
  baseHp: number;
  signature: 'charge' | 'stance' | 'canvas';
  phases: readonly BossPhaseDef[];
};

/** Pet starts every battle with this many hit points. */
export const PET_MAX_HP = 100;
/** Mana cap and starting pool — resets each battle. */
export const MANA_CAP = 10;
export const MANA_START = 5;

/** Phase gates on remaining boss HP fraction. */
export const PHASE_THRESHOLDS = {
  /** Enter phase 2 when HP ≤ this fraction of max. */
  phase2: 2 / 3,
  /** Enter phase 3 when HP ≤ this fraction of max. */
  phase3: 1 / 3,
} as const;

export const ABILITIES: readonly AbilityDef[] = [
  { id: 'nibble', name: 'Nibble', mana: 0, arcs: 2, dmgPerArc: 8, manaGrant: 2 },
  { id: 'tail-whip', name: 'Tail Whip', mana: 1, arcs: 3, dmgPerArc: 10 },
  {
    id: 'puffle-volley',
    name: 'Puffle Volley',
    mana: 2,
    arcs: 4,
    dmgPerArc: 11,
    arcWidthScale: 0.75,
    needleSpeedScale: 0.85,
  },
  { id: 'chroma-burst', name: 'Chroma Burst', mana: 4, arcs: 5, dmgPerArc: 13 },
  { id: 'lumina-storm', name: 'Lumina Storm', mana: 6, arcs: 6, dmgPerArc: 15 },
  { id: 'gradient-finale', name: 'Gradient Finale', mana: 8, arcs: 7, dmgPerArc: 19 },
];

export function abilityById(id: AbilityId): AbilityDef {
  const found = ABILITIES.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown ability ${id}`);
  return found;
}

/** Full-hit total before Bravo multiplier (documented for tests). */
export function abilityAllHitTotal(ability: AbilityDef): number {
  return ability.arcs * ability.dmgPerArc;
}

/**
 * Whether the pet can pay for this ability right now. Nibble (0 cost) is always
 * available; paid skills need `mana >= cost`.
 */
export function canAffordAbility(ability: AbilityDef, mana: number): boolean {
  return ability.mana <= mana;
}

/**
 * Every skill the pet can currently cast. The UI shows the full roster and
 * greys out the rest — this list is the selectable subset (and what the
 * balance sim picks from).
 */
export function offeredAbilities(mana: number): readonly AbilityDef[] {
  return ABILITIES.filter((a) => canAffordAbility(a, mana));
}

export type SweepDifficultyConfig = {
  needleSpeedDegPerSec: number;
  arcWidthDeg: number;
  /** Perfect band is the middle 40% of the arc. */
  perfectBandDeg: number;
};

export const SWEEP_BY_DIFFICULTY: Record<ExpeditionDifficulty, SweepDifficultyConfig> = {
  easy: { needleSpeedDegPerSec: 200, arcWidthDeg: 34, perfectBandDeg: 13.6 },
  normal: { needleSpeedDegPerSec: 260, arcWidthDeg: 26, perfectBandDeg: 10.4 },
  hard: { needleSpeedDegPerSec: 330, arcWidthDeg: 20, perfectBandDeg: 8 },
};

/** Perfect = middle 40% of the arc width. */
export const PERFECT_BAND_FRACTION = 0.4;

export type DefenseWindows = {
  dodgeMs: number;
  parryMs: number;
  perfectParryMs: number;
};

/** Base half-windows before difficulty × phase multipliers. */
export const BASE_DEFENSE_WINDOWS: DefenseWindows = {
  dodgeMs: 150,
  parryMs: 80,
  perfectParryMs: 35,
};

/** Never tighter than this — phones with touch latency need a floor. */
export const WINDOW_FLOOR_MS = 40;

export const DIFFICULTY_WINDOW_MULT: Record<ExpeditionDifficulty, number> = {
  easy: 1.3,
  normal: 1.0,
  hard: 0.78,
};

export const PHASE_WINDOW_MULT: Record<ExpeditionPhase, number> = {
  1: 1.0,
  2: 0.9,
  3: 0.8,
};

export type DifficultyScales = {
  bossHp: number;
  theirDamage: number;
  window: number;
  extraHits: number;
  extraGradient: number;
};

export const DIFFICULTY_SCALES: Record<ExpeditionDifficulty, DifficultyScales> = {
  easy: { bossHp: 0.8, theirDamage: 0.75, window: 1.3, extraHits: 0, extraGradient: 0 },
  normal: { bossHp: 1.0, theirDamage: 1.0, window: 1.0, extraHits: 0, extraGradient: 0 },
  hard: { bossHp: 1.25, theirDamage: 1.3, window: 0.78, extraHits: 1, extraGradient: 1 },
};

export function scaledBossHp(baseHp: number, difficulty: ExpeditionDifficulty): number {
  return Math.round(baseHp * DIFFICULTY_SCALES[difficulty].bossHp);
}

export function defenseWindows(
  difficulty: ExpeditionDifficulty,
  phase: ExpeditionPhase,
): DefenseWindows {
  const mult = DIFFICULTY_WINDOW_MULT[difficulty] * PHASE_WINDOW_MULT[phase];
  const scale = (base: number) => Math.max(WINDOW_FLOOR_MS, Math.round(base * mult));
  return {
    dodgeMs: scale(BASE_DEFENSE_WINDOWS.dodgeMs),
    parryMs: scale(BASE_DEFENSE_WINDOWS.parryMs),
    perfectParryMs: scale(BASE_DEFENSE_WINDOWS.perfectParryMs),
  };
}

/** Counter: 10 + 4×hits, doubled if every parry was perfect. */
export function counterDamage(hits: number, allPerfect: boolean): number {
  const base = 10 + 4 * hits;
  return allPerfect ? base * 2 : base;
}

export const BRAVO_DAMAGE_MULT = 1.25;
export const BRAVO_MANA_REFUND = 1;
export const PERFECT_ARC_MULT = 1.5;

/** Renoir restores this fraction of max HP every third turn unless fully parried. */
export const CANVAS_HEAL_FRACTION = 0.05;
export const CANVAS_TURN_INTERVAL = 3;

export const MAELLE_STANCE_ORDER: readonly MaelleStance[] = [
  'offensive',
  'defensive',
  'virtuose',
];

export const MAELLE_STANCE_EFFECTS: Record<
  MaelleStance,
  { damageDealt: number; damageTaken: number; note: string }
> = {
  offensive: { damageDealt: 1.3, damageTaken: 1.2, note: '+30% dmg · takes +20%' },
  defensive: { damageDealt: 1.0, damageTaken: 0.7, note: '−30% dmg taken · shorter chains' },
  virtuose: { damageDealt: 1.0, damageTaken: 1.0, note: 'Longest chains · guaranteed gradient' },
};

// ── Boss tables ──────────────────────────────────────────────────────────────

const GUSTAVE: BossDef = {
  id: 'gustave',
  name: 'Gustave',
  blurb: 'Engineer with a charged mechanical arm — read the pips.',
  baseHp: 260,
  signature: 'charge',
  phases: [
    {
      phase: 1,
      title: 'Steady hands',
      attacks: [
        {
          id: 'sword-slash',
          name: 'Sword Slash',
          hits: 1,
          dmgPerHit: 9,
          shape: 'single',
          tellMs: 900,
          gapMs: 500,
        },
        {
          id: 'prosthetic-jab',
          name: 'Prosthetic Jab',
          hits: 2,
          dmgPerHit: 7,
          shape: 'even',
          chargeGain: 1,
          tellMs: 700,
          gapMs: 420,
        },
      ],
    },
    {
      phase: 2,
      title: 'Arm online',
      attacks: [
        {
          id: 'lightning-strike',
          name: 'Lightning Strike',
          hits: 3,
          dmgPerHit: 8,
          shape: 'accelerating',
          chargeGain: 1,
          tellMs: 650,
          gapMs: 400,
        },
        {
          id: 'marking-shot',
          name: 'Marking Shot',
          hits: 2,
          dmgPerHit: 11,
          shape: 'even',
          gradientHits: [1],
          tellMs: 700,
          gapMs: 380,
        },
      ],
    },
    {
      phase: 3,
      title: 'Overcharged',
      attacks: [
        {
          id: 'overcharge-burst',
          name: 'Overcharge Burst',
          hits: 4,
          dmgPerHit: 10,
          shape: 'even',
          gradientHits: [3],
          isOvercharge: true,
          tellMs: 800,
          gapMs: 340,
        },
        {
          id: 'rapid-assembly',
          name: 'Rapid Assembly',
          hits: 4,
          dmgPerHit: 7,
          shape: 'tight',
          tellMs: 550,
          gapMs: 280,
        },
      ],
    },
  ],
};

const MAELLE: BossDef = {
  id: 'maelle',
  name: 'Maelle',
  blurb: 'Fencer who swaps stances — punish Offensive, bank on Defensive.',
  baseHp: 340,
  signature: 'stance',
  phases: [
    {
      phase: 1,
      title: 'En garde',
      attacks: [
        {
          id: 'fencers-flourish',
          name: "Fencer's Flourish",
          hits: 2,
          dmgPerHit: 8,
          shape: 'even',
          tellMs: 750,
          gapMs: 400,
        },
        {
          id: 'riposte-feint',
          name: 'Riposte Feint',
          hits: 2,
          dmgPerHit: 9,
          shape: 'uneven',
          tellMs: 700,
          gapMs: 380,
        },
      ],
    },
    {
      phase: 2,
      title: 'Burning blade',
      attacks: [
        {
          id: 'rain-of-fire',
          name: 'Rain of Fire',
          hits: 4,
          dmgPerHit: 8,
          shape: 'even',
          gradientHits: [2],
          tellMs: 650,
          gapMs: 340,
        },
        {
          id: 'phantom-blade',
          name: 'Phantom Blade',
          hits: 3,
          dmgPerHit: 10,
          shape: 'early',
          tellMs: 600,
          gapMs: 360,
        },
      ],
    },
    {
      phase: 3,
      title: 'Crescendo',
      attacks: [
        {
          id: 'crescendo',
          name: 'Crescendo',
          hits: 5,
          dmgPerHit: 9,
          shape: 'shortening',
          tellMs: 600,
          gapMs: 320,
        },
        {
          id: 'stendhal',
          name: 'Stendhal',
          hits: 3,
          dmgPerHit: 14,
          shape: 'even',
          gradientHits: [0, 1, 2],
          tellMs: 700,
          gapMs: 360,
        },
      ],
    },
  ],
};

const RENOIR: BossDef = {
  id: 'renoir',
  name: 'Renoir',
  blurb: 'The canvas paints and erases — full parries stop his heal.',
  baseHp: 460,
  signature: 'canvas',
  phases: [
    {
      phase: 1,
      title: 'The visitor',
      attacks: [
        {
          id: 'grasping-hand',
          name: 'Grasping Hand',
          hits: 2,
          dmgPerHit: 11,
          shape: 'even',
          tellMs: 900,
          gapMs: 480,
        },
        {
          id: 'erasure',
          name: 'Erasure',
          hits: 3,
          dmgPerHit: 9,
          shape: 'even',
          gradientHits: [1],
          tellMs: 750,
          gapMs: 400,
        },
      ],
    },
    {
      phase: 2,
      title: 'The canvas tears',
      attacks: [
        {
          id: 'lithograph',
          name: 'Lithograph',
          hits: 4,
          dmgPerHit: 10,
          shape: 'alternating',
          gradientHits: [1, 3],
          tellMs: 700,
          gapMs: 340,
        },
        {
          id: 'paint-the-dead',
          name: 'Paint the Dead',
          hits: 5,
          dmgPerHit: 8,
          shape: 'near-simultaneous',
          tellMs: 650,
          gapMs: 300,
        },
      ],
    },
    {
      phase: 3,
      title: 'Nothing remains',
      attacks: [
        {
          id: 'requiem',
          name: 'Requiem',
          hits: 6,
          dmgPerHit: 9,
          shape: 'alternating',
          gradientHits: [1, 3, 5],
          tellMs: 600,
          gapMs: 260,
        },
        {
          id: 'final-stroke',
          name: 'Final Stroke',
          hits: 3,
          dmgPerHit: 18,
          shape: 'even',
          gradientHits: [0, 1, 2],
          tellMs: 800,
          gapMs: 380,
        },
      ],
    },
  ],
};

export const BOSSES: Record<ExpeditionBossId, BossDef> = {
  gustave: GUSTAVE,
  maelle: MAELLE,
  renoir: RENOIR,
};

export const BOSS_ORDER: readonly ExpeditionBossId[] = ['gustave', 'maelle', 'renoir'];

// ── Energy & rewards ─────────────────────────────────────────────────────────

export type RewardCell = { energy: number; coins: number; happiness: number };

/**
 * Energy / coin / happiness grid keyed character × difficulty.
 * Renoir-Hard is deliberately above the usual booth coin-per-energy band —
 * the fight is much longer. Tune this table only.
 */
export const EXPEDITION_REWARDS: Record<
  ExpeditionBossId,
  Record<ExpeditionDifficulty, RewardCell>
> = {
  gustave: {
    easy: { energy: 8, coins: 14, happiness: 8 },
    normal: { energy: 10, coins: 22, happiness: 12 },
    hard: { energy: 12, coins: 34, happiness: 16 },
  },
  maelle: {
    easy: { energy: 11, coins: 24, happiness: 12 },
    normal: { energy: 14, coins: 38, happiness: 17 },
    hard: { energy: 17, coins: 56, happiness: 22 },
  },
  renoir: {
    easy: { energy: 14, coins: 38, happiness: 16 },
    normal: { energy: 18, coins: 58, happiness: 22 },
    hard: { energy: 21, coins: 84, happiness: 28 },
  },
};

export const EXPEDITION_LOSS_HAPPINESS = -3;

/** Save-key for a clear: "renoir-hard". */
export function winKey(boss: ExpeditionBossId, difficulty: ExpeditionDifficulty): string {
  return `${boss}-${difficulty}`;
}

export function allWinKeys(): string[] {
  const keys: string[] = [];
  for (const boss of BOSS_ORDER) {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      keys.push(winKey(boss, d));
    }
  }
  return keys;
}

/** Win coins with optional Flawless (+50%, floored) for finishing at full HP. */
export function winCoins(
  boss: ExpeditionBossId,
  difficulty: ExpeditionDifficulty,
  flawless: boolean,
): number {
  const base = EXPEDITION_REWARDS[boss][difficulty].coins;
  if (!flawless) return base;
  return Math.floor(base * 1.5);
}

export function winHappiness(boss: ExpeditionBossId, difficulty: ExpeditionDifficulty): number {
  return EXPEDITION_REWARDS[boss][difficulty].happiness;
}

export function energyCost(boss: ExpeditionBossId, difficulty: ExpeditionDifficulty): number {
  return EXPEDITION_REWARDS[boss][difficulty].energy;
}

/** Cheapest run any Expedition booth option sells — walk-in gate. */
export function expeditionMinEnergy(): number {
  let min = Infinity;
  for (const boss of BOSS_ORDER) {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      min = Math.min(min, EXPEDITION_REWARDS[boss][d].energy);
    }
  }
  return min;
}

export function phaseFromHp(hp: number, maxHp: number): ExpeditionPhase {
  if (maxHp <= 0) return 3;
  const frac = hp / maxHp;
  if (frac <= PHASE_THRESHOLDS.phase3) return 3;
  if (frac <= PHASE_THRESHOLDS.phase2) return 2;
  return 1;
}

export function nextMaelleStance(current: MaelleStance): MaelleStance {
  const i = MAELLE_STANCE_ORDER.indexOf(current);
  return MAELLE_STANCE_ORDER[(i + 1) % MAELLE_STANCE_ORDER.length]!;
}
