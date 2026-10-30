# ASCIIOOTER: Design Notes

**Logline:** a lantern-lit descent through a library at the bottom of the world, where reality is
literally text, and the deeper you go the stranger the alphabet becomes.

**Hook:** the rendering *is* the fiction. Everything is made of characters because the world is a
text, and the thing beneath it is erasing it.

## Pillars

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
| The Redactor | blacks out bands of the screen, fires fans, summons, blinks | read the gaps between the moving bars |
| The Unwritten | four seals shield the heart; rains omens, rings of notes; the page collapses | break the seals, then the heart |

## Technical summary

- **Grid:** about 160x50 cells at 1280x720 with medium glyphs, so the world is sampled at 320x200.
- **Raycasting:** DDA with an edge-portal table (`plink`). Each column records its portal crossings, so
  floors, ceilings and sprites beyond a portal are drawn in the right space. Mirror rooms repeat infinitely.
- **Glyph selection:** each style builds a 256-entry shape table offline. At runtime every cell computes
  its 8-sample mask, foreground and background colours, and takes one table lookup.
- **Models:** smooth-blended distance fields rasterized in two passes (field, then shading). Large models
  use a coarse grid with interpolation. Normals come from the field gradient, inflated toward the viewer.
  Shading has diffuse, wrapped subsurface, specular (power by repeated squaring) and rim terms, plus
  refraction for the Hollow's invisibility. Animation: walk cycles driven by movement, facing, attack
  telegraphs, hit lean, dissolve-to-ember deaths, and fade-in summons.
- **Effects:** sparks, smoke, ink droplets that become stains, rings, perspective tracer lines, contact
  shadows, light spilled by creatures, and ambient particles for each stratum, all depth-tested against the glyph grid.
- **Lighting:** a baked line-of-sight lightmap with bilinear sampling, a lantern falloff table,
  and up to about 12 dynamic lights (muzzle flash, projectiles, beams, explosions).
- **Determinism:** levels come from `hash(seed phrase + floor)`. Combat randomness is separate.
- **Audio:** WebAudio graphs per effect, a convolution reverb from a generated impulse, and a drone
  bed whose tritone voice rises as lucidity falls. A combat pulse follows threat; a heartbeat
  follows danger; whispers follow madness.
- **Saving:** localStorage, guarded, so private windows still play.

## Risks and mitigations

- **CPU cost of per-sample raycasting.** Lightmap samples are shared across row pairs, there are no
  per-frame allocations, and glyph size is a player option.
- **Readability under corruption.** Creature cells are exempt, threats have minimum brightness,
  and a reduce-flashing option exists.
- **Font variance across platforms.** Only ASCII comes from the system font; blocks, braille, box-drawing,
  symbols and sigils are painted procedurally.
