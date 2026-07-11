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
| E / click | Interact when close (door, shop, arcade, pet) |
| I | (in house) open the decorate menu |
| Click furniture | (in house) pick it up into inventory |
| Drag + release | (paper toss) slingshot the paper ball |
| ESC / click outside | close a menu |
| ESC (in town) | pause menu — back to game, or exit |
| Exit / Back / Sign out | asks for confirmation first |

- **Mochi** (your pet) follows you everywhere. Its Food / Happy / Energy
  bars decay in real time — including while the game is closed (capped at
  12h so a holiday isn't fatal). Feed it snacks, play with it, and tuck it
  into a bed to restore energy.
- **Daniel's Shop** (bunny NPC) sells food and furniture for coins —
  including the SVT Lightstick VER.3 Anniversary for superfan rooms.
- **Paper Toss** (arcade cabinet) earns coins: 12 throws per round across
  4 levels (3 throws each). Each level brings stronger wind, new obstacle
  planks the ball bounces off, and a wider-wandering bin. 3 coins per
  basket, +2 streak bonus from 3 in a row. Drag anywhere on screen to
  slingshot (releasing outside the game still throws), and pick your
  paper-ball colour with the swatches.
- **Your house** is decoratable on a grid: buy furniture, place it with
  `I`, click to pick it back up.

## Code map

- `src/scenes/BootScene.ts` — preloads pet PNGs, generates pixel-art
  textures, then starts Adopt (first run) or Town.
- `src/scenes/AdoptScene.ts` — pick Mametchi / Kuchipatchi and name them.
- `src/sprites/pixelart.ts` — penguin/world/furniture art, generated at
  boot from character grids. Swap any of it for real PNG loading in
  BootScene later (keep the texture keys).
- `public/assets/pet/mametchi/` · `kuchipatchi/` · `mimitchi/` — Tamagotchi iD
  sprites from the Tamagotchi wiki.
- `src/systems/GameState.ts` — save data, item catalog, pet-needs decay.
- `src/systems/Pet.ts` — the follower companion (species-aware sprites).
- `src/systems/UI.ts` — HUD, menus, toasts, prompts.
- `src/scenes/` — `TownScene` (overworld), `HouseScene` (decorating),
  `PaperTossScene` (minigame).

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
