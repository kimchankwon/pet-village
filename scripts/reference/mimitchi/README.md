# Mimitchi reference (Tamagotchi iD)

Sprites match the **Tamagotchi iD** section of the fandom gallery:

https://tamagotchi.fandom.com/wiki/Mimitchi/Sprite_Gallery

## Official gallery files

Downloaded from static.wikia (`File:IDMimitchi*.png`):

| Pose | Gallery file | Notes |
|------|----------------|-------|
| neutral1 | `IDMimitchiSide.png` | Default standing |
| neutral2 | `IDMimitchiSit.png` | Alternate standing smile |
| walk1 | `IDMimitchiWalk.png` | Walking |
| walk2 | `IDMimitchiHappy2.png` | No Walk2 file; open-mouth planted stride |
| happy | `IDMimitchiHappy.png` | Happy |
| sad | `IDMimitchiSad.png` | Sad |
| sleep | `IDMimitchiAnnoyed.png` | No Sleep file; closed-eye pose |
| jump | `IDMimitchiUp.png` | Looking up |

Copies: `id-gallery/*-gallery.png`  
Game inputs: `frames/*.png`

Regenerate:

```bash
npm run sprite:mimitchi
```
