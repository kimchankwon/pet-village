# Player penguin Imagine plates

Like MINITEEN source plates: keep Grok Imagine resolution (capped at 512px),
transparent background, shared canvas. Phaser draws them with **nearest-neighbour**
scale to classic height (~60 world px) — no majority-downsample to 18×20.

## Refresh

```bash
# Put pose plates under poses/ then:
npm run sprite:penguin
```

Poses:

```text
scripts/reference/penguin/poses/{down,up,side}-{0,1}.png
```

Output: `public/assets/player/penguin/`.

Boot loads `penguin-plate-*` keys; `makePenguin` recolours body blues for the
selected colourway and stamps clothes overlays at plate scale.
