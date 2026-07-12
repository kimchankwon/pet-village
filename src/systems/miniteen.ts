import Phaser from 'phaser';
import { State } from './GameState';
import { Menu, toast, type MenuOption } from './UI';
import { WandererNpc, type NpcTalkCallbacks } from './WandererNpc';

/**
 * The 13 MINITEEN villagers — SEVENTEEN's official mini characters
 * (kprofiles.com/miniteen-seventeen-members-profile). Each wanders a home
 * patch of town, chats, and hands out one small coin gift per day.
 */
export interface MiniteenDef {
  id: string; // asset folder + texture prefix suffix
  name: string; // official character name
  member: string; // the SEVENTEEN member they represent
  bio: string; // one-liner shown under the menu title
  lines: string[]; // chat lines
  gift: number; // daily coin gift
  /** Home anchor in tile coords; waypoints spread around it. */
  home: { tx: number; ty: number };
}

export const MINITEEN: MiniteenDef[] = [
  {
    id: 'choitcherry',
    name: 'CHOITCHERRY',
    member: 'S.Coups',
    bio: 'Shy but buff rabbit · cherry tail',
    lines: [
      'Hmph. These muscles? Just… rabbit stuff.',
      'Don’t look at me too much. I get shy. But also — look at me.',
      'My cherry tail? It’s not a snack. Stop asking.',
      'Cherry season is the best season. For… no reason.',
      'I did 100 hops this morning. Casually.',
    ],
    gift: 4,
    home: { tx: 4, ty: 10 },
  },
  {
    id: 'jjongtoram',
    name: 'JJONGTORAM',
    member: 'Jeonghan',
    bio: 'Squirrel in a pink bunny suit · loves bets',
    lines: [
      'Bet you can’t guess how much energy my ears have left today.',
      'This bunny suit? Strategic. Everyone underestimates a bunny.',
      'Wanna bet a coin on it? …Actually, keep your coin. Here’s mine.',
      'Ears at 80% today. A very good day for mischief.',
      'I flew here on a blanket. Don’t question it.',
    ],
    gift: 5,
    home: { tx: 8, ty: 12.5 },
  },
  {
    id: 'shuasumi',
    name: 'SHUASUMI',
    member: 'Joshua',
    bio: 'A gentle deer · washes three times a day',
    lines: [
      'Oh, hello. Careful — the path is a bit dusty today.',
      'I collect perfumes. This one is “Morning Meadow No. 17”.',
      'No bugs near the pond today. A perfect afternoon.',
      'I washed my antlers twice already. Third time soon.',
      'A clean path is a happy path, don’t you think?',
    ],
    gift: 3,
    home: { tx: 12, ty: 8 },
  },
  {
    id: 'ocl',
    name: 'O.C.L',
    member: 'Jun',
    bio: 'Mysterious cat triplets: Open, Close & Lock',
    lines: [
      'Am I Open, Close, or Lock today? …That’s a secret.',
      'The other two are watching you right now. Probably.',
      'Every door in this village answers to us. Meow.',
      'One of us opened the shop door last night. No comment.',
      'Three cats, one tower. Perfect balance.',
    ],
    gift: 4,
    home: { tx: 19, ty: 5 },
  },
  {
    id: 'tamtam',
    name: 'TAMTAM',
    member: 'Hoshi',
    bio: 'Lucky tiger with a cute tummy · Horanghae!',
    lines: [
      'Horanghae! Rub the tummy for good luck. Gently!!',
      'I was thinking about CARATs again. And rolling. Mostly rolling.',
      'Tigers bring luck. Lucky you — I live here now.',
      'My tummy told me today is a lucky day!',
      'If you see me rolling, join in. That’s the rule.',
    ],
    gift: 5,
    home: { tx: 20, ty: 12.5 },
  },
  {
    id: 'foxdungee',
    name: 'FOXDUNGEE',
    member: 'Wonwoo',
    bio: 'Curious purple fox with six tails',
    lines: [
      'Six tails. Yes, I’ve counted. Several times. I’m thorough.',
      'What’s that? Show me. My ears only perk up for interesting things.',
      'I read about this village before moving in. Twice.',
      'These glasses? For reading. And for looking great.',
      'I catalogued every tree in town. There are sixteen.',
    ],
    gift: 4,
    home: { tx: 28, ty: 12.5 },
  },
  {
    id: 'ppyopuli',
    name: 'PPYOPULI',
    member: 'Woozi',
    bio: 'Steamed rice · colour changes with mood',
    lines: [
      'I’m not small. I’m concentrated.',
      'If I turn pink, I’m pleased. Don’t make a big deal of it.',
      'I’ll stick around. Like rice. That’s the whole joke. Moving on.',
      'I’m warm. That’s not an invitation. …Okay, one hug.',
      'Small, dense, reliable. Like good rice.',
    ],
    gift: 4,
    home: { tx: 12, ty: 16 },
  },
  {
    id: 'doa',
    name: 'DOA',
    member: 'DK',
    bio: 'Sunny puppy · goes crazy for food',
    lines: [
      'HI!! Do you have food?? I smelled cookies from three tiles away!',
      'I only bite a LITTLE. It’s how I say “best friend”.',
      'Today is the BEST day! So was yesterday! Tomorrow too, probably!',
      'I dug a hole! Then I filled it back in! Great day!',
      'Your pet smells like a FRIEND!',
    ],
    gift: 3,
    home: { tx: 18, ty: 16.5 },
  },
  {
    id: 'kimja',
    name: 'KIMJA',
    member: 'Mingyu',
    bio: 'Leader of the potatoes · bigger than expected',
    lines: [
      'As leader of all potatoes, I welcome you to my field. It’s this corner.',
      'I sulked for two minutes earlier. I’m over it now. Leadership.',
      'People say “it’s just a potato”. A LEADER potato.',
      'A potato never abandons his field. Or his friends.',
      'I grew two millimetres this month. Leadership.',
    ],
    gift: 5,
    home: { tx: 6, ty: 20 },
  },
  {
    id: 'thepalee',
    name: 'THEpalee',
    member: 'The8',
    bio: 'A princely frog · tea, rain and quiet',
    lines: [
      'Shh. The rain sounds better when no one is talking.',
      'I was meditating. Then drawing. Then meditating about drawing.',
      'Cold weather is uncivilised. Tea fixes most things.',
      'The pond told me a secret today. It says: slow down.',
      'Tea first. Everything else after.',
    ],
    gift: 3,
    home: { tx: 12, ty: 21 },
  },
  {
    id: 'bboogyuli',
    name: 'BBOOGYULI',
    member: 'Seungkwan',
    bio: 'Jeju tangerine · eyes shine like diamonds',
    lines: [
      'The more you look at me, the cuter I get. It’s documented.',
      'Please don’t praise me. (Do it again.)',
      'Hold my hand while we walk? The path gets lonely.',
      'Jeju misses me, I’m sure. Everyone does.',
      'My leaf? Natural. My shine? Also natural.',
    ],
    gift: 5,
    home: { tx: 20, ty: 21 },
  },
  {
    id: 'nonver',
    name: 'NONVER',
    member: 'Vernon',
    bio: 'A chill human in a polar-bear hood',
    lines: [
      'Oh. Hey. I was about to nap. Or play. One of those.',
      'If my face changes colour, that’s just the mood talking.',
      'This village is pretty chill. I respect that.',
      'This hood? It’s a lifestyle.',
      'I had a dream about this exact conversation. Weird.',
    ],
    gift: 4,
    home: { tx: 28, ty: 19 },
  },
  {
    id: 'chandalee',
    name: 'CHANDALEE',
    member: 'Dino',
    bio: 'Ambitious otter · laughs a lot',
    lines: [
      'One day every otter in this river will know my music. Ha!',
      'I practised a new move today. Wanna see? Too late, showing you.',
      'People are great! You’re people! This is going well!',
      'I practised my splash today. Ten out of ten.',
      'The future of otter music starts HERE.',
    ],
    gift: 3,
    home: { tx: 15.5, ty: 10 },
  },
];

export function miniteenTexPrefix(id: string) {
  return `mt-${id}`;
}

const TILE = 48;

/** Waypoints spread around the villager's home anchor. */
function homeWaypoints(def: MiniteenDef, i: number): { x: number; y: number }[] {
  const cx = def.home.tx * TILE;
  const cy = def.home.ty * TILE;
  // Small per-villager variation so patrols don't look synchronised.
  const s = i % 2 === 0 ? 1 : -1;
  const offsets = [
    [0, 0],
    [2.4 * s, 0.3],
    [-2.2 * s, -0.4],
    [0.5, 1.8],
    [-0.7 * s, -1.7],
  ];
  return offsets.map(([ox, oy]) => ({ x: cx + ox * TILE, y: cy + oy * TILE }));
}

export class MiniteenNpc extends WandererNpc {
  readonly defId: string;
  private def: MiniteenDef;

  constructor(scene: Phaser.Scene, def: MiniteenDef, index: number) {
    super(scene, {
      name: def.name,
      texPrefix: miniteenTexPrefix(def.id),
      waypoints: homeWaypoints(def, index),
      scale: 1.5,
      speed: 40 + (index % 4) * 6,
    });
    this.def = def;
    this.defId = def.id;
  }

  protected override openTalk(cbs: NpcTalkCallbacks) {
    const line = this.pickLine(this.def.lines);
    this.playBounce();
    const canGift = State.canClaimNpcGift(this.def.id);
    const options: MenuOption[] = [
      {
        label: canGift ? `Accept today's gift (+${this.def.gift} coins)` : 'Gift claimed — come back tomorrow!',
        icon: 'coin',
        disabled: !canGift,
        onSelect: () => {
          if (!State.claimNpcGift(this.def.id, this.def.gift)) return;
          toast(this.scene, this.sprite.x, this.sprite.y - 30, `+${this.def.gift} coins!`, '#ffe066');
          this.emote('happy', 1000);
        },
      },
      {
        label: `Who are you, ${this.def.name}?`,
        onSelect: () => {
          cbs.keepMenuOpen();
          this.emote('happy', 1200);
          const follow = new Menu(
            this.scene,
            this.def.name,
            [{ label: 'Nice to meet you!', onSelect: () => undefined }],
            {
              subtitle: `${this.def.member}’s MINITEEN · ${this.def.bio}`,
              anchor: 'bottom',
              face: this.faceKey(),
            },
          );
          follow.onClose = cbs.onClose;
        },
      },
      {
        label: 'Wave goodbye',
        onSelect: () => this.hop(),
      },
    ];
    const menu = new Menu(this.scene, this.def.name, options, {
      subtitle: line,
      anchor: 'bottom',
      face: this.faceKey(),
    });
    menu.onClose = cbs.onClose;
  }
}
