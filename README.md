# Pet Village

A cozy single-player pet village game — Club Penguin-style movement, an
Animal Crossing-style decoratable house, and a Tamagotchi companion whose
needs keep decaying even while the game is closed.

Built with Phaser 3 + TypeScript + Vite + Convex.

Saves: `localStorage` for guests; signed-in players sync durable cloud
saves via Convex (Google or email/password).

## Play

https://kimchankwon.github.io/pet-village/

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
| I | open your inventory (your clothes · food · furniture) |
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
  while you aim. Scoring: 3 coins per basket, +1 for a clean swish, +2
  for banking it off a plank, +2 streak bonus from 3 in a row. Drag
  anywhere on screen to slingshot (releasing outside the game still
  throws), and pick your paper-ball colour with the swatches.
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
  `npm run sprite:miniteen`, plates under `scripts/reference/miniteen/`).
- Puffle pets: `npm run sprite:puffles` from `scripts/reference/puffle/`.
- `src/systems/WandererNpc.ts` — shared waypoint-wander base for NPCs;
  `CinnamorollNpc` / `BongbongeeNpc` / `miniteen.ts` build dialogue on top.
  Each MINITEEN villager hands out a small once-per-day coin gift.
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
