# Pet Village

A cozy single-player pet village game — Club Penguin-style movement, an
Animal Crossing-style decoratable house, and a Tamagotchi companion whose
needs keep decaying even while the game is closed.

Built with Phaser 3 + TypeScript + Vite. No backend: everything persists to
`localStorage`.

## Run it

```sh
npm install
npm run dev
```

## How to play

| Input | Action |
|---|---|
| WASD / arrows | Walk around |
| E | Interact (door, shop, arcade, your pet) |
| I | (in house) open the decorate menu |
| Click furniture | (in house) pick it up into inventory |
| Drag + release | (paper toss) slingshot the paper ball |
| ESC / click outside | close a menu |

- **Mochi** (your pet) follows you everywhere. Its Food / Happy / Energy
  bars decay in real time — including while the game is closed (capped at
  12h so a holiday isn't fatal). Feed it snacks, play with it, and tuck it
  into a bed to restore energy.
- **Bella's Shop** (bunny NPC) sells food and furniture for coins.
- **Paper Toss** (arcade cabinet) earns coins: 10 throws per round, 3 coins
  per basket, +2 streak bonus from 3 in a row. The wind changes every throw
  and the bin wanders.
- **Your house** is decoratable on a grid: buy furniture, place it with
  `I`, click to pick it back up.

## Code map

- `src/scenes/BootScene.ts` — preloads PNG assets (the pet), generates
  pixel-art textures, defines animations, then starts the town.
- `src/sprites/pixelart.ts` — penguin/world/furniture art, generated at
  boot from character grids. Swap any of it for real PNG loading in
  BootScene later (keep the texture keys).
- `public/assets/pet/` — Mametchi sprites (Tamagotchi iD) from the
  Tamagotchi wiki.
- `src/systems/GameState.ts` — save data, item catalog, pet-needs decay.
- `src/systems/Pet.ts` — the follower companion.
- `src/systems/UI.ts` — HUD, menus, toasts, prompts.
- `src/scenes/` — `TownScene` (overworld), `HouseScene` (decorating),
  `PaperTossScene` (minigame).

## Art notes

- The penguin is original pixel art inspired by iChibi's fan-made Club
  Penguin sprite sheet (marked "no need to credit").
- The pet uses actual Mametchi sprites (Tamagotchi iD era) downloaded from
  the Tamagotchi fandom wiki into `public/assets/pet/`. Mametchi is a
  Bandai character — fine for a personal project, but these must be
  replaced with original art before any public or commercial release.
- Everything else is original generated pixel art.

## Roadmap ideas

- More minigames feeding the same coin economy
- Pet evolution stages based on care quality
- Async multiplayer (visit friends' rooms, leave gifts) via Convex
- Real-time town square via Colyseus once the core loop is fun
