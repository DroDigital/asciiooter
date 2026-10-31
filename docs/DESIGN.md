# ASCIIOOTER: Design Notes

**Logline:** a lantern-lit descent through a library at the bottom of the world, where reality is
literally text, and the deeper you go the stranger the alphabet becomes.

**Hook:** the rendering *is* the fiction. Everything is made of characters because the world is a
text, and the thing beneath it is erasing it.

## Pillars

0. **Transcendence.** The descent starts in a library, the most familiar place a reader knows, and
   leaves it. Every stratum after the Ossuary is further from anything that was ever written:
   geometry that folds, light that splits, and the inside of the eye that has been watching.

1. **Awe through scale.** Skylights open onto a sky beneath the world, where an eye the size of a
   city slowly turns. In the final arena it fills the sky.
2. **Dread through rules, not jump scares.** Every creature obeys an alien rule the player learns,
   and the Codex records it after three kills.
3. **Madness as power.** Lucidity is a resource you spend for damage and sight, not a second
   health bar.
4. **Light as a resource.** The lantern is your armour, your bait and, with the Lance, your ammunition.
5. **Readable even when wrong.** Corruption never touches creature cells. Threats keep a minimum
   brightness and their own alphabet.

**Anti-pillars:** no jump-scare stingers, no dark-pattern retention, no pixel art pretending to be text.

## Style-mixing map

| Context | Style | Why |
| --- | --- | --- |
| Far distance, sky, fog | braille | the finest grain reads as atmosphere |
| Archive walls | shape-matched ASCII + legible inscriptions | the library is written |
| Drowned stone | ANSI quadrant blocks | heavy, wet, two-tone |
| Ossuary | dense ASCII ramp | bone dust |
| Choir Vault | box-drawing | pipes, ribs, cathedral tracery |
| Folded Geometry | box-drawing wireframes, self-lit, on a braille grid floor | space reduced to its edges |
| Prism Abyss | bold ASCII walls in sliding spectral bands, mirror floors | light coming apart |
| Inside of the Eye | alien sigils over veined flesh; walls of eyes that blink | nothing here was ever meant to be read |
| Lacuna | ink mode, a random style per wall | the page itself is failing |
| Creatures | their own alphabet (sigils, blocks, braille, box) | the incomprehensible is written differently |
| Low lucidity | environment cells drift into sigils | the world mis-reads itself |
| Final boss phase 3 | everything collapses toward braille | reality loses resolution |

**Rejected:** per-cell random styles everywhere. It read as noise and destroyed threat readability.

## Loop

- **Seconds:** move, dash, aim, decide whether the lantern is on.
- **Floors:** find the well, light braziers, read lore (lucidity for Ink), find the lie in the wall.
- **Runs:** choose relics between strata, find weapons, beat the Redactor, reach the Lacuna.
- **Meta:** Ink buys Readers and Annotations; the Codex, epitaphs, Heresies and the true ending keep the
  50th run different from the first.

## Creatures

| Creature | Rule | Counter |
| --- | --- | --- |
| Wretch | arms rise before it strikes | step back at the telegraph |
| Lamp-moth | hunts lantern light, drinks oil | lantern off |
| Watcher | moves only unseen; its gaze drains lucidity | keep it in view while you back off; Sewn Eyelids |
| Hollow | invisible in light | lantern off, or madness below 25 |
| Drowned | immune while submerged | strike when it surfaces |
| Choir | inhales, then sings homing notes | dash through the volley |
| Echo | returns every shot you fire | few heavy hits: Psalter, Word, Palimpsest |
| Lurker | visible only in peripheral vision; freezes when looked at | remember where it vanished and shoot there |
| Maw | roars, then charges; stuns itself on walls | sidestep, then punish the stun (double damage) |
| Phantasm | hallucination, harmless | its edges flicker; don't waste ammunition |
| Tome swarm | flocks (boids), bites, scatters | blasts break the flock |
| Scrivener | darts in bursts, writes floor mines, blinks when cornered | watch the floor; corner it after the blink |
| The Hanged | waits overhead, drops when you pass beneath | look up |
| Tendril Bloom | rooted whip, lobbed spores leave mind-rotting gas | stay out of reach, kill it from range |
| Broodsac / Mite | wounds release kamikaze mites | burst it from afar; shoot mites first |
| Margin Hound | packs circle, crouch, then pounce | dash sideways at the crouch |
| Bell-ringer | tolls an expanding ring; hastens allies | dash through the ring |
| Cipher | rotating shield; aims, then sweeps a beam | shoot through the gap; move after the aim |
| Mirror Knight | reflects frontal hits; lance charge, stuns on walls | flank, blast, or punish the stun |
| Candlewick Wraith | orbits, dives through you leaving fire; explodes on death | kill it at range |
| Ink Golem | book-plate armour, floor slam, thrown debris | dash through the slam; break the plates |
| The Redactor | blacks out bands of the screen, fires fans, summons, blinks | read the gaps between the moving bars |
| Tesseract | invulnerable while folded flat; unfolds and fires along the four right angles | stand off-axis; strike while open |
| Recursion | divides into two smaller, faster copies on death, three generations deep | blasts end the line |
| Refractor | heals and hardens in lamplight; three colours converge where you stood | lantern off; keep moving |
| Chromaghast | walks as three coloured ghosts; false ones scream light when struck | find the one with a shadow |
| Oculoid | fires only after holding your gaze; its back is an armoured lid | break line of sight; strike its pupil |
| Gnasher | swims under the floor; a closing ring of teeth marks where it rises | step out of the ring, punish it while up |
| The Orthogon | wounded only while open; right-angled beams that later turn; it summons geometry | the diagonals, the pillars, the open window |
| The Oculus | wounded only while it stares; its gaze burns, its tears fall on you, it blinks the world shut | hide from the gaze, strike the stare |
| The Unwritten | four seals shield the heart; rains omens, rings of notes; the page collapses | break the seals, then the heart |

## Technical summary

- **Grid:** about 160x50 cells at 1280x720 with medium glyphs, so the world is sampled at 320x200.
  The grid is capped at 300x110 cells. Under automatic resolution, glyphs grow until the grid fits a cell
  budget: 13,000 cells on one thread, up to 2.6 times that with render threads.
- **Threads:** with shared memory (cross-origin isolation from the desktop app's `app://` protocol or
  `serve.js`), the world raycast runs as vertical strips claimed from an atomic counter by up to seven
  workers plus the main thread. A claim packs a frame generation with the strip index, so a late worker
  can never take a strip of a newer frame. Shared arrays are only written when a value changes, to avoid
  cache-line traffic between cores. Water reflections read neighbouring columns, so they run after the
  strips join. If a strip stalls for 400 ms, rendering falls back to one thread for good.
- **Raycasting:** DDA with an edge-portal table (`plink`). Each column records its portal crossings, so
  floors, ceilings and sprites beyond a portal are drawn in the right space. Mirror rooms repeat infinitely.
- **Glyph selection:** each style builds a 256-entry shape table offline. At runtime every cell computes
  its 8-sample mask, foreground and background colours, and takes one table lookup.
- **Models:** smooth-blended distance fields rasterized in two passes (field, then shading). Large models
  use a coarse grid with interpolation. Normals come from the field gradient, inflated toward the viewer.
  Shading has diffuse, wrapped subsurface, specular (power by repeated squaring) and rim terms, plus
  refraction for the Hollow's invisibility. Animation: walk cycles driven by movement, facing, attack
  telegraphs, hit lean, dissolve-to-ember deaths, and fade-in summons.
- **Cel shading:** for creatures, light is quantized relative to the model's own exposure into three
  bands, with hard specular and rim terms. Samples on the silhouette or on a material boundary are
  flagged as ink. At glyph level, ink becomes line glyphs over a dark ground, and flat fill becomes a
  glyph density chosen by band. Creatures keep a minimum exposure so threats stay readable in the dark.
- **Physics:** particles integrate with gravity, drag and buoyancy. They collide per axis against the
  tile grid with restitution and friction, and sleep when at rest. Impulses push particles, props and
  creatures (by mass; light ones go airborne). Deaths sample the creature's model on a world-space grid
  and emit one physical fragment per interior sample, coloured by material.
- **Destruction:** every wall tile has hit points by material, and the map border is indestructible.
  Damage draws procedural cracks; collapse spawns rubble and dust, leaves a stain, and re-bakes the
  lightmap and flow field.
- **Effects:** sparks, smoke, ink droplets that become stains, rings, perspective tracer lines, contact
  shadows, light spilled by creatures, and ambient particles for each stratum, all depth-tested against the glyph grid.
- **Lighting:** a baked line-of-sight lightmap with bilinear sampling, a lantern falloff table,
  and up to about 12 dynamic lights (muzzle flash, projectiles, beams, explosions). Wall and floor
  patterns can emit their own light (wireframes, veins, irises).
- **Dark sight:** exposure adapts to the measured scene brightness with a shoulder curve (c*k / (1 + (k-1)*c)),
  so shadows lift while highlights hold. In dark cells, structural edges (wall/floor seams, depth
  jumps) are drawn as chalk lines, nearby floor shows its tile grid, and a screen-space overlay places
  depth-tested beacons over usable things and edge markers toward unseen hunters.
- **Volumetrics:** per column, lights whose 2D closest approach is near the ray are kept (up to six);
  per sample, the 3D closest approach of the view ray (clamped to the surface depth) gives a Gaussian
  halo. God rays are a 14-tap radial blur of bright cells toward up to two sources chosen on the CPU
  (visible, unoccluded, scored by intensity and distance) and faded between frames.
- **Feel:** a perfect dodge (hit during the first 0.26 s of a dash) slows the world to about a quarter
  speed for a second. Erasures, fervor chains, damage numbers, input buffering (dash 0.16 s, fire 0.15 s)
  and raw pointer-lock input make the moment-to-moment combat sharper. The held weapon tilts with
  strafing, lags pitch, breathes when still, and thrusts through erasures.
- **Dimension effects:** a 4D tesseract sky (vertices rotated in four planes and projected once per sky
  refresh), aurora and iris skies, mirror floors in the reflection pass, a heartbeat that drives the
  Eye's breathing walls, and eyelids that close over the screen when the Oculus blinks.
- **Determinism:** levels come from `hash(seed phrase + floor)`. Combat randomness is separate.
- **Audio:** WebAudio graphs per effect, a convolution reverb from a generated impulse, and a drone
  bed whose tritone voice rises as lucidity falls. A combat pulse follows threat; a heartbeat
  follows danger; whispers follow madness.
- **Saving:** localStorage, guarded, so private windows still play.

## Risks and mitigations

- **CPU cost of per-sample raycasting.** Lightmap samples are shared across row pairs. Dynamic lights
  are culled per tile with bitmasks, and the sky is a lazily refreshed cached panorama. There are no
  per-frame allocations in the hot loops. The raycast is spread over every core where shared memory is
  available, and automatic resolution keeps the grid within what the CPU can draw.
- **Browsers without cross-origin isolation.** Pages opened from disk or plain static hosts get no
  shared memory, so they render on one thread with a smaller cell budget. The desktop app and `serve.js`
  set the required headers.
- **Readability under corruption.** Creature cells are exempt, threats have minimum brightness,
  and a reduce-flashing option exists.
- **Font variance across platforms.** Only ASCII comes from the system font; blocks, braille, box-drawing,
  symbols and sigils are painted procedurally.
