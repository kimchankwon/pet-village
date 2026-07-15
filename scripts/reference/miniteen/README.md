# MINITEEN Imagine → game sprites

Repeatable pipeline for the 13 MINITEEN village NPCs.

## Sizes

| Stage | Size | Notes |
|-------|------|--------|
| Imagine plate | ~384–1024² | Flat pixel art, solid bg, full-body front |
| Game frame (default) | **32×42** | Majority-downsample — classic chibi |
| Game frame (`--plate`) | up to **512px** side | Transparent crop of the plate (looks like Imagine) |
| In-game draw | ~63 world px tall | Classic: scale 1.5; plate: auto-scale + nearest-neighbour |
| Review zoom | **3×** of 32×42 (96×126) | Nearest-neighbour only — never bilinear |

### Prefer the plate look? (PR #62 approach)

**Do not majority-downsample soft Imagine art to 32×42** — that muddies eyes and
fills. Keep the plate:

```bash
# All 13 villagers as transparent plate crops (max 512px side)
npm run sprite:miniteen -- --plate

# Or one character
npm run sprite:miniteen -- --plate doa
```

The game auto-detects frames taller than 64px and scales them to classic
miniteen height (~63 world px) with **nearest-neighbour** filtering.

Optional Grok Imagine **pose plates** (walk/happy/sad/jump) live under:

```text
scripts/reference/miniteen/poses/<id>/{idle,walk1,walk2,happy,sad,jump}.png
```

**Walk:** always prefer Imagine `walk1`/`walk2` plates (mid-stride, opposite
feet). Draw walks in a **slight three-quarter** facing **screen-right** so when
the game `flipX`s for left movement the character still faces the walk
direction (like classic DOA/Tamtam walks). Procedural foot-shuffle is a last
resort and is nearly invisible on large plates. Keep the **same character
scale** as idle (no “outline grows while walking”).

When a pose file is missing, the converter derives it gently from idle at
**plate resolution** (still not 32×42). Every pose is normalized with
`normalizePoseSize` (height-lock to idle + soft width clamp ±~8–10%, hard max
~1.2× width, all while staying within a few percent height of idle), then
padded onto one shared bottom-centered canvas so:

1. Walk frames keep idle **height / on-screen scale**; width may vary slightly
   for limb pose (soft clamp), never balloon into a tall/wide silhouette pulse
2. Phaser’s center origin does not make feet slide between walk frames

Set `useSourcePlate: true` on the def for documentation; runtime scaling keys
off texture height.

## Poses

`idle`, `walk1`, `walk2`, `happy`, `sad`, `jump` — derived from the idle plate via `scripts/lib/pose-animate.mjs` (foot shuffle + face accents; whole-body shift avoided so feet stay on-canvas).

## Refresh one character (e.g. DOA)

1. **Reference** — keep or drop official art as `<id>-official.png` when you have it (see `ocl-official.png`).
2. **Imagine** — Grok Imagine / `image_edit` from that reference into a clean chibi pixel plate:
   - Thick black outline, flat fills, no anti-alias
   - Ears, hats, held items, tongues, limbs **attached** to the silhouette (no floating accessories)
   - White / light-gray exterior for flood-fill keying
3. **Save plate** as `scripts/reference/miniteen/<id>.png`  
   Optional: `<id>-imagine.png` (preferred when present) and archive the previous plate as `<id>-prev.png`.
4. **Convert** only that character:

   ```bash
   npm run sprite:miniteen -- doa
   # or several: npm run sprite:miniteen -- doa ocl
   # or everyone: npm run sprite:miniteen
   ```

5. **Check** idle + walk frames at native **32×42** and at **3×** nearest-neighbour (**96×126**). Confirm ears, hats, tongues, held items, and limbs still sit on the body (no floating accessories, no hollow eyes).

## IDs

`choitcherry` `jjongtoram` `shuasumi` `ocl` `tamtam` `foxdungee` `ppyopuli` `doa` `kimja` `thepalee` `bboogyuli` `nonver` `chandalee`

## Related

- Converter: `scripts/imagine-to-miniteen.mts`
- Procedural fallback (no plate): `scripts/generate-miniteen.mts`
- Same idea for Bongbongee / puffles: `npm run sprite:bongbongee` / `sprite:puffles`
