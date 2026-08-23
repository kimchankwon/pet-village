# Pet Village

You walk like Club Penguin, decorate a house like Animal Crossing, and look after a Tamagotchi whose Food, Happy, and Energy keep dropping after you close the tab.

Built with Phaser 3, TypeScript, Vite, and Convex.

Guests save in `localStorage`. Signed-in players (Google or email/password) sync cloud saves through Convex.

## Play

https://kimchankwon.github.io/pet-village/

- [Player's guide](https://kimchankwon.github.io/pet-village/guide.html). Pets, worlds, mini-game payouts, shop prices, multiplayer.
- [Controls](https://kimchankwon.github.io/pet-village/controls.html)

## Run it

```sh
npm install
npm run dev   # starts Convex + Vite together
```

Open http://localhost:5173/pet-village/

Needs `.env.local` with `VITE_CONVEX_URL` (created by `npx convex dev`).

### Google sign-in (one-time)

Uses the same Convex Auth Google provider as relationship-app. In
[Google Cloud Console](https://console.cloud.google.com/) → Credentials → your
OAuth Web client, add:

**Authorized JavaScript origins**
- `http://localhost:5173`
- `https://kimchankwon.github.io`

**Authorized redirect URIs**
- `https://graceful-bear-184.convex.site/api/auth/callback/google` (dev)
- `https://striped-lion-699.convex.site/api/auth/callback/google` (prod)

`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are set on the Convex deployments.

Deploys to GitHub Pages on every merge to `main`
(`.github/workflows/deploy.yml` builds `dist/` and publishes via
`actions/deploy-pages`. The old `gh-pages` branch is unused).
For production auth redirects, set Convex `SITE_URL` to the live origin
(`https://kimchankwon.github.io/pet-village`).

## How to play

| Input | Action |
|---|---|
| WASD / arrows | Walk around |
| Click / tap | Walk to that spot |
| Hold / drag | Keep walking toward the pointer |
| Joystick (bottom-left) | Walk. Built for touch. |
| Mouse wheel / pinch / zoom slider | Zoom the world. Your chosen level follows you between scenes. |
| E / click | Interact when close (door, shop, arcade) |
| I | Inventory (clothes, food, furniture). Feed from Food & treats without opening the pet menu. |
| P | Pet menu (chat, feed, pet clothes) |
| Q | Quest log (active and completed) |
| Decorate button | In the house, open the decorate menu |
| Click furniture | In the house, pick it up into inventory |
| Drag + release | Paper Toss slingshot |
| ESC / click outside | Back in a nested menu, or close it |
| ESC (in town) | Game menu. Resume, penguin colour, change pet, exit. |
| [ Inventory ] / [ Pet ] / [ Quest ] / [ Menu ] | Items, pet care, quest log, game menu. No walking required. |
| Exit / Back / Sign out | Asks for confirmation first |

**Mochi** (your pet) follows you. Food / Happy / Energy decay in real time, including while the game is closed, capped at 12h so a holiday is not fatal. Feed snacks, play, and tuck the pet into a bed to restore energy.

**Energy gates every mini-game.** Each booth charges up front and turns away a pet that cannot cover it. 5, 8, or 12 for a Bump bout, a Get track, or a sled race. 8 to 21 for an Expedition duel (foe × difficulty). 10 for Skip Rope. 10, 14, or 18 for Paper Toss. 4 for each fishing cast. Unaffordable difficulties are greyed out. Retry buttons say what is missing. Costs live in `src/systems/gameEnergy.ts`. Payouts stay with their own games (`GameState`, `getGameRules`, `sledRunRewards`, `fishingRules`, `expeditionRules`). `gameEnergy.test.ts` holds the two against each other. A win at the shorter coin-paying booths is worth about 1.2 to 2.2 coins per energy. Expedition sits above that band on purpose (long boss fights). Fishing pays a fish and a cheer, not coins.

**Quests.** Bongbongee in Town wears a yellow `!` until you accept. First ask: 3× Mint Bass from the Shore for 100 coins and a Carat Lightstick. After you accept Jump Rope Sparkle, clear Skip Rope (25 jumps) 3 times. Only clears while the quest is active count. Return for 120 coins and a sampler of Daniel's new snacks (3× each). The mark turns gray while a quest is active and leaves when that chain is done. Press Q or the Quest chip for active and completed quests. Rewards are shown before you accept.

**Daniel's Shop.** Walk into the shop building. Daniel the bunny waits at the counter with separate menus for food, bait, and furniture (including the Carat Lightstick for superfan rooms).

**Paper Toss** (arcade cabinet) earns coins. Your pet does the tossing. 4 stages: sink 3 baskets within 5 throws to clear a stage and unlock the next. Run out of throws and you retry the same stage with the same wind and obstacle layout (run totals carry over). Each stage brings stronger wind, more randomly placed planks the ball bounces off, and a wider-wandering bin. The wind readout sits at the bottom. Streaks drift across the room showing which way it blows. Throw power caps out (the aim line turns red at max). The bin has real rims. Near-misses rattle out or in. The paper ball hops off the floor up to twice, so a lucky bounce still counts. On the final stage the bin creeps while you aim. A run costs 10 / 14 / 18 energy on Easy / Medium / Hard, paid up front for both levels. Scoring: 1 / 2 / 3 coins per basket by difficulty, +1 for a clean swish, +1 for banking it off a plank, +1 streak bonus from 3 in a row, and 2 / 3 / 5 for clearing a level. Drag anywhere on screen to slingshot (releasing outside the game still throws). Pick the paper-ball colour with the swatches.

**Get** sits beside Paper Toss in the East Green. Move your pet's bowl with arrows, A/D, or either side of the touchscreen to catch notes and dodge poop on newly randomized Easy, Normal, and Hard tracks. Each run costs 5, 8, or 12 energy. Easier modes give a wider catching bowl.

**Expedition** is the third East Green booth, a Clair Obscur-style duel. Pick Gustave, Maelle or Renoir, then Easy / Normal / Hard. Your turn: choose from all six abilities (unaffordable ones stay visible but dimmed and show the mana needed), then land taps on a rotating-ring QTE with a fixed-size hit zone per difficulty. Their turn: each hit is its own circle near the centre. Dodge (`X` / left) or parry (`C` / right). Parry is tighter but pays mana, and a full-chain parry counters. Bosses have three HP phases and signature mechanics (Gustave charge, Maelle stances, Renoir's canvas heal). Wins are counted in `expeditionWins`. Flawless (full HP) pays +50% coins. Combat logic lives in pure modules under `src/systems/expedition*` so balance is covered by tests without a browser.

**Fishing** at the Shore. Drag to aim the cast the way you throw in Paper Toss, then click the moment the line dips. A bite always becomes a fight. There is no decoy nibble that eats your bait. Hooking rolls one of two games at random. **Keep It In:** hold to lift a catch bar and keep the fish inside it, while the catch meter drains faster the longer the fight runs. **The Sweep:** tap as a needle crosses a target arc that shrinks and speeds up with every hit. The Sweep gives no second chances. One missed tap loses the fish, and so does letting the needle lap a target twice. A dead-centre gold-core tap counts as two strikes, so precision shortens the fight rather than making it safer. Both scale off the fish's size only. Bigger fish move faster, dart further, and give a smaller window. Distance is the sole lever on size: a tap lands almost nothing but common fish, a maxed cast usually finds something rare. Every size is playable at every skill level. The tuning is held there by simulation rather than by feel, so see `src/systems/fishingSimulation.ts` and `npm run sim:fishing` before changing a number.

Anything you can interact with (house, Daniel, arcade, your pet, the door mat) lights up when you are close enough.

MINITEEN residents roam Town, Shore, West Green, and East Green. Their scene assignments and positions persist while you travel, with no resident duplicated across locations. Every resident supports the full dialogue menu.

**Your house** is a grid. Buy furniture, place it via Decorate, click to pick it back up.

## Code map

- `src/scenes/BootScene.ts`. Preloads pet PNGs, generates pixel-art textures, then starts Adopt (first run) or Town.
- `src/scenes/AdoptScene.ts`. Pick a Tamagotchi, puffle, or mascot and name them.
- `src/scenes/`. Town, House, Shop, Cafe Cinnamon, Shore, both Greens, and the mini-game scenes.
- `src/sprites/pixelart.ts`. Penguin, world, and furniture art generated at boot from character grids. Swap any of it for real PNG loading in BootScene later (keep the texture keys).
- `public/assets/pet/mametchi/` · `kuchipatchi/` · `mimitchi/` · `puffle-*`. Tamagotchi iD and Club Penguin-style Puffle sprites.
- `public/assets/npc/`. Wandering town NPCs: Cinnamoroll (Sanrio-inspired), Bongbongee (SEVENTEEN's CARAT mascot), and the 13 MINITEEN villagers (SEVENTEEN's official mini characters). Regenerate from Imagine plates with `npm run sprite:miniteen` or `npm run sprite:miniteen -- doa` for one id. Plates and workflow live under `scripts/reference/miniteen/`.
- Puffle pets: `npm run sprite:puffles` from `scripts/reference/puffle/`.
- `src/systems/WandererNpc.ts`. Shared waypoint-wander base for NPCs. `CinnamorollNpc` / `BongbongeeNpc` / `miniteen.ts` build dialogue on top. Each MINITEEN villager hands out a small once-per-day coin gift.
- `src/systems/fishingMinigames.ts`. The two post-bite fights as pure, frame-rate-independent state machines, plus the size→difficulty tuning tables. `fishingSimulation.ts` plays them headlessly against three modelled player skill levels. `fishingMinigames.test.ts` asserts every fish size stays catchable. `npm run sim:fishing` prints the balance table.
- `src/systems/GameState.ts`. Save data, item catalog, pet-needs decay.
- `src/systems/Pet.ts`. The follower companion (species-aware sprites).
- `src/systems/UI.ts`. HUD, menus, toasts, prompts.

## Repairing a sprite outline

Repair a PNG without changing its canvas size or enclosed black details such as
eyes and mouths:

```sh
npm run sprite:repair -- public/assets/pet/cinnamoroll/neutral1.png
```

This writes `neutral1.repaired.png` by default. After visually comparing it at
native size and with nearest-neighbor zoom, replace the original explicitly:

```sh
npm run sprite:repair -- public/assets/pet/cinnamoroll/neutral1.png --in-place
```

The repair removes only outline-colored pixels connected to the transparent
exterior, preserves the colored silhouette and enclosed details, then draws one
4-connected black pixel outside that silhouette. The default tolerance is `0`
(exact color only). Raise `--tolerance` explicitly for anti-aliased source art,
or use `--outline '#14141c'` for a different ink.
Do not use erosion or generic line-thinning filters: they can destroy thin ears,
feet, tails, and facial features.

## Art notes

- The penguin is original pixel art inspired by iChibi's fan-made Club
  Penguin sprite sheet (marked "no need to credit").
- Pets use Mametchi, Kuchipatchi, and Mimitchi sprites (Tamagotchi iD era)
  from the Tamagotchi fandom wiki. Bandai characters. Fine for a personal
  project, but replace with original art before any public or commercial release.
- Everything else is original generated pixel art.

## Later, maybe

- More minigames on the same coin economy
- Pet evolution stages based on care quality
- Visit friends' rooms and leave gifts, async, via Convex
- Real-time town square via Colyseus once the core loop is fun
