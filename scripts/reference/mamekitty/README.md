# Mame Kitty reference (Tamagotchi P's)

Sprites match the **Tamagotchi P's** section of the fandom gallery:

https://tamagotchi.fandom.com/wiki/Mame_Kitty/Sprite_Gallery

Mame Kitty is Mametchi's Sanrio Character Mix (Hello Kitty) form from the
Tamagotchi P's Deco Pierce era.

## Official gallery files

| Pose | Gallery file |
|------|----------------|
| neutral1 | `Mame Kitty.png` |
| neutral2 | `MameKittyBlush.png` |
| walk1 | `MameKittyWalk.png` |
| walk2 | `MameKittyWalk2.png` |
| happy | `MameKittyHappy.png` |
| sad | `MameKittySad.png` |
| sleep | `MameKittySleep.png` |
| jump | `MameKittyShock.png` (no Jump file; energetic open face) |

Also kept under `id-gallery/` for reference (not used by the generator):
`angry`, `sit`, `sit2`, `kiss`.

Copies: `id-gallery/*-gallery.png`  
Game inputs: `frames/*.png`

Regenerate:

```bash
npm run sprite:mamekitty
```
