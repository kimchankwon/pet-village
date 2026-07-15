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

### Prefer the plate look?

If the Imagine art looks better than the tiny 32×42 result, keep the plate:

```bash
npm run sprite:miniteen -- --plate doa
```

Then set `useSourcePlate: true` on that villager in `src/systems/miniteen.ts`
(already on for DOA). The game loads the large frames and scales them down with
nearest-neighbour so on-screen size matches the other miniteens.

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
