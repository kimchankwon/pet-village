# Penguin clothes (Imagine)

Idle-plate overlays for gift-shop gear live in
`public/assets/player/penguin/clothes/{item}-{down|up|side}.png`.

They were authored with Grok Imagine on top of `down-0` / `up-0` / `side-0`,
then difference-extracted so only the clothing pixels remain. Runtime stamping
is in `src/sprites/pixelart.ts` (`stampClothesPngOnFrame` on idle plant only).
