/**
 * Quest definitions and pure helpers. Progress lives on SaveData.quests;
 * activity counters (e.g. Skip Rope clears) live on SaveData.questCounters.
 * GameState owns accept / turn-in mutations.
 */

/** Saved progress for one quest. Missing key = available (not yet accepted). */
export type QuestProgressState = 'active' | 'completed';

export type QuestProgress = Record<string, QuestProgressState>;

export type QuestMarkerState = 'available' | 'active';

/** How a quest tracks its objective. Default is inventory hand-in. */
export type QuestProgressKind = 'item' | 'skipRopeClear';

export interface QuestRewardItem {
  id: string;
  count: number;
  /** Display name for menus (kept here so this module stays free of GameState). */
  label: string;
}

export interface QuestDef {
  id: string;
  /** Short title for the quest log. */
  title: string;
  /** NPC who gives the quest. */
  npcName: string;
  /** One-line objective shown in the log and turn-in prompt. */
  objective: string;
  /**
   * How progress is counted. `'item'` (default) spends inventory on turn-in;
   * `'skipRopeClear'` counts full Skip Rope clears while the quest is active.
   */
  progressKind?: QuestProgressKind;
  /**
   * Inventory item required for item quests, or a texture key used as the
   * menu icon for activity quests.
   */
  itemId: string;
  itemCount: number;
  /** Display name of the required item / activity unit. */
  itemLabel: string;
  rewardCoins: number;
  rewardItems: readonly QuestRewardItem[];
  /** Flavour line when offering the quest (rewards listed separately). */
  offerLine: string;
  /** Flavour line after turn-in. */
  completeLine: string;
  /** Only becomes available after this quest is completed. */
  requiresQuestId?: string;
}

/** Bongbongee's first ask: three Mint Bass from shore fishing. */
export const BONGBONGEE_FISH_QUEST_ID = 'bongbongee-mint-bass';

/** After Minty Diamonds: clear Skip Rope three times, then return. */
export const BONGBONGEE_SKIP_QUEST_ID = 'bongbongee-skip-rope';

/** Quests Bongbongee hands out, in story order. */
export const BONGBONGEE_QUEST_IDS = [
  BONGBONGEE_FISH_QUEST_ID,
  BONGBONGEE_SKIP_QUEST_ID,
] as const;

export const QUESTS: Record<string, QuestDef> = {
  [BONGBONGEE_FISH_QUEST_ID]: {
    id: BONGBONGEE_FISH_QUEST_ID,
    title: 'Minty Diamonds',
    npcName: 'Bongbongee',
    objective: 'Bring Bongbongee 3× Mint Bass',
    progressKind: 'item',
    itemId: 'oceanfish-uncommon',
    itemCount: 3,
    itemLabel: 'Mint Bass',
    rewardCoins: 100,
    rewardItems: [{ id: 'lightstick', count: 1, label: 'Carat Lightstick' }],
    offerLine:
      'Hihi~ I’m craving mint sparkles! Could you catch me 3× Mint Bass at the Shore?',
    completeLine:
      'Bong! Bong! These Mint Bass shimmer like diamonds. You’re the best CARAT!',
  },
  [BONGBONGEE_SKIP_QUEST_ID]: {
    id: BONGBONGEE_SKIP_QUEST_ID,
    title: 'Jump Rope Sparkle',
    npcName: 'Bongbongee',
    objective: 'Clear Skip Rope (25 jumps) 3 times',
    progressKind: 'skipRopeClear',
    // Texture key for menus — reward is choco cookies.
    itemId: 'cookie',
    itemCount: 3,
    itemLabel: 'Skip Rope clear',
    rewardCoins: 120,
    rewardItems: [{ id: 'cookie', count: 15, label: 'Choco Cookie' }],
    offerLine:
      'Bong! Bong! My feet want to sparkle! Clear Skip Rope 3 times — 25 jumps in a row each time — then bounce back to me!',
    completeLine:
      'You hopped like a diamond in the sky! Snack time for my favourite CARAT!',
    requiresQuestId: BONGBONGEE_FISH_QUEST_ID,
  },
};

export function isQuestId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(QUESTS, id);
}

export function questDef(id: string): QuestDef | undefined {
  return QUESTS[id];
}

export function progressKindOf(def: QuestDef): QuestProgressKind {
  return def.progressKind ?? 'item';
}

export function normalizeQuestProgress(raw: unknown): QuestProgress {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: QuestProgress = {};
  for (const [id, state] of Object.entries(raw as Record<string, unknown>)) {
    if (!isQuestId(id)) continue;
    if (state === 'active' || state === 'completed') out[id] = state;
  }
  return out;
}

/** Counters for activity-style quests (only known ids, non-negative ints). */
export function normalizeQuestCounters(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isQuestId(id)) continue;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      out[id] = Math.floor(value);
    }
  }
  return out;
}

export function questStatus(
  progress: QuestProgress | undefined,
  questId: string,
): 'locked' | 'available' | 'active' | 'completed' {
  const state = progress?.[questId];
  if (state === 'active' || state === 'completed') return state;
  const def = QUESTS[questId];
  if (def?.requiresQuestId && questStatus(progress, def.requiresQuestId) !== 'completed') {
    return 'locked';
  }
  return 'available';
}

/** Exclamation-mark state above an NPC, or null when the mark should hide. */
export function questMarkerState(
  progress: QuestProgress | undefined,
  questId: string,
): QuestMarkerState | null {
  const status = questStatus(progress, questId);
  if (status === 'completed' || status === 'locked') return null;
  return status === 'active' ? 'active' : 'available';
}

/**
 * Combined marker for an NPC that offers several quests: yellow if any is
 * available, gray if only actives remain, hidden when all are done/locked.
 */
export function combinedQuestMarkerState(
  progress: QuestProgress | undefined,
  questIds: readonly string[],
): QuestMarkerState | null {
  let hasActive = false;
  for (const id of questIds) {
    const state = questMarkerState(progress, id);
    if (state === 'available') return 'available';
    if (state === 'active') hasActive = true;
  }
  return hasActive ? 'active' : null;
}

export function rewardSummary(def: QuestDef): string {
  const parts = [`${def.rewardCoins} coins`];
  for (const reward of def.rewardItems) {
    parts.push(reward.count > 1 ? `${reward.count}× ${reward.label}` : reward.label);
  }
  return parts.join(' + ');
}

export function objectiveProgressLabel(
  def: QuestDef,
  inventory: Record<string, number>,
  counters?: Record<string, number>,
): string {
  if (progressKindOf(def) === 'skipRopeClear') {
    const have = Math.min(def.itemCount, counters?.[def.id] ?? 0);
    return `${def.itemLabel} ${have}/${def.itemCount}`;
  }
  const have = Math.min(def.itemCount, inventory[def.itemId] ?? 0);
  return `${def.itemLabel} ${have}/${def.itemCount}`;
}

export function canTurnInQuest(
  def: QuestDef,
  inventory: Record<string, number>,
  counters?: Record<string, number>,
): boolean {
  if (progressKindOf(def) === 'skipRopeClear') {
    return (counters?.[def.id] ?? 0) >= def.itemCount;
  }
  return (inventory[def.itemId] ?? 0) >= def.itemCount;
}

export function listActiveQuestDefs(progress: QuestProgress | undefined): QuestDef[] {
  return Object.values(QUESTS).filter((q) => questStatus(progress, q.id) === 'active');
}

export function listCompletedQuestDefs(progress: QuestProgress | undefined): QuestDef[] {
  return Object.values(QUESTS).filter((q) => questStatus(progress, q.id) === 'completed');
}

/** Bright yellow for available; muted gray once accepted. */
export const QUEST_MARKER_COLOR: Record<QuestMarkerState, string> = {
  available: '#ffe066',
  active: '#9a9ab0',
};
