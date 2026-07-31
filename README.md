# Pet Village

A cozy single-player pet village game — Club Penguin-style movement, an
Animal Crossing-style decoratable house, and a Tamagotchi companion whose
needs keep decaying even while the game is closed.

Built with Phaser 3 + TypeScript + Vite + Convex.

Saves: `localStorage` for guests; signed-in players sync durable cloud
saves via Convex (Google or email/password).

## Play

https://kimchankwon.github.io/pet-village/

- [Player's guide](https://kimchankwon.github.io/pet-village/guide.html) —
  pets, worlds, mini-game payouts, shop prices, multiplayer
- [Controls](https://kimchankwon.github.io/pet-village/controls.html)

## Run it

```sh
npm install
npm run dev   # starts Convex + Vite together
```

Open http://localhost:5173/pet-village/

Requires `.env.local` with `VITE_CONVEX_URL` (created by `npx convex dev`).

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

Deploys to GitHub Pages automatically on every merge to `main`
(`.github/workflows/deploy.yml` builds `dist/` and publishes via
`actions/deploy-pages`; the old `gh-pages` branch is no longer used).
For production auth redirects, set Convex `SITE_URL` to your live origin
(e.g. `https://kimchankwon.github.io/pet-village`).

## How to play

| Input | Action |
|---|---|
| WASD / arrows | Walk around |
| Click / tap | Walk to that spot |
| Hold / drag | Keep walking toward the pointer |
| Joystick (bottom-left) | Walk — made for touch |
| Mouse wheel / pinch / zoom slider | Zoom the world; your chosen level follows you between scenes |
| E / click | Interact when close (door, shop, arcade) |
| I | open your inventory (your clothes · food · furniture) — pick a snack from Food & treats to feed your pet on the spot |
| P | open the pet menu (chat · feed · pet clothes) |
| Decorate button | (in house) open the decorate menu |
| Click furniture | (in house) pick it up into inventory |
| Drag + release | (paper toss) slingshot the paper ball |
| ESC / click outside | go back in a nested menu, or close it |
| ESC (in town) | game menu — resume, penguin colour, change pet, exit |
| [ Inventory ] / [ Pet ] / [ Menu ] | your items · pet care · game menu, no walking required |
| Exit / Back / Sign out | asks for confirmation first |

- **Mochi** (your pet) follows you everywhere. Its Food / Happy / Energy
  bars decay in real time — including while the game is closed (capped at
  12h so a holiday isn't fatal). Feed it snacks, play with it, and tuck it
  into a bed to restore energy.
- **Energy gates every mini-game.** Each booth charges up front and refuses a
  pet that can't cover it: 5–12 for a Bump bout, a Get track or a sled race,
  8–21 for an Expedition duel (by foe × difficulty), 10 for a Skip Rope run,
  10–18 for a Paper Toss run, and 4 for each fishing cast. The booth outside
  turns you away, unaffordable difficulties are greyed out where a game has
  them, and retry buttons say what's needed. Every cost lives in
  `src/systems/gameEnergy.ts`; the payouts stay with their own games
  (`GameState`, `getGameRules`, `sledRunRewards`, `fishingRules`,
  `expeditionRules`), and `gameEnergy.test.ts` holds them against each other —
  a winning run at the shorter coin-paying booths is worth roughly 1.2–2.2
  coins per energy. Expedition sits above that band on purpose (long boss
  fights). Fishing is the exception by design: it pays a fish and a cheer
  rather than coins.
- **Daniel's Shop** — walk up to the shop building and step inside;
  Daniel the bunny waits at the counter selling food and furniture for
  coins, including the SVT Lightstick VER.3 Anniversary for superfan
  rooms.
- **Paper Toss** (arcade cabinet) earns coins, and your pet does the
  tossing. 4 stages: sink 3 baskets within 5 throws to clear a stage and
  unlock the next; run out of throws and you retry the same stage
  with the identical wind/obstacle combination (run totals carry over). Each stage brings stronger wind and more
  randomly placed obstacle planks the ball bounces off, plus a
  wider-wandering bin. The wind readout sits at the bottom and streaks
  drift across the room showing which way it blows. Throw power caps out
  (the aim line turns red at max). The bin has real rims — near-misses
  rattle out (or in) — and the paper ball hops off the floor up to twice,
  so a lucky bounce still counts. On the final stage the bin creeps
  while you aim. A run costs 10 / 14 / 18 energy on Easy / Medium / Hard,
  paid up front for both its levels. Scoring: 1 / 2 / 3 coins per basket by
  difficulty, +1 for a clean swish, +1 for banking it off a plank, +1
  streak bonus from 3 in a row, and 2 / 3 / 5 for clearing a level. Drag
  anywhere on screen to slingshot (releasing outside the game still
  throws), and pick your paper-ball colour with the swatches.
- **Get** sits beside Paper Toss in the East Green: move your pet's bowl with
  arrows, A/D, or either side of the touchscreen to catch notes and dodge poop
  across newly randomized Easy, Normal, and Hard tracks. Each run costs 5, 8,
  or 12 energy respectively; easier modes give your pet a wider catching bowl.
- **Expedition** is the third East Green booth — a Clair Obscur-style duel.
  Pick Gustave, Maelle or Renoir, then Easy / Normal / Hard. Your turn: choose
  one of three offered abilities (the free Nibble plus the two most expensive
  you can afford) and land taps on a rotating-ring QTE. Their turn: dodge
  (`X` / left half) or parry (`C` / right half) a telegraphed chain; parry is
  tighter but pays mana and a full-chain parry counters. Bosses have three HP
  phases and signature mechanics (Gustave charge, Maelle stances, Renoir's
  canvas heal). Wins are counted in `expeditionWins`; Flawless (full HP) pays
  +50% coins. Combat logic lives in pure modules under `src/systems/expedition*`
  so balance is covered by tests without a browser.
- **Fishing** at the Shore: drag to aim the cast the way you throw in Paper
  Toss, then click the moment the line dips. A bite always becomes a fight —
  there is no decoy nibble that eats your bait. Hooking rolls one of two games
  at random: **Keep It In** (hold to lift a catch bar and keep the fish inside
  it, while the catch meter drains faster the longer the fight runs) or **The
  Sweep** (tap as a needle crosses a target arc that shrinks and speeds up with
  every hit). The Sweep gives no second chances: one missed tap loses the fish,
  and so does letting the needle lap a target twice. A dead-centre gold-core tap
  counts as two strikes, so precision buys a shorter fight rather than a safer
  one. Both scale off the fish's size only — bigger fish move faster,
  dart further and give you a smaller window. Distance is the sole lever on
  size: a tap lands almost nothing but common fish, a maxed cast usually finds
  something rare. Every size is playable at every skill level; the tuning is
  held there by simulation rather than by feel, so see
  `src/systems/fishingSimulation.ts` and `npm run sim:fishing` before changing
  a number.
- Anything you can interact with (house, Daniel, arcade, your pet, the
  door mat) lights up when you're close enough.
- MINITEEN residents roam Town, Shore, West Green, and East Green. Their
  scene assignments and positions persist while you travel, with no resident
  duplicated across locations; every resident supports the full dialogue menu.
- **Your house** is decoratable on a grid: buy furniture, place it via
  the Decorate button, click to pick it back up.

## Code map

- `src/scenes/BootScene.ts` — preloads pet PNGs, generates pixel-art
  textures, then starts Adopt (first run) or Town.
- `src/scenes/AdoptScene.ts` — pick Mametchi / Kuchipatchi and name them.
- `src/sprites/pixelart.ts` — penguin/world/furniture art, generated at
  boot from character grids. Swap any of it for real PNG loading in
  BootScene later (keep the texture keys).
- `public/assets/pet/mametchi/` · `kuchipatchi/` · `mimitchi/` · `puffle-*` —
  Tamagotchi iD and Club Penguin–style Puffle sprites.
- `public/assets/npc/` — wandering town NPCs: Cinnamoroll (Sanrio-inspired),
  Bongbongee (SEVENTEEN's CARAT mascot), and the 13 MINITEEN villagers
  (SEVENTEEN's official mini characters — regenerate from Imagine plates with
  `npm run sprite:miniteen` or `npm run sprite:miniteen -- doa` for one id;
  plates + workflow under `scripts/reference/miniteen/`).
- Puffle pets: `npm run sprite:puffles` from `scripts/reference/puffle/`.
- `src/systems/WandererNpc.ts` — shared waypoint-wander base for NPCs;
  `CinnamorollNpc` / `BongbongeeNpc` / `miniteen.ts` build dialogue on top.
  Each MINITEEN villager hands out a small once-per-day coin gift.
- `src/systems/fishingMinigames.ts` — the two post-bite fights as pure,
  frame-rate-independent state machines, plus the size→difficulty tuning
  tables. `fishingSimulation.ts` plays them headlessly against three modelled
  player skill levels; `fishingMinigames.test.ts` asserts every fish size stays
  catchable and `npm run sim:fishing` prints the balance table.
- `src/systems/GameState.ts` — save data, item catalog, pet-needs decay.
- `src/systems/Pet.ts` — the follower companion (species-aware sprites).
- `src/systems/UI.ts` — HUD, menus, toasts, prompts.
- `src/scenes/` — `TownScene` (overworld), `HouseScene` (decorating),
  `PaperTossScene` (minigame).

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
(exact color only); raise `--tolerance` explicitly for anti-aliased source art,
or use `--outline '#14141c'` for a different ink.
Do not use erosion or generic line-thinning filters: they can destroy thin ears,
feet, tails, and facial features.

## Art notes

- The penguin is original pixel art inspired by iChibi's fan-made Club
  Penguin sprite sheet (marked "no need to credit").
- Pets use Mametchi, Kuchipatchi, and Mimitchi sprites (Tamagotchi iD era)
  from the Tamagotchi fandom wiki. Bandai characters — fine for a personal
  project, but replace with original art before any public or commercial release.
- Everything else is original generated pixel art.

## Roadmap ideas

- More minigames feeding the same coin economy
- Pet evolution stages based on care quality
- Async multiplayer (visit friends' rooms, leave gifts) via Convex
- Real-time town square via Colyseus once the core loop is fun
