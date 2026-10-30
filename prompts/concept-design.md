# Prompt: Concept Design for a Cosmic-Horror ASCII First-Person Roguelite

## Your role

You are two people at once: a **creative director** who has shipped acclaimed
roguelites, and a **graphics/engine programmer** who has written software
renderers from scratch and cares about every millisecond. You also know cosmic
horror as a literary tradition. To you it is not tentacles and green glow. It is
the dread of scale, cosmic indifference, and knowledge that harms whoever learns
it. Defend every decision as if you were in a greenlight meeting, and make sure
it can run at 60 fps.

## The task

Design an **original first-person shooter with roguelite structure, drawn
entirely in text characters, with a cosmic-horror theme**. Write a concept
design document detailed enough that one capable programmer or a small team
could start building a vertical slice from it tomorrow.

The bar is not "good for an ASCII game." The text rendering should be the
game's greatest strength. Players should stop and stare at the screen, and the
game should only make sense in this medium.

Assume PC/browser, mouse + keyboard (gamepad supported), and runs of 20–40
minutes, unless you have a strong reason to change these. If you do, say why.

## Hard constraints

1. **No game engine or game framework.** That rules out Unity, Unreal, Godot,
   GameMaker, Phaser, three.js, Babylon, and similar. You may use a language,
   its standard library and raw platform APIs: Canvas 2D, WebGL/WebGPU,
   WebAudio, terminal escape sequences, or a minimal window/input/audio layer
   such as SDL or minifb. You write everything that makes it a game by hand:
   rendering, collision, AI, procgen, audio synthesis and UI.
2. **Text characters are the foundation of the look.** By default, each cell
   holds one glyph, a foreground color, a background color, and any per-cell
   attributes you invent. Sprites and textured polygons are not allowed.
   **You may mix styles if the result looks stunning.** Examples:
   - Classic ASCII alongside ANSI block art, Braille, box-drawing, PETSCII-style
     symbols or CJK/runic/mathematical glyphs.
   - Several overlaid grids with different cell sizes or fonts.
   - CRT/phosphor or vector-glow treatments.
   - Typographic or concrete-poetry layouts.
   - Shader effects applied per cell or across the screen.

   For every mix, say what it adds and why it does not dilute the game's
   identity. The mix must not become a generic pixel shooter with a text
   filter on top.
3. **Original IP.** Do not use Lovecraft's entities, places or books (Cthulhu,
   Arkham, the Necronomicon, etc.). Do not reskin or recreate any existing
   game. You may name influences, but you must transform anything you borrow.
4. **Performance:**
   - Stable 60 fps on a ~2019 mid-range laptop with integrated graphics, or in
     a browser tab, at your chosen grid size. Justify the grid size; ~240×80
     cells is a reasonable baseline.
   - Simulation plus rendering under 8 ms per frame.
   - Cold start under 2 s.
   - Total download under ~5 MB, with no external art or audio assets.
5. **Plausible scope.** Separate clearly what goes in a vertical slice and
   what goes in 1.0.

## What "the best possible" means: the pillars

Give each pillar a concrete, testable form, not an adjective.

- **Awe and visual fidelity:** at least one moment per run that feels like
  seeing something enormous for the first time, drawn in text.
- **Atmosphere and dread:** fear built from anticipation, scale and wrongness
  rather than jump scares.
- **Game feel:** shooting feels punchy in a character grid. Think about
  recoil, hit-stop, screen shake as grid displacement, glyph shattering,
  muzzle light and impact readability.
- **Replayability:** runs differ in how they *play*, not just in their
  numbers.
- **Enjoyment and retention without dark patterns:** players return for
  mastery, mystery and discovery. No FOMO timers and no manipulative economies.
- **Uniqueness:** a stranger can identify the game from a single screenshot.
- **Performance:** the fastest-feeling shooter the player owns, with minimal
  input latency.
- **Accessibility:** horror visuals tend to flash and distort, so photosensitivity
  safety is required. Also cover colorblind palettes, toggles for intensity
  effects, and full input remapping.

## Core problems you must actually solve (no hand-waving)

1. **Drawing a first-person 3D world as characters.**
   - Choose an approach: grid raycasting, portals/BSP, SDF raymarching, a
     software rasterizer into a sub-cell buffer, or a hybrid. Explain the
     pipeline from scene to per-cell luminance, color, normal and depth to
     glyph.
   - Pick glyphs by **shape**, not only brightness (`/ \ | _ -` follow edge
     direction and surface normal).
   - Get sub-cell resolution from half-blocks, quadrants, sextants or Braille.
   - Keep the image temporally stable, with no shimmer while moving.
   - Use darkness and fog as a gameplay layer, and support dynamic lights.
   - Make enemies readable at a distance when they are only a few cells wide.
2. **Readability under horror.** The screen must become *wrong* without
   becoming *unreadable*. Define the rules that guarantee the player can always
   see the threats.
3. **Text as part of the fiction.** Explain why this world is made of
   characters. The best answer makes the glyph grid a diegetic, mechanical
   substrate that can be read, corrupted, rewritten or exploited.
4. **Sound with no audio files.** Specify the procedural synthesis: weapons,
   creatures, ambience and adaptive music. Explain how sound carries tactical
   information.
5. **Procedural spaces that feel authored**, including non-Euclidean geometry:
   impossible rooms, portals, interiors larger than their exteriors and
   geometry that changes when unobserved. Show how the level graph and the
   renderer represent each of these.
6. **The roguelite loop.** Cover run structure, what persists between runs,
   and why the 50th run feels different from the first.
7. **Style mixing as a design language.** Decide where each text-art style
   is used, and why:
   - by depth: for example, Braille for distant detail and bold block glyphs
     up close;
   - by entity class, since the incomprehensible could be drawn in a different
     "alphabet" from the human;
   - by stratum;
   - by sanity state;
   - during transitions between any of these.

   A shift in style should carry meaning the player can learn. It should never
   be decoration alone.
8. **Cosmic horror as mechanics, not decoration.** Design a sanity-like system
   that is *not* a second health bar. Knowledge should be a double-edged
   resource, the player's growing understanding should count as progression,
   and enemies should follow alien rules that the player learns.

## Provocations (optional seeds)

Adopt, transform or reject each of these, and say which you chose and why.
They are prompts to think with, not requirements.

- The renderer's **character set is a resource**: deeper floors corrupt or
  remove glyphs, so reality loses resolution.
- **Light is ammunition**: every shot reveals you and the room.
- An entity that **only exists in your peripheral vision**, drawn in the
  margins of the grid rather than in the 3D scene.
- A weapon that **fires a word**, and its effect depends on what the word
  means.
- Creatures whose **silhouettes are made of language**, legible only if you
  stand still long enough to read them.
- **Reality changes style as you go deeper.** The surface is clean
  terminal ASCII, the middle depths are ornate ANSI art, and the abyss uses
  glyphs no font was designed for. Horror is the medium itself mutating.
- Seeds are shareable **incantations**: readable phrases instead of numbers.
- Your death **leaves something in the world** that future runs can find.
- A presence that **remembers your run history** and reacts to how you play.

## Deliverable: one Markdown document, in this order

0. **One-page pitch.**
   - Title and a logline of 25 words or fewer.
   - The hook in one sentence.
   - Three vivid "screenshot moments."
   - Why this only works in ASCII.
1. **Pillars and anti-pillars**: what the game refuses to be.
2. **World, mythos and tone.**
   - An original cosmology and the player's role in it.
   - How the story is told: fragmentary and environmental.
   - 3–5 sample in-world text fragments.
3. **Core loop at three timescales**: second to second, a single run, and
   meta progression. Include a diagram.
4. **Mechanics.**
   - Movement and shooting.
   - Weapons table, at least 8 rows: name, fire behavior, ASCII visual
     signature, synergies.
   - Enemies table, at least 10 rows: an ASCII silhouette, the rule the player
     must learn, the counter.
   - The horror/sanity system.
   - Items, modifiers and build synergies.
   - At least 3 bosses.
5. **Procedural generation and level design.**
   - At least 5 strata/biomes, each with its own visual and mechanical
     identity.
   - Room grammar and non-Euclidean features.
   - The difficulty curve.
6. **Replayability and retention.**
   - Meta-unlocks.
   - An estimate of how many meaningfully distinct runs exist, with the math.
   - Challenge modes, daily seed and a discovery codex.
   - What the player is chasing at hours 1, 10, 50 and 200.
7. **Visual direction.**
   - Glyph sets, palettes with hex values, and the lighting model.
   - A **style-mixing map**: which text-art styles appear where (depth,
     entity, stratum, sanity state), how they blend at their boundaries, and
     one example of a mix you considered and rejected, with the reason.
   - An effects catalog of at least 10 named effects (hit flash, death
     dissolve, sanity glitch, …), each with an implementation sketch.
   - **ASCII mockups, each at least 80 columns wide**: calm exploration, peak
     combat, a high-horror state, the title screen and the HUD layout. At
     least one mockup should show several styles mixed in one frame.
8. **Audio direction.** Synthesis plan, adaptive music system, and how sound
   carries information.
9. **Technical architecture.**
   - The chosen stack, compared against at least 2 alternatives in a table.
   - A module diagram.
   - The renderer pipeline step by step, with pseudocode for the core per-cell
     loop.
   - Data-oriented memory layout.
   - A frame budget table in ms per subsystem.
   - Determinism for seeds and replays.
   - Save format, input-latency strategy, profiling plan and distribution.
10. **Accessibility and comfort options.**
11. **Risks**: the top 5 design and technical risks. Give each a mitigation and
    the cheapest experiment that would de-risk it.
12. **Roadmap.**
    - Milestone 1 is "the single screenshot that proves the renderer," with
      acceptance criteria.
    - Then the remaining milestones up to a vertical slice, then 1.0 scope.
13. **Inventions**: each technique or mechanic you believe is new, with its
    closest existing precedent and how yours differs.
14. **Self-critique**: see the quality bar below.

*Optional appendix:* if your environment can run code, include a proof of
concept of milestone 1. It should be a single self-contained HTML file with no
dependencies, at most ~500 lines, rendering a navigable first-person room in
your glyph style.

## Quality bar

- **Be specific.** Use numbers, names, formulas, hex codes, tables and
  pseudocode. Replace any sentence like "enemies are scary" with what the
  player sees, hears and has to do.
- **Every mechanic serves a pillar.** Cut anything that doesn't.
- **Commit to one bold, coherent vision** instead of offering a menu of
  options.
- **Don't stop to ask questions.** State each assumption in one line and keep
  going.
- **Critique before finishing.** Review your draft as a skeptical publisher and
  as a skeptical graphics programmer, and fix the three weakest points. Then
  end with a short *Self-critique* section listing what you changed and what
  still worries you.
- **Depth over breadth.** Length is fine; padding is not.
