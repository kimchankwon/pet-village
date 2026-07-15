# Player penguin Imagine plates

Like MINITEEN source plates: keep Grok Imagine resolution (capped at 512px),
transparent background, shared canvas. Phaser draws them with **nearest-neighbour**
scale to classic height (~60 world px) — no majority-downsample to 18×20.

## Club Penguin stance rules

Match classic Club Penguin proportions and pose:

| Pose | Flippers | Feet | Eyes (side) |
|------|----------|------|-------------|
| **Frame 0** (idle / stop) | Hang **down** by the body — never T-pose | **Both planted** flat | White oval + black pupil |
| **Frame 1** (walk step) | Still by the body, slight sway ok | One foot steps / lifts | White oval + black pupil |

Front eyes are white with black pupils. Side view must **never** use a solid
black dot for the eye. Generate plates from the CP references under this folder
(`cp-front.png`, `cp-side-angle.png`, `cp-back-angle.png`, `cp-tenor-frame.png`).

When the player stops, scenes set texture frame **0** — so frame 0 is the
standing idle, not a mid-walk hop.

## Refresh

```bash
# Put pose plates under poses/ then:
npm run sprite:penguin
```

Poses:

```text
scripts/reference/penguin/poses/{down,up,side}-{0,1}.png
# optional idle mirrors (same art as *-0):
scripts/reference/penguin/poses/{down,up,side}-idle.png
```

Output: `public/assets/player/penguin/`.

Boot loads `penguin-plate-*` keys; `makePenguin` recolours body blues for the
selected colourway and stamps clothes overlays at plate scale.
