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

/** Personality lines by species — used when the pet is doing fine. */
const PERSONALITY: Record<PetSpecies, string[]> = {
  mametchi: ['I invented a new nap machine!', 'Testing! Beep boop!', 'Science says: pet me.'],
  kuchipatchi: ['Everything smells delicious!', 'Walking makes me hungry~', 'You look like a snack. A friend snack!'],
  mimitchi: ['Do I look cute today? (Yes.)', 'Ribbon check… perfect!', 'Strut with me, darling!'],
  bongbongee: ['Bong! Bong! Sparkle time!', 'CARATs would love this town~', 'Do my cheeks still say 17?'],
  cinnamoroll: ['…I found a sunny nap spot.', '*soft ear flaps*', 'Cinnamon rolls later…? Okay.'],
  kirby: ['Poyo!', 'Poyo poyo!! (Snack time??)', '*inhales happily* Poyo~'],
  'puffle-blue': ['Right behind you, always!', 'Best friends stick together!', 'Where you go, I go!'],
  'puffle-pink': ['Cartwheel! Did you see?!', 'Dance break!! Woo!!', 'This town has GREAT music!'],
  'puffle-green': ['Hehehe… nothing. Nothing!', 'Watch this trick! Almost got it!', 'Prank successfully planned.'],
  'puffle-black': ['…what. I am NOT smiling.', 'Hmph. Fine, this is nice.', '…stay close, okay?'],
  'puffle-purple': ['A stage! I require a stage!', 'Adore me. Correct choice.', 'This light flatters me.'],
  'puffle-red': ['Race you to the plaza!', 'Roll roll roll roll!', 'One more lap! C’mon!'],
  'puffle-yellow': ['Why did the fish cross town? Gills!', 'Heehee! Your face!', 'Joke time! Knock knock!'],
  'puffle-white': ['…hi. This is nice.', '*quiet happy wiggle*', 'I like the snow clouds today…'],
  'puffle-orange': ['Teehee! Look at my teeth!', 'Curly day! Every day!', 'Wanna goof off?'],
  'puffle-brown': ['Hypothesis: snacks improve morale.', 'Goggles on. Science time.', 'I invented a tiny thing!'],
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
