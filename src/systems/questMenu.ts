import type Phaser from 'phaser';
import { State } from './GameState';
import {
  listActiveQuestDefs,
  listCompletedQuestDefs,
  objectiveProgressLabel,
  progressKindOf,
  rewardSummary,
  type QuestDef,
} from './quests';
import { Menu, type MenuOption } from './UI';

export interface QuestMenuCallbacks {
  closeMenu: () => void;
  keepMenuOpen: () => void;
}

/** Q / Quest button — active quests first, then completed. */
export function openQuestMenu(scene: Phaser.Scene, cbs: QuestMenuCallbacks) {
  cbs.keepMenuOpen();
  const progress = State.data.quests;
  const active = listActiveQuestDefs(progress);
  const completed = listCompletedQuestDefs(progress);
  const options: MenuOption[] = [];

  if (active.length === 0 && completed.length === 0) {
    options.push({
      label: 'No quests yet — talk to Bongbongee in Town!',
      disabled: true,
      onSelect: () => undefined,
    });
  }

  for (const quest of active) {
    options.push({
      label: `● ${quest.title}`,
      icon: itemIcon(quest),
      onSelect: () => openQuestDetail(scene, cbs, quest, 'active'),
    });
  }
  for (const quest of completed) {
    options.push({
      label: `✓ ${quest.title}`,
      icon: itemIcon(quest),
      onSelect: () => openQuestDetail(scene, cbs, quest, 'completed'),
    });
  }

  const subtitle =
    active.length === 0 && completed.length === 0
      ? 'Q opens the quest log · look for ! above villagers'
      : `Active ${active.length} · Completed ${completed.length} · Q toggles this log`;

  const menu = new Menu(scene, 'Quests', options, {
    subtitle,
    face: 'penguin-down',
  });
  menu.onClose = cbs.closeMenu;
}

function itemIcon(quest: QuestDef): string {
  // Fish textures share their inventory id; cookies/icons fall back fine too.
  return quest.itemId || 'fish';
}

function openQuestDetail(
  scene: Phaser.Scene,
  cbs: QuestMenuCallbacks,
  quest: QuestDef,
  status: 'active' | 'completed',
) {
  cbs.keepMenuOpen();
  const progressLine =
    status === 'active'
      ? `Progress: ${objectiveProgressLabel(quest, State.data.inventory, State.data.questCounters)}`
      : 'Completed — rewards already claimed';
  const subtitle = [
    quest.objective,
    progressLine,
    `Reward: ${rewardSummary(quest)}`,
    `From: ${quest.npcName}`,
  ].join('\n');

  const keepGoing =
    progressKindOf(quest) === 'skipRopeClear' ? 'Keep jumping!' : 'Keep fishing!';

  const menu = new Menu(
    scene,
    status === 'active' ? quest.title : `${quest.title} ✓`,
    [
      {
        label: status === 'active' ? keepGoing : 'Nice work!',
        onSelect: () => undefined,
      },
    ],
    {
      subtitle,
      back: {
        label: '← Back to Quests',
        onSelect: () => openQuestMenu(scene, cbs),
      },
    },
  );
  menu.onClose = cbs.closeMenu;
}
