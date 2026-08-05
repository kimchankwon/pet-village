# Penguin clothes overlays

Imagine-authored RGBA overlays aligned to idle plates (`down-0` / `up-0` / `side-0`).

Runtime (`pixelart.ts`) stamps these onto every walk frame and every move-emote
frame by warping each overlay from the idle body bbox to the destination body
bbox, so a scarf or hat stays on the penguin through dance, wave, sit, etc.

Source Imagine plates (and extraction notes) live under
`scripts/reference/penguin/clothes/`.
