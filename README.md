# ASCIIOOTER — The Unwritten Deep

A cosmic-horror roguelite shooter, in first **or** third person, where every pixel is a letter.

No engine. No libraries. No image or audio files. The world is raycast at sub-character
resolution and redrawn every frame as glyphs. Each stratum is written in a different
text-art style: ASCII, ANSI blocks, braille, box-drawing and two procedurally generated
alien alphabets. Sound is synthesized live.

You are a Reader of the Order of the Lamp, descending thirteen floors through eight strata
toward the Lacuna: the hole in the text beneath the world. The descent begins in a library and
leaves it behind: below the bones, the world stops being written and becomes geometry, light, and
finally the inside of an eye.

## Play

### Desktop app (fastest)

The desktop app renders every frame on all of your CPU cores. You need [Node.js](https://nodejs.org) 20 or later.

```bash
npm install
```

```bash
npm start
```

F11 or Alt+Enter toggles fullscreen. Start it with `npm start -- --fullscreen` to open fullscreen.

To build an installer for your own system, run `npm run dist`. It writes a Windows installer and a portable
`.exe`, a macOS `.dmg`, or a Linux AppImage to `dist/`. The **Desktop builds** GitHub Actions workflow builds
all three; run it from the Actions tab or push a `v*` tag, then download the installers from the run's
artifacts. The builds are unsigned, so Windows SmartScreen and macOS Gatekeeper ask you to confirm the first launch.

### Browser

Serve the folder with the bundled server. It sends the two headers browsers require before they allow shared
memory, so the browser version can use every core too:

```bash
node serve.js
```

Then visit <http://localhost:8000> in a current desktop browser with WebGL2 (Chrome, Edge, Firefox, Safari).

Opening `index.html` directly, or serving it with any other static server, also works, but rendering then
runs on a single thread.

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

- **Eight strata, thirteen floors, four bosses**, each stratum stranger than the last:
  1. **The Archive:** amber ASCII bookshelves.
  2. **The Drowned Stacks:** ANSI block art over reflective water, with the sea visible from below.
  3. **The Ossuary of Letters:** fine ASCII bone walls. *The Redactor* waits at the bottom.
  4. **The Folded Geometry:** self-lit wireframe rooms on a glowing grid, folded into each other by
     portals, under a sky where a mountain-sized tesseract turns in four dimensions. *The Orthogon* waits at the bottom.
  5. **The Choir Vault:** box-drawing cathedrals open to a sky where a colossal eye turns.
  6. **The Prism Abyss:** walls of split light whose colours slide over every surface, mirror
     floors that reflect them, and aurora ribbons in the sky.
  7. **The Inside of the Eye:** veined flesh that breathes with a heartbeat, walls full of eyes
     that stare back and blink, and an iris for a sky. *The Oculus* waits at the bottom.
  8. **The Lacuna:** ink on white paper, every wall in a different alphabet. *The Unwritten* waits at the bottom of everything.
- **27 creatures with rules you learn**, cel-shaded and drawn in their own alphabets:
  - *Watchers* move only when unseen.
  - *Hollows* are visible only in darkness.
  - *Lurkers* exist only in the corner of your eye.
  - *Echoes* return every shot you fire.
  - *Drowned* can only be hurt when they surface.
  - *Choirs* inhale before they sing.
  - *Maws* stun themselves charging into walls.
  - *Lamp-moths* hunt your lantern.
  - *Phantasms* are hallucinations.
  - *Tome swarms* flock like birds and bite.
  - *Scriveners* write glowing mines on the floor and blink away.
  - *The Hanged* wait overhead and drop when you pass beneath.
  - *Tendril Blooms* are rooted: they whip whatever is close and lob spores that rot the mind.
  - *Broodsacs* spill exploding *mites* with every wound.
  - *Margin Hounds* hunt in packs, circle, and pounce.
  - *Bell-ringers* toll shockwave rings you must dash through, and hasten their allies.
  - *Ciphers* hide behind a rotating shield and sweep an aimed beam.
  - *Mirror Knights* reflect shots from the front and charge with a lance.
  - *Candlewick Wraiths* dive through you leaving fire, and burst into flame when they die.
  - *Ink Golems* shed their book-plate armour as they're hurt, slam the floor, and throw torn-off debris.
  - *Tesseracts* are rotating 4D wireframes, invulnerable while folded flat; unfolded, they fire along right angles.
  - *Recursions* are living Sierpinski triangles that divide into two smaller, faster copies when killed, unless a blast ends the line.
  - *Refractors* are prisms that feed on your lantern light; their three colours converge where you stood.
  - *Chromaghasts* walk as three coloured ghosts. Only the true one casts a shadow; striking a false one makes it scream light into your mind.
  - *Oculoids* are floating eyes that fire only after holding your gaze. Their backs are closed lids.
  - *Gnashers* swim beneath the floor; a closing ring of teeth marks where they will rise.
- **Four bosses:**
  - *The Redactor* blacks out the screen in moving bars.
  - *The Orthogon* is a god of corners, wounded only while its faces are open, with beams that keep to right angles and later turn.
  - *The Oculus* can be wounded only while it stares; its burning gaze is broken by pillars, its tears fall where you stand, and at the end it blinks the world shut.
  - *The Unwritten* hides behind four seals.
- **Physics and destruction.**
  - Particles collide with walls, floors and ceilings, bounce, tumble and come to rest.
  - Explosions shove everything: particles, props, oil casks, and creatures, which fly through the air and land.
  - Walls have hit points. They crack as you damage them, then collapse into physical rubble and open new routes.
  - Loose props can be kicked and shot apart. Oil casks explode in chain reactions and leave burning ground.
  - Creatures burst into hundreds of physical fragments sampled from their own 3D model, in their own letters.
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
- **Combat that answers back.**
  - *Perfect dodge:* dash through a blow at the last instant and the world slows. The dash comes
    straight back, your mind steadies, and your next shot is written in CAPITALS (double damage).
  - *Erasure:* a creature broken below a quarter of its life becomes legible and flickers white.
    Press `E` to lunge and strike it out of the text in slow motion; it heals you and may drop ammunition.
  - *Fervor:* kills that follow quickly on each other build a chain worth up to +50% damage and more ink.
  - Damage is written in the air. Controls are buffered (a dash or shot pressed a moment early still
    happens), and the mouse uses raw input where the browser allows it.
- **Dark sight.** Your eyes adapt to the dark: shadows lift without washing out the light. When light
  fails, the edges of walls and doorways are drawn as pale chalk lines and nearby floor shows its tiles.
  Pickups, braziers, lecterns, altars and the well carry soft beacons, and markers at the screen edge
  show hunting creatures you can't see. Watchers, Hollows, Lurkers and phantasms are exempt, so their rules hold.
- **Accessibility:** a reduce-flashing option, a madness-distortion slider, CRT effects can be
  turned off, glyph size settings (bigger glyphs render faster), FOV, invert look, brightness, and dark sight.
- **Performance options:** render threads, automatic resolution (glyphs grow until the grid fits what your
  CPU can draw at full frame rate; FULL turns this off), and sharpness (the pixel density cap on
  high-DPI screens). `SHOW FRAME RATE` displays the frame cost.

## How it renders

1. **Raycasting at 2x4 samples per character cell** (the braille grid). Walls, floors, ceilings,
   skylights and water reflections are computed per sample. A DDA raycaster with *edge portals*
   produces the non-Euclidean rooms.
2. **Every creature, object and held weapon is a lit distance-field model**, not an image.
   - Models are built from smoothly blended capsules and two-bone limbs, with several materials each.
   - They are rasterized in two passes. The first evaluates the distance field; large models use a
     coarse grid and interpolation. The second derives surface normals from the field's gradient and
     shades with diffuse, specular, subsurface and rim lighting, coloured by every nearby light.
   - Creatures walk and turn to face where they move: eyes vanish when they turn away.
   - They telegraph attacks, recoil when hit, burst apart into physical fragments when they die,
     and fade in when summoned.
   - **Creatures are cel-shaded:** three hard bands of light, a hard highlight and a hard rim,
     with ink outlines at silhouettes and material boundaries. Outlines are drawn as shape-matched
     line glyphs (`/`, `|`, `_`), so they read as comic ink strokes made of ASCII.
   - Things on the ground cast soft contact shadows. Glowing eyes, mouths and wounds light the walls around them.
   - The weapon in your hands is a shaded model too. It bobs, sways with your aim, kicks with recoil,
     lowers when you switch, and flashes at the muzzle.
3. **Shape-matched glyphs.** At startup every glyph's ink coverage is measured on a 2x4 grid.
   For each style this builds a 256-entry table from "which of the 8 samples are lit" to the
   glyph with that shape. A wall edge becomes `/`, `_` or `|`; a creature's silhouette is drawn
   in its own alphabet. Flat areas use density ramps.
4. **Style mixing as meaning.** Each cell picks its style from its material, depth, creature,
   stratum and the player's sanity: braille for distance and sky, blocks for drowned stone,
   sigils for the things that should not be, and ink-mode inversion in the Lacuna.
5. **Effects are drawn into the grid as well:**
   - Perspective-correct tracer, beam and rail lines.
   - Streaking sparks with a heat colour ramp, smoke that grows and catches the light, and ink
     droplets that leave lasting stains on floors and walls.
   - Shockwave rings and screen ripples, footstep dust and water ripples.
   - Ambient particles in each stratum: dust in the lantern light, drips, ash, spores, and ink rising in the Lacuna.
6. **Light in the air.** Every nearby light scatters a halo into the haze along each view ray (a
   closed-form closest approach of the ray to the light, per sample), so muzzle flashes, fires and
   glowing creatures hang in the air and are cut off by walls. Floors and ceilings darken where they meet
   walls (ambient occlusion), and walls darken toward their seams.
7. **One WebGL2 draw call** composites the cell grid from a procedurally painted glyph atlas,
   with bloom sampled from the foreground grid, god rays toward the two strongest visible lights, CRT curvature, scanlines, chromatic aberration,
   shockwave distortion, dash speed-blur and colour grading that drains as you weaken.

8. **Multithreaded.** When shared memory is available (the desktop app, or `serve.js`), the raycast is
   split into vertical strips. Worker threads and the main thread claim strips from one atomic counter
   and write straight into shared sample buffers, so a thread that is busy or late just takes fewer
   strips and a frame never waits on it. Workers keep a mirror of the level: tiles, the lightmap and wall
   damage live in shared memory, and stains are re-sent when they change. The main thread then draws
   creatures, water reflections, glyphs and effects over the finished world. Output is bit-identical to
   the single-threaded renderer.

On a 4-core machine at 1920x1080, a threaded frame costs 30–50% less than a single-threaded one.

## Code map

| File | Responsibility |
| --- | --- |
| `src/core.js` | math, hashing, noise, seeded RNG, storage |
| `src/glyphs.js` | glyph registry, procedural atlas, coverage measurement, style sets and their shape tables |
| `src/display.js` | WebGL2 cell-grid compositor and post effects |
| `src/render.js` | raycaster, sky, reflections, stains, lit model rasterizer, sample-to-glyph conversion, particles and lines |
| `src/mt.js` | render thread pool: strip scheduling over shared memory, keeping the workers' level in sync |
| `src/render-worker.js` | a render thread: raycasts claimed strips into the shared sample buffers |
| `src/level.js` | level structure, portals, collision, lighting, flow fields, procedural generation |
| `src/entities.js` | creature behaviours, bosses, pickups, props |
| `src/models.js` | distance-field models, materials, lights and small effects for everything, plus the held weapons |
| `src/bestiary.js` | the twelve newer creatures (models and movesets), mines, thrown debris, spores and oil casks |
| `src/dimensions.js` | the creatures and bosses of the Folded Geometry, the Prism Abyss and the Inside of the Eye |
| `src/physics.js` | colliding particles, impulses, creatures shattering into fragments, destructible walls, pushable bodies, hazards and shockwaves |
| `src/player.js` | movement, dash, lantern, lucidity, weapons |
| `src/game.js` | runs, combat, effects, director, screens, saving |
| `src/ui.js` | HUD, menus, big text, map, overlays |
| `src/audio.js` | procedural sound effects and adaptive ambience |
| `src/data.js` | strata, weapons, relics, readers, lore |

| `desktop/main.js` | the Electron desktop app: a private `app://` origin with cross-origin isolation, GPU and throttling switches, fullscreen |
| `serve.js` | a dependency-free local server with the cross-origin isolation headers |

Design notes are in [`docs/DESIGN.md`](docs/DESIGN.md).

### Debug URL parameters

`index.html?debug&floor=6` starts directly on a floor (0–12). `&third` starts in third person,
`&luc=20` sets lucidity, `&god` disables damage and `&reader=heretic` picks a Reader.
`&threads=2` sets the number of render worker threads (0 turns them off). In the desktop app,
`npm start -- --game-debug` adds `?debug`, and `--devtools` lets F12 open the developer tools.
