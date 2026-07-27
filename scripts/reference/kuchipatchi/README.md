# Kuchipatchi reference (Tamagotchi iD)

Sprites match the **Tamagotchi iD** section of the fandom gallery:

https://tamagotchi.fandom.com/wiki/Kuchipatchi/Sprite_Gallery

## Official gallery files

Downloaded from static.wikia (`File:IDKuchipatchi*.png`):

| Pose | Gallery file | Notes |
|------|----------------|-------|
| neutral1 | `IDKuchipatchiSprite.png` | Default standing |
| neutral2 | `IDKuchipatchiNeutral2.png` | Alternate neutral |
| walk1 | `IDKuchipatchiWalk.png` | Walking |
| walk2 | `IDKuchipatchiWalk2.png` | Walking |
| happy | `IDKuchipatchiHappy.png` | Happy |
| sad | `IDKuchipatchiSad.png` | Sad |
| sleep | `IDKuchipatchiSleep.png` | Sleeping |
| jump | `IDKuchipatchiShocked.png` | No Jump file in iD set; energetic open face |

Copies: `id-gallery/*-gallery.png`  
Game inputs: `frames/*.png`

Regenerate:

```bash
npm run sprite:kuchipatchi
```
