# Player penguin Imagine plates

Like MINITEEN source plates: keep Grok Imagine resolution (capped at 512px),
transparent background, shared canvas. Phaser draws them with **nearest-neighbour**
scale to classic height (~60 world px) — no majority-downsample to 18×20.

## Club Penguin stance rules

Match classic Club Penguin proportions and pose:

| Pose | Flippers | Feet | Eyes (side) |
|------|----------|------|-------------|
| **Frame 0** (idle / stop) | Hang **down** by the body — never T-pose | **Both planted** flat | White oval + black pupil |
| **Frame 1** (walk L) | Still by the body, slight sway ok | Viewer's-**left** foot raised mid-stride | White oval + black pupil |
| **Frame 2** (walk R) | Still by the body, slight sway ok | Viewer's-**right** foot raised mid-stride | White oval + black pupil |

Front eyes are white with black pupils. Side view must **never** use a solid
black dot for the eye. Generate plates from the CP references under this folder
(`cp-front.png`, `cp-side-angle.png`, `cp-back-angle.png`, `cp-tenor-frame.png`).

When the player stops, scenes set texture frame **0** — standing idle, not a
mid-walk hop. Walk anims cycle frames **1↔2** so feet truly alternate (never
plant + one-foot hop, which reads as sliding on one foot).

## Back walk depth (up-1 / up-2)

Back-facing walk plates step **away from the camera**: the raised foot sits
**in front of** the penguin (partially hidden under the body), and the planted
foot is fully visible at the bottom (toward the camera). Sources:
`imagine-back-walk-v2/` (up-2 from Imagine; up-1 is a horizontal mirror).

## Side facing (v3)

Side idle + walk plates were regenerated with Grok Imagine using the current
front (`down-*`) and back (`up-*`) game sprites as style references so the
profile matches the same chunky Club Penguin pixel look (white eye + black
pupil, short beak, flippers by the body). Sources live under
`imagine-side-v3/`; game inputs under `poses/side-{0,1,2}.png`.

## Wave (Imagine)

Multiplayer wave uses front-facing raised-flipper frames `wave-{1,2,3}.png`
(frame 0 is still `down-0` idle). Prefer Grok Imagine sources:

```text
scripts/reference/penguin/imagine-wave/wave-{1,2,3}-source.png
```

```bash
npm run sprite:penguin-wave
```

If Imagine sources are missing, the script falls back to the procedural
`raiseFlipper` path on `down-0.png` (unit-tested in `scripts/lib/penguin-wave.test.mjs`).

## Refresh

```bash
# Put pose plates under poses/ then:
npm run sprite:penguin
# Wave plates (Imagine preferred):
npm run sprite:penguin-wave
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
