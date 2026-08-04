# Player penguin — classic Club Penguin plates

The player penguin uses the same smooth Club Penguin sticker art family as the
dance emote (not the older Grok Imagine pixel plates). Shared cell size is
**220×214** so idle ↔ walk ↔ dance swaps stay size-stable.

## Classic plates (`sprite:penguin-classic`)

| Asset | Source |
|-------|--------|
| **down-0** idle | Dance plate `f00` (front stand) |
| **side-0** idle | Dance plate `f07` (side stand mid-spin) |
| **up-0** idle | Dance plate `f08` (back stand mid-spin) |
| **down/side/up 1..8** walk | Tenor Club Penguin walk GIF (8 frames @ 60 ms) |

```text
scripts/reference/penguin/cp-walk-gif/penguin-walk.gif
scripts/reference/penguin/cp-walk-gif/frames/f00.png … f07.png
```

```bash
npm run sprite:penguin-classic
# then refresh wave poses on the classic idle:
npm run sprite:penguin-wave
```

Output:

```text
public/assets/player/penguin/{down,up,side}-{0..8}.png
public/assets/player/penguin/walk/f00.png … f07.png
public/assets/player/penguin/walk-sheet.png
```

White plate + soft ground shadow are keyed out; body blues are normalised to
the dance cyan so colourways recolour the same way. When the player stops,
scenes set texture frame **0**. Walk anims play frames **1..8** at ~16.7 fps.

## Wave (Tenor GIF · 16 frames)

Multiplayer wave plays the authentic Club Penguin wave emote from Tenor
(https://tenor.com/view/club-penguin-wave-gif-25809655) — **16 frames** at
**75 ms** each (~1.2 s one-shot). Captions and the greeting platform are keyed
out; the black body is remapped to dance cyan so colourways recolour.

```text
scripts/reference/penguin/cp-wave-gif/penguin-wave.gif
scripts/reference/penguin/cp-wave-gif/frames/f00.png … f15.png
```

```bash
npm run sprite:penguin-wave
```

Output:

```text
public/assets/player/penguin/wave/f00.png … f15.png
public/assets/player/penguin/wave-sheet.png   # 16×1 row (220×214 cells)
```

## Dance (Club Penguin GIF · 76 frames)

Local dance emote (keyboard **N** / Dance chip) plays the classic Club Penguin
emote medley from the Tenor reference GIF — **76 unique frames** at **100 ms**
each (~7.6 s loop). It is not a four-pose bounce: the GIF chains idle wind-up,
a full spin, the arms-overhead dance, waves, and tumbles.

```text
scripts/reference/penguin/cp-dance-gif/penguin-dance.gif
scripts/reference/penguin/cp-dance-gif/frames/f000.png … f075.png
```

```bash
npm run sprite:penguin-dance
```

Output:

```text
public/assets/player/penguin/dance/f00.png … f75.png   # individual cells
public/assets/player/penguin/dance-sheet.png           # 10×8 grid (220×214 cells)
```

White plate is keyed to transparent; registration matches the GIF so the loop
closes cleanly. The multi-row sheet stays under WebGL max texture size (a
single 76-wide row of walk-plate-resolution cells would not). Press **N**
again or walk to stop. Peers in the same scene see the loop via the
`dancing` multiplayer field (protocol v11).

Cells keep the GIF's own registration, so the penguin fills only part of the
cell: the standing pose occupies rows 25–155 of 214, and the rest is headroom
for the floor spin, which really does reach the bottom edge. Scaling a dance
cell by its height (the rule the walk plates use, where the art is flush with
the cell) therefore draws the dancer ~38% short and floating. `pixelart.ts`
scales and anchors dance frames off the *standing* pose instead —
`penguinDanceDrawScale` / `penguinDanceOriginY`, from the
`DANCE_STAND_*_RATIO` constants in `src/systems/characterScale.ts` (kept there,
free of Phaser, so the sheet test imports the same numbers the game draws
with). **Re-cropping or re-exporting the GIF means
re-measuring those ratios**; `scripts/lib/penguin-dance-sheet.test.mjs` fails
if they drift from the sheet or if the dancer stops matching the idle plate's
height and ground line.

## Refresh

```bash
# Put pose plates under poses/ then:
npm run sprite:penguin
# Wave plates (Imagine preferred):
npm run sprite:penguin-wave
# Dance plates (Imagine required):
npm run sprite:penguin-dance
```

Poses:

```text
scripts/reference/penguin/poses/{down,up,side}-{0,1,2}.png
# optional idle mirrors (same art as *-0):
scripts/reference/penguin/poses/{down,up,side}-idle.png
```

Output: `public/assets/player/penguin/{down,up,side}-{0,1,2}.png`.

Boot loads `penguin-plate-*` keys; `makePenguin` recolours body blues for the
selected colourway and stamps clothes overlays at plate scale.
