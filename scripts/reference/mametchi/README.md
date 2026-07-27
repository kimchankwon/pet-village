# Mametchi reference (Tamagotchi iD)

Sprites match the **Tamagotchi iD** section of the fandom gallery:

https://tamagotchi.fandom.com/wiki/Mametchi/Sprite_Gallery

## Official gallery files (preferred)

Downloaded from static.wikia (File:IDMametchi*.png):

| Pose | Gallery file | Caption |
|------|----------------|---------|
| neutral1 | `ID_Mametchi.PNG` | Neutral |
| neutral2 | `IDMametchiNeutral2.png` | Neutral |
| **walk1** | **`IDMametchiWalk.png`** | **Walking** |
| **walk2** | **`IDMametchiWalk2.png`** | **Walking** |
| happy | `IDMametchiHappy.png` | Happy |
| sad | `IDMametchiSad.png` | Sad |
| sleep | `IDMametchiSleep.png` | Sleeping |
| jump | `IDMametchiJump.png` | Jumping |

Copies live under `id-gallery/*-gallery.png`.  
Sliced/padded game inputs: `frames/*.png`.

## Full sheet (optional / backup)

https://www.spriters-resource.com/lcd_handhelds/tamagotchiididl/asset/221021/

- `id-sheet/mametchi-id-spriters.png`

Regenerate game assets:

```bash
npm run sprite:mametchi
```
