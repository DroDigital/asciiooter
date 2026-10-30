# ASCIIOOTER — The Unwritten Deep

A cosmic-horror roguelite shooter, in first **or** third person, where every pixel is a letter.

No engine. No libraries. No image or audio files. The world is raycast at sub-character
resolution and redrawn every frame as glyphs. Each stratum is written in a different
text-art style: ASCII, ANSI blocks, braille, box-drawing and two procedurally generated
alien alphabets. Sound is synthesized live.

You are a Reader of the Order of the Lamp, descending ten floors through five strata
toward the Lacuna: the hole in the text beneath the world.

## Play

Open `index.html` in any current desktop browser with WebGL2 (Chrome, Edge, Firefox, Safari).
Nothing needs to be built or installed. To serve it instead:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

| Action | Keys |
| --- | --- |
| Move | `WASD` / arrow keys |
| Look | mouse (click to capture), arrow keys turn |
| Fire | left mouse / `J` |
| Dash (brief invulnerability) | `Space` / right mouse |
| Lantern on / off | `F` |
| Interact (braziers, books, altars, the well) | `E` |
| Weapons | `1`–`6`, mouse wheel, `Q` for last |
| First / third person | `V` |
| Map | hold `Tab` |
| Pause | `Esc` |

Gamepads are supported (left stick move, right stick look, RT fire, A dash, X interact,
Y lantern, bumpers switch weapons, stick-click switches camera).

## What is in it

- **Five strata, ten floors, two bosses.** The Archive (amber ASCII bookshelves), the Drowned
  Stacks (ANSI block art over reflective water, the sea visible from below), the Ossuary of
  Letters (fine ASCII bone walls), the Choir Vault (box-drawing cathedrals open to a sky where
  a colossal eye turns), and the Lacuna (ink on white paper, every wall in a different
  alphabet). At the bottom of the Ossuary waits the Redactor; at the bottom of everything, the Unwritten.
- **Creatures with rules you learn**, each drawn in its own alphabet:
  - *Watchers* move only when unseen.
  - *Hollows* are visible only in darkness.
  - *Lurkers* exist only in the corner of your eye.
  - *Echoes* return every shot you fire.
  - *Drowned* can only be hurt when they surface.
  - *Choirs* inhale before they sing.
  - *Maws* stun themselves charging into walls.
  - *Lamp-moths* hunt your lantern.
  - *Phantasms* are hallucinations.
- **Six weapons:**
  - **Quill:** infinite sidearm.
  - **Psalter:** scattergun.
  - **Litany:** fires a sentence one letter at a time.
  - **Lantern Lance:** burns your lantern oil as a beam.
  - **The Unspoken Word:** costs lucidity and erases a sphere of the world.
  - **Palimpsest:** a charged rail that writes through walls.
- **Lucidity, not a second health bar.** Darkness, gazes, songs and forbidden reading erode it.
  Madness raises your damage and reveals walls that are lies (secret vaults), but it also
  corrupts the screen and fills the dark with phantasms. The margins whisper, and their
  whispers point to the hidden walls.
- **Light as a resource.** Your lantern burns oil. Moths hunt it, Hollows hide in it, the
  Lance fires it, and braziers you light restore your mind.
- **Non-Euclidean rooms.** Mirror rooms whose doorways open back onto themselves forever
  (you can see yourself in them), and pillars that move when no one is looking.
- **Roguelite structure.**
  - 26 relics, chosen from the margins between strata and found in secret vaults.
  - Three Readers to unlock.
  - Permanent upgrades bought with Ink in the Scriptorium.
  - Heresies (difficulty modifiers) after your first victory.
  - A Codex of creatures, 24 lore fragments and a hidden true ending.
  - Fallen Readers leave remnants on the floor where they died, for the next Reader to find.
  - Seeds are phrases (`"ASHEN CHOIR WAITS"`). Speak one to replay a run, or play the same Daily Rite as everyone else.
- **Accessibility:** a reduce-flashing option, a madness-distortion slider, CRT effects can be
  turned off, glyph size settings (bigger glyphs render faster), FOV and invert look.

## How it renders

1. **Raycasting at 2x4 samples per character cell** (the braille grid). Walls, floors, ceilings,
   skylights and water reflections are computed per sample. A DDA raycaster with *edge portals*
   produces the non-Euclidean rooms.
2. **Sprites are signed-distance silhouettes**, not images. Each creature is a small function
   sampled per pixel, with emissive parts that bloom.
3. **Shape-matched glyphs.** At startup every glyph's ink coverage is measured on a 2x4 grid.
   For each style this builds a 256-entry table from "which of the 8 samples are lit" to the
   glyph with that shape. A wall edge becomes `/`, `_` or `|`; a creature's silhouette is drawn
   in its own alphabet. Flat areas use density ramps.
4. **Style mixing as meaning.** Each cell picks its style from its material, depth, creature,
   stratum and the player's sanity: braille for distance and sky, blocks for drowned stone,
   sigils for the things that should not be, and ink-mode inversion in the Lacuna.
5. **One WebGL2 draw call** composites the cell grid from a procedurally painted glyph atlas,
   with bloom sampled from the foreground grid, CRT curvature, scanlines and chromatic aberration.

Typical frame cost is a few milliseconds of JavaScript, depending on glyph size.

## Code map

| File | Responsibility |
| --- | --- |
| `src/core.js` | math, hashing, noise, seeded RNG, storage |
| `src/glyphs.js` | glyph registry, procedural atlas, coverage measurement, style sets and their shape tables |
| `src/display.js` | WebGL2 cell-grid compositor and post effects |
| `src/render.js` | raycaster, sky, reflections, sprites, sample-to-glyph conversion |
| `src/level.js` | level structure, portals, collision, lighting, flow fields, procedural generation |
| `src/entities.js` | creature silhouettes and behaviours, bosses, pickups, props |
| `src/player.js` | movement, dash, lantern, lucidity, weapons |
| `src/game.js` | runs, combat, effects, director, screens, saving |
| `src/ui.js` | HUD, menus, big text, map, overlays |
| `src/audio.js` | procedural sound effects and adaptive ambience |
| `src/data.js` | strata, weapons, relics, readers, lore |

Design notes are in [`docs/DESIGN.md`](docs/DESIGN.md).

### Debug URL parameters

`index.html?debug&floor=6` starts directly on a floor (0–9). `&third` starts in third person,
`&luc=20` sets lucidity, `&god` disables damage and `&reader=heretic` picks a Reader.
