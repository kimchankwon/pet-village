/**
 * Quest definitions and pure helpers. Progress lives on SaveData.quests;
 * GameState owns accept / turn-in mutations.
 */

/** Saved progress for one quest. Missing key = available (not yet accepted). */
export type QuestProgressState = 'active' | 'completed';

export type QuestProgress = Record<string, QuestProgressState>;

export type QuestMarkerState = 'available' | 'active';

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
  /** Inventory item the player must hand over. */
  itemId: string;
  itemCount: number;
  /** Display name of the required item. */
  itemLabel: string;
  rewardCoins: number;
  rewardItems: readonly QuestRewardItem[];
  /** Flavour line when offering the quest (rewards listed separately). */
  offerLine: string;
  /** Flavour line after turn-in. */
  completeLine: string;
}

/** Bongbongee's first ask: three Mint Bass from shore fishing. */
export const BONGBONGEE_FISH_QUEST_ID = 'bongbongee-mint-bass';

export const QUESTS: Record<string, QuestDef> = {
  [BONGBONGEE_FISH_QUEST_ID]: {
    id: BONGBONGEE_FISH_QUEST_ID,
    title: 'Minty Diamonds',
    npcName: 'Bongbongee',
    objective: 'Bring Bongbongee 3× Mint Bass',
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
};

export function isQuestId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(QUESTS, id);
}

export function questDef(id: string): QuestDef | undefined {
  return QUESTS[id];
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

export function questStatus(
  progress: QuestProgress | undefined,
  questId: string,
): 'available' | 'active' | 'completed' {
  const state = progress?.[questId];
  if (state === 'active' || state === 'completed') return state;
  return 'available';
}

/** Exclamation-mark state above an NPC, or null when the mark should hide. */
export function questMarkerState(
  progress: QuestProgress | undefined,
  questId: string,
): QuestMarkerState | null {
  const status = questStatus(progress, questId);
  if (status === 'completed') return null;
  return status === 'active' ? 'active' : 'available';
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
): string {
  const have = Math.min(def.itemCount, inventory[def.itemId] ?? 0);
  return `${def.itemLabel} ${have}/${def.itemCount}`;
}

export function canTurnInQuest(
  def: QuestDef,
  inventory: Record<string, number>,
): boolean {
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
