import { State } from './GameState';
import type { PetSpecies } from './pets';

/**
 * What the pet says when you talk to it. The pool is the current need
 * (hungry / tired / sad) or, when the pet is fine, its personality lines.
 */

export type PetExpression = 'hungry' | 'tired' | 'sad' | 'happy' | 'ok';

const NEED_LINES: Record<'hungry' | 'tired' | 'sad', string[]> = {
  hungry: [
    'My tummy is rumbling…',
    'Snack? Snack?? Snack!!!',
    'So… hungry… feed me?',
    'I smell the shop from here…',
  ],
  tired: [
    '*yawn* …five more minutes.',
    'Sleepy… carry me?',
    'My feet are heavy today…',
    'Can we nap soon?',
  ],
  sad: [
    'I missed you…',
    'Hmph. Where were you?',
    'Can we play? Please?',
  ],
};

/**
 * Personality lines by species — used when the pet is doing fine.
 * Grounded in each character's canon:
 * - Tamagotchi wiki: Mametchi is a well-mannered inventor whose gadgets tend
 *   to explode; Kuchipatchi is a lazy daydreamer who loves Tama-Donuts and
 *   ends sentences with "-datchi"; Mimitchi is the cheerful, caring
 *   perfect-care adult; Violetchi is a softhearted gardener who knows the
 *   meaning of every flower.
 * - Club Penguin wiki puffle personalities: blue = loyal ball games, pink =
 *   skip rope/swimming, green = clown with propeller cap, black = silent
 *   skateboarder, purple = picky disco dancer, red = Rockhopper Island
 *   adventurer, yellow = artist, white = shy snow-whisperer, orange = eats
 *   anything/loves boxes, brown = beakers-and-rockets inventor.
 * - Kirby only ever says "poyo" in the anime; Cinnamoroll was born on a
 *   cloud, flies with his ears and has a cinnamon-roll tail; Bongbongee is
 *   SEVENTEEN's CARATLAND mascot, drawn by Mingyu.
 */
const PERSONALITY: Record<PetSpecies, string[]> = {
  mametchi: [
    'My new invention works! …Mostly. Stand back!',
    'Beep boop! Snack-finder online!',
    'That one exploded. Back to the lab!',
    'My little sister Chamametchi would love it here.',
    'A well-mannered genius never skips head-pats.',
  ],
  kuchipatchi: [
    'Tama-Donuts are the best-datchi!',
    'Walking makes me hungry-datchi~',
    'Five more minutes of nap… then snacks-datchi.',
    'Ya-tchi! You’re back!',
    'I was daydreaming about donuts again-datchi.',
  ],
  mimitchi: [
    'Ehehe~ being with you is my favorite!',
    'Let’s go cheer somebody up today!',
    'Ear check… fluffy and perfect!',
    'You take such good care of me!',
    'Today feels lucky. I can tell!',
  ],
  violetchi: [
    'This flower means friendship. It reminded me of you!',
    'I watered the town flowers. They said thank you!',
    'Violets for luck, daisies for joy… which are you?',
    'Let’s plant something pretty together.',
    'My twin Flowertchi would adore this garden.',
  ],
  bongbongee: [
    'Bong! Bong! Sparkle time!',
    'Every CARAT is a diamond~',
    'Do my cheeks still say 17?',
    'Mingyu drew me, you know. Great taste!',
    'This town needs a CARATLAND!',
  ],
  cinnamoroll: [
    '…I found a sunny nap spot.',
    '*flap flap* …I can fly a little. When no one watches.',
    'My tail curls just like a cinnamon roll…',
    'Warm milk later…? Okay.',
    'I was born on a fluffy cloud, you know…',
  ],
  kirby: [
    'Poyo!',
    'Poyo poyo!! (Maxim Tomato??)',
    '*inhales happily* Poyo~',
    'Poyooo… *dreams of Dream Land*',
  ],
  'puffle-blue': [
    'Throw the ball! I’ll bring it back, promise!',
    'Best friends stick together!',
    'Pretzel break? Pretzel break!',
    'Right behind you, always!',
  ],
  'puffle-pink': [
    'Skip rope time!! I never miss!',
    'Race you to the trampoline!',
    'Swim day is the best day!',
    'One more lap! Woo!!',
  ],
  'puffle-green': [
    'Watch me ride the unicycle! Almost got it!',
    'Hehehe… nothing. Nothing!',
    'Prank successfully planned.',
    'My propeller cap? Extra funny business.',
  ],
  'puffle-black': [
    '…what. I am NOT smiling.',
    'Kickflip. Don’t make it a thing.',
    'Hmph. Fine, this is nice.',
    '…stay close, okay?',
  ],
  'puffle-purple': [
    'Disco! Right now! No excuses!',
    'I only eat the fancy snacks, darling.',
    'Don’t interrupt my beauty sleep.',
    'This light flatters me.',
  ],
  'puffle-red': [
    'Yarr! Rockhopper Island taught me everything!',
    'Fire me from a cannon! Again!',
    'Strike! …Okay, seven pins. Still cool.',
    'One more adventure! C’mon!',
  ],
  'puffle-yellow': [
    'Hold still — you’re my next masterpiece!',
    'I painted the sunset. From memory!',
    'Do you hear music? I ALWAYS hear music.',
    'Everything is a canvas! Everything!',
  ],
  'puffle-white': [
    '…hi. This is nice.',
    '*quiet happy wiggle*',
    'I made a tiny ice sculpture… for you.',
    'I like the snow clouds today…',
  ],
  'puffle-orange': [
    'I ate a box once. Zero regrets!',
    'Boxes!! Do you have boxes?!',
    'Teehee! Look at my teeth!',
    'Wanna goof off?',
  ],
  'puffle-brown': [
    'Hypothesis: snacks improve morale.',
    'My rocket only exploded twice today!',
    'Goggles on. Science time.',
    'Eureka! …Wait. Nope. Almost eureka.',
  ],
};

const HAPPY_LINES = ['Best day ever!', 'I love it here!', 'You’re my favorite!'];

let lastLine = '';

/** Pick a line for the pet's current state, never repeating the last one. */
export function petLine(): string {
  const expr = State.petExpression();
  let pool: string[];
  if (expr === 'hungry' || expr === 'tired' || expr === 'sad') {
    pool = NEED_LINES[expr];
  } else {
    pool = [...(PERSONALITY[State.data.petSpecies] ?? []), ...(expr === 'happy' ? HAPPY_LINES : [])];
    if (pool.length === 0) pool = HAPPY_LINES;
  }
  const options = pool.filter((l) => l !== lastLine);
  const line = options[Math.floor(Math.random() * options.length)] ?? pool[0]!;
  lastLine = line;
  return line;
}
