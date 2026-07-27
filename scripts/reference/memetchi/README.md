# Memetchi reference (Tamagotchi iD)

Sprites match the **Tamagotchi iD** section of the fandom gallery:

https://tamagotchi.fandom.com/wiki/Memetchi/Sprite_Gallery

## Official gallery files

| Pose | Gallery file |
|------|----------------|
| neutral1 | `ID_Memetchi.PNG` |
| neutral2 | `IDMemetchiNeutral2.png` |
| walk1 | `IDMemetchiWalk.png` |
| walk2 | `IDMemetchiWalk2.png` |
| happy | `IDMemetchiHappy.png` |
| sad | `IDMemetchiSad.png` |
| sleep | `IDMemetchiSleep.png` |
| jump | `IDMemetchiShocked.png` (no Jump file; energetic open face) |

Copies: `id-gallery/*-gallery.png`  
Game inputs: `frames/*.png`

Regenerate:

```bash
npm run sprite:memetchi
```
