import Phaser from 'phaser';
import { characterDepth } from './depth';
import { State } from './GameState';
import { Menu, toast, type MenuOption } from './UI';
import { miniteenDrawScale } from './miniteen';
import {
  BONGBONGEE_FISH_QUEST_ID,
  BONGBONGEE_QUEST_IDS,
  BONGBONGEE_SKIP_QUEST_ID,
  canTurnInQuest,
  combinedQuestMarkerState,
  objectiveProgressLabel,
  progressKindOf,
  QUEST_MARKER_COLOR,
  questDef,
  rewardSummary,
  type QuestDef,
} from './quests';
import { WandererNpc, type NpcTalkCallbacks } from './WandererNpc';

const LINES = [
  'Hihi~ I’m Bongbongee! CARATs call me the little diamond friend.',
  'Pink on top, white below, and “17” on my cheeks — that’s me!',
  'Cafe Cinnamon has outfits that fit me — gem clips, mint puffs… sparkly!',
  'Bong! Bong! Let’s sparkle together.',
  'Mingyu drew me for CARATLAND 2018. I’m basically art.',
  'Visit Cafe Cinnamon if you want diamond clothes for a Bongbongee pet!',
];

/**
 * SEVENTEEN CARAT mascot NPC. Wanders town, chats, and offers a fish quest
 * then a Skip Rope follow-up. Outfits are sold at Cafe Cinnamon (not gifted here).
 */
export class BongbongeeNpc extends WandererNpc {
  private questMarker: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, waypoints: { x: number; y: number }[]) {
    super(scene, {
      name: 'Bongbongee',
      texPrefix: 'bong',
      waypoints,
      // Shared villager height — penguin-tall, like every other NPC.
      scale: miniteenDrawScale(scene, 'bong'),
      speed: 48,
    });
    this.questMarker = scene.add
      .text(0, 0, '!', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: QUEST_MARKER_COLOR.available,
        stroke: '#1a1a2e',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 1)
      .setDepth(characterDepth(this.sprite) + 1)
      .setVisible(false);
    this.refreshQuestMarker();
  }

  override destroy() {
    this.questMarker.destroy();
    super.destroy();
  }

  override update() {
    super.update();
    this.refreshQuestMarker();
  }

  /** Yellow ! if any quest is available, gray while any is active, hidden when all done. */
  refreshQuestMarker() {
    const state = combinedQuestMarkerState(State.data.quests, BONGBONGEE_QUEST_IDS);
    if (!this.isPresent() || !state) {
      this.questMarker.setVisible(false);
      return;
    }
    this.questMarker.setVisible(true);
    this.questMarker.setColor(QUEST_MARKER_COLOR[state]);
    this.questMarker.setPosition(
      this.sprite.x,
      this.sprite.y - this.sprite.displayHeight / 2 - 2,
    );
    this.questMarker.setDepth(characterDepth(this.sprite) + 1);
  }

  protected override openTalk(cbs: NpcTalkCallbacks) {
    const line = this.pickLine(LINES);
    this.playBounce();
    const options: MenuOption[] = [];

    for (const questId of BONGBONGEE_QUEST_IDS) {
      this.pushQuestTalkOptions(cbs, options, questId);
    }

    options.push(
      {
        label: 'Ask about the diamond',
        onSelect: () => {
          cbs.keepMenuOpen();
          this.emote('happy', 1200);
          const follow = new Menu(
            this.scene,
            'Bongbongee',
            [{ label: 'Shine on, little diamond.', onSelect: () => undefined }],
            {
              subtitle: 'Every CARAT is a diamond — that’s why I sparkle!',
              anchor: 'bottom',
              face: this.faceKey(),
            },
          );
          follow.onClose = cbs.onClose;
        },
      },
      {
        label: 'Where do I get your outfits?',
        onSelect: () => {
          cbs.keepMenuOpen();
          this.emote('happy', 1000);
          const follow = new Menu(
            this.scene,
            'Bongbongee',
            [{ label: 'Thanks, Bong!', onSelect: () => undefined }],
            {
              subtitle:
                'Cafe Cinnamon stocks Aqua Gem Clips, Mint Cap Puffs, Diamond Tees, and Carat Sashes — Bongbongee pets only!',
              anchor: 'bottom',
              face: this.faceKey(),
            },
          );
          follow.onClose = cbs.onClose;
        },
      },
      {
        label: 'Ask for a bounce',
        onSelect: () => this.hop(22),
      },
    );

    const menu = new Menu(this.scene, 'Bongbongee', options, {
      subtitle: line,
      anchor: 'bottom',
      face: this.faceKey(),
    });
    menu.onClose = cbs.onClose;
  }

  private pushQuestTalkOptions(
    cbs: NpcTalkCallbacks,
    options: MenuOption[],
    questId: string,
  ) {
    const def = questDef(questId);
    if (!def) return;
    const status = State.getQuestStatus(questId);

    if (status === 'available') {
      const offerLabel =
        questId === BONGBONGEE_SKIP_QUEST_ID
          ? 'Another sparkle job? (quest)'
          : 'I need your help! (quest)';
      options.push({
        label: offerLabel,
        icon: def.itemId,
        onSelect: () => {
          cbs.keepMenuOpen();
          this.openQuestOffer(cbs, def);
        },
      });
      return;
    }

    if (status !== 'active') return;

    const ready = canTurnInQuest(def, State.data.inventory, State.data.questCounters);
    const progress = objectiveProgressLabel(
      def,
      State.data.inventory,
      State.data.questCounters,
    );
    const turnInLabel =
      progressKindOf(def) === 'skipRopeClear'
        ? ready
          ? 'I cleared Skip Rope 3× — claim reward!'
          : `Skip Rope progress (${progress})`
        : ready
          ? `Give 3× Mint Bass — claim reward!`
          : `Hand over Mint Bass (${progress})`;

    options.push({
      label: turnInLabel,
      icon: def.itemId,
      disabled: !ready,
      onSelect: () => {
        if (!State.completeQuest(questId)) return;
        this.emote('happy', 1400);
        toast(
          this.scene,
          this.sprite.x,
          this.sprite.y - 30,
          turnInToast(def),
          '#ffe066',
        );
        this.refreshQuestMarker();
        cbs.onAccessoriesChanged?.();
        cbs.keepMenuOpen();
        const thanks = new Menu(
          this.scene,
          'Bongbongee',
          [{ label: 'Shine on, Bong!', onSelect: () => undefined }],
          {
            subtitle: `${def.completeLine}\nReward: ${rewardSummary(def)}`,
            anchor: 'bottom',
            face: this.faceKey(),
          },
        );
        thanks.onClose = cbs.onClose;
      },
    });
    options.push({
      label: 'Remind me what you need?',
      onSelect: () => {
        cbs.keepMenuOpen();
        this.emote('happy', 900);
        const follow = new Menu(
          this.scene,
          'Bongbongee',
          [{ label: 'On it!', onSelect: () => undefined }],
          {
            subtitle: `${def.objective}\n${objectiveProgressLabel(def, State.data.inventory, State.data.questCounters)}\nReward: ${rewardSummary(def)}`,
            anchor: 'bottom',
            face: this.faceKey(),
            back: {
              label: '← Back to Bongbongee',
              onSelect: () => {
                cbs.keepMenuOpen();
                this.openTalk(cbs);
              },
            },
          },
        );
        follow.onClose = cbs.onClose;
      },
    });
  }

  /** Offer screen lists the reward before the player accepts. */
  private openQuestOffer(cbs: NpcTalkCallbacks, def: QuestDef) {
    this.emote('happy', 1000);
    const needLine =
      progressKindOf(def) === 'skipRopeClear'
        ? `Need: ${def.itemCount}× Skip Rope clear (25 jumps each)`
        : `Need: ${def.itemCount}× ${def.itemLabel}`;
    const acceptHint =
      progressKindOf(def) === 'skipRopeClear'
        ? 'Yay! Hit the Skip Rope booth in the arcade greens — 25 jumps in a row counts as one clear. Press Q to track the quest!'
        : 'Yay! Catch Mint Bass at the Shore — cast farther for better odds. Press Q to track the quest!';
    const acceptLabel =
      progressKindOf(def) === 'skipRopeClear' ? 'I’ll hop to it!' : 'I’ll bring the bass!';

    const menu = new Menu(
      this.scene,
      def.title,
      [
        {
          label: 'Accept quest',
          icon: 'coin',
          onSelect: () => {
            if (!State.acceptQuest(def.id)) return;
            this.emote('happy', 1200);
            toast(this.scene, this.sprite.x, this.sprite.y - 30, 'Quest accepted!', '#a8e6cf');
            this.refreshQuestMarker();
            cbs.keepMenuOpen();
            const follow = new Menu(
              this.scene,
              'Bongbongee',
              [{ label: acceptLabel, onSelect: () => undefined }],
              {
                subtitle: acceptHint,
                anchor: 'bottom',
                face: this.faceKey(),
              },
            );
            follow.onClose = cbs.onClose;
          },
        },
        {
          label: 'Not right now',
          onSelect: () => {
            cbs.keepMenuOpen();
            this.openTalk(cbs);
          },
        },
      ],
      {
        // Rewards shown before accept — player knows the payout up front.
        subtitle: `${def.offerLine}\n\n${needLine}\nReward: ${rewardSummary(def)}`,
        anchor: 'bottom',
        face: this.faceKey(),
        back: {
          label: '← Back to Bongbongee',
          onSelect: () => {
            cbs.keepMenuOpen();
            this.openTalk(cbs);
          },
        },
      },
    );
    menu.onClose = cbs.onClose;
  }
}

function turnInToast(def: QuestDef): string {
  if (def.id === BONGBONGEE_FISH_QUEST_ID) {
    return `+${def.rewardCoins}c · Carat Lightstick!`;
  }
  if (def.id === BONGBONGEE_SKIP_QUEST_ID) {
    return `+${def.rewardCoins}c · 15× Choco Cookie!`;
  }
  return `+${def.rewardCoins}c · ${rewardSummary(def)}`;
}
