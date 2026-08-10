import Phaser from 'phaser';
import { characterDepth } from './depth';
import { State } from './GameState';
import { Menu, toast, type MenuOption } from './UI';
import { miniteenDrawScale } from './miniteen';
import {
  BONGBONGEE_FISH_QUEST_ID,
  canTurnInQuest,
  objectiveProgressLabel,
  QUEST_MARKER_COLOR,
  questDef,
  questMarkerState,
  rewardSummary,
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

const QUEST = questDef(BONGBONGEE_FISH_QUEST_ID)!;

/**
 * SEVENTEEN CARAT mascot NPC. Wanders town, chats, and offers a fish quest.
 * Outfits are sold at Cafe Cinnamon (not gifted here).
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

  /** Yellow ! before accept, gray ! while active, hidden once complete. */
  refreshQuestMarker() {
    const state = questMarkerState(State.data.quests, BONGBONGEE_FISH_QUEST_ID);
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
    const status = State.getQuestStatus(BONGBONGEE_FISH_QUEST_ID);
    const options: MenuOption[] = [];

    if (status === 'available') {
      options.push({
        label: 'I need your help! (quest)',
        icon: 'oceanfish-uncommon',
        onSelect: () => {
          cbs.keepMenuOpen();
          this.openQuestOffer(cbs);
        },
      });
    } else if (status === 'active') {
      const ready = canTurnInQuest(QUEST, State.data.inventory);
      const progress = objectiveProgressLabel(QUEST, State.data.inventory);
      options.push({
        label: ready
          ? `Give 3× Mint Bass — claim reward!`
          : `Hand over Mint Bass (${progress})`,
        icon: 'oceanfish-uncommon',
        disabled: !ready,
        onSelect: () => {
          if (!State.completeQuest(BONGBONGEE_FISH_QUEST_ID)) return;
          this.emote('happy', 1400);
          toast(
            this.scene,
            this.sprite.x,
            this.sprite.y - 30,
            `+${QUEST.rewardCoins}c · Carat Lightstick!`,
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
              subtitle: `${QUEST.completeLine}\nReward: ${rewardSummary(QUEST)}`,
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
              subtitle: `${QUEST.objective}\n${objectiveProgressLabel(QUEST, State.data.inventory)}\nReward: ${rewardSummary(QUEST)}`,
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

  /** Offer screen lists the reward before the player accepts. */
  private openQuestOffer(cbs: NpcTalkCallbacks) {
    this.emote('happy', 1000);
    const menu = new Menu(
      this.scene,
      'Minty Diamonds',
      [
        {
          label: 'Accept quest',
          icon: 'coin',
          onSelect: () => {
            if (!State.acceptQuest(BONGBONGEE_FISH_QUEST_ID)) return;
            this.emote('happy', 1200);
            toast(this.scene, this.sprite.x, this.sprite.y - 30, 'Quest accepted!', '#a8e6cf');
            this.refreshQuestMarker();
            cbs.keepMenuOpen();
            const follow = new Menu(
              this.scene,
              'Bongbongee',
              [{ label: 'I’ll bring the bass!', onSelect: () => undefined }],
              {
                subtitle:
                  'Yay! Catch Mint Bass at the Shore — cast farther for better odds. Press Q to track the quest!',
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
        subtitle: `${QUEST.offerLine}\n\nNeed: 3× Mint Bass\nReward: ${rewardSummary(QUEST)}`,
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
