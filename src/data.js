'use strict';
// Content: strata, floors, weapons, relics, readers, unlocks, lore. Pure data.
(function () {
  const G = window.G;
  const hex = G.hex;
  const D = (G.Data = {});

  // Wall materials.
  const M = (D.MAT = { BRICK: 1, INSCRIBED: 2, SHELVES: 3, FLESH: 4, BONE: 5, CRYSTAL: 6, STONE: 7, VOID: 8, PILLAR: 9, KELP: 10 });

  // Tile flags.
  D.F = { SKY: 1, WATER: 2, SECRET: 4, LORE: 8, SHIFT: 16, SEEN: 32, ROOM: 64, ARENA: 128 };

  // Each stratum is a different way of drawing the world. Style mixing is deliberate:
  // the deeper you go, the stranger the alphabet reality is written in.
  D.STRATA = [
    {
      id: 0, numeral: 'I', name: 'THE ARCHIVE', sub: 'where the world keeps its records',
      ceilH: 1.35, fog: [0, 0, 0], fogD: 0.075, ambient: [0.05, 0.036, 0.022], lamp: [1.0, 0.76, 0.42],
      wallSet: 'ascii', floorSet: 'ascii', ceilSet: 'braille', farSet: 'braille', farDist: 11, skySet: 'braille',
      mats: [M.SHELVES, M.SHELVES, M.BRICK, M.INSCRIBED], floorPat: 'planks', ceilPat: 'beams',
      wall: { [M.BRICK]: hex('#a8743c'), [M.INSCRIBED]: hex('#c9a265'), [M.SHELVES]: hex('#9a6a36'), [M.PILLAR]: hex('#b8894f') },
      floor: hex('#6a4626'), ceil: hex('#2b1d10'), sky: null, skyChance: 0, water: 0,
      accent: hex('#ffb347'), root: 55, ink: false,
      enemies: { wretch: 5, moth: 2.5, watcher: 1.2, tome: 2.2, scrivener: 1, hanged: 1.6 },
      props: ['books', 'candles', 'books'],
    },
    {
      id: 1, numeral: 'II', name: 'THE DROWNED STACKS', sub: 'the ink ran, and the books learned to speak in water',
      ceilH: 1.5, fog: [0.0, 0.03, 0.04], fogD: 0.09, ambient: [0.02, 0.05, 0.06], lamp: [0.75, 0.95, 0.9],
      wallSet: 'blocks', floorSet: 'braille', ceilSet: 'blocks', farSet: 'braille', farDist: 10, skySet: 'braille',
      mats: [M.STONE, M.KELP, M.SHELVES, M.STONE], floorPat: 'stone', ceilPat: 'drip',
      wall: { [M.STONE]: hex('#3f8f8a'), [M.KELP]: hex('#2f7a5c'), [M.SHELVES]: hex('#4c6d73'), [M.INSCRIBED]: hex('#6fb8b0'), [M.PILLAR]: hex('#5aa39b') },
      floor: hex('#1f4b4d'), ceil: hex('#0f2628'), sky: 'sea', skyChance: 0.3, water: 0.7,
      accent: hex('#5ff2e0'), root: 49, ink: false,
      enemies: { wretch: 2.5, drowned: 4.5, moth: 1.5, hollow: 2.2, bloom: 2, broodsac: 1.2, mite: 1, tome: 1 },
      props: ['coral', 'books', 'candles'],
    },
    {
      id: 2, numeral: 'III', name: 'THE OSSUARY OF LETTERS', sub: 'here the letters are bones, and the bones are tired',
      ceilH: 1.0, fog: [0.035, 0.0, 0.0], fogD: 0.1, ambient: [0.05, 0.02, 0.02], lamp: [1.0, 0.86, 0.78],
      wallSet: 'asciiFine', floorSet: 'ascii', ceilSet: 'asciiFine', farSet: 'braille', farDist: 9, skySet: 'braille',
      mats: [M.BONE, M.BONE, M.BRICK, M.INSCRIBED], floorPat: 'tiles', ceilPat: 'plain',
      wall: { [M.BONE]: hex('#d8cfba'), [M.BRICK]: hex('#8f3a32'), [M.INSCRIBED]: hex('#c7b79a'), [M.PILLAR]: hex('#cdbfa4'), [M.FLESH]: hex('#9a3b3b') },
      floor: hex('#4a2a26'), ceil: hex('#1d1010'), sky: null, skyChance: 0, water: 0,
      accent: hex('#ff4a3d'), root: 41.2, ink: false,
      enemies: { wretch: 2.5, hollow: 2.4, watcher: 2, lurker: 1.8, choir: 1.3, hound: 2.4, bellringer: 1.2, hanged: 1.5, broodsac: 1 },
      props: ['bones', 'candles', 'bones'],
    },
    {
      id: 3, numeral: 'IV', name: 'THE CHOIR VAULT', sub: 'a cathedral for the voices of the erased',
      ceilH: 3.2, fog: [0.03, 0.0, 0.06], fogD: 0.05, ambient: [0.04, 0.025, 0.07], lamp: [0.9, 0.8, 1.0],
      wallSet: 'box', floorSet: 'blocks', ceilSet: 'braille', farSet: 'braille', farDist: 14, skySet: 'braille',
      mats: [M.CRYSTAL, M.PILLAR, M.STONE, M.FLESH], floorPat: 'marble', ceilPat: 'vault',
      wall: { [M.CRYSTAL]: hex('#8f6cd8'), [M.PILLAR]: hex('#b9a3e8'), [M.STONE]: hex('#5d4a8a'), [M.FLESH]: hex('#a04a7a'), [M.INSCRIBED]: hex('#c4b0f0') },
      floor: hex('#3a2c5a'), ceil: hex('#120c20'), sky: 'cosmos', skyChance: 0.6, water: 0,
      accent: hex('#d58cff'), root: 61.7, ink: false,
      enemies: { choir: 3, echo: 2.4, lurker: 2, maw: 1.1, watcher: 1.4, cipher: 2, knight: 1.3, wraith: 2, inkhulk: 0.6, bellringer: 0.8 },
      props: ['crystals', 'candles'],
    },
    {
      id: 4, numeral: 'V', name: 'THE LACUNA', sub: 'the hole in the text beneath the world',
      ceilH: 2.2, fog: [0.95, 0.93, 0.89], fogD: 0.06, ambient: [1.02, 1.0, 0.96], lamp: [0.05, 0.05, 0.05],
      wallSet: 'mixed', floorSet: 'braille', ceilSet: 'braille', farSet: 'braille', farDist: 12, skySet: 'braille',
      mats: [M.VOID, M.VOID, M.INSCRIBED, M.PILLAR], floorPat: 'paper', ceilPat: 'plain',
      wall: { [M.VOID]: hex('#efece4'), [M.INSCRIBED]: hex('#ddd6c8'), [M.PILLAR]: hex('#f6f3ec') },
      floor: hex('#e8e3d8'), ceil: hex('#f2efe8'), sky: 'void', skyChance: 1, water: 0,
      accent: hex('#d01c1c'), root: 36.7, ink: true,
      enemies: { echo: 2.4, maw: 1.4, choir: 2, lurker: 2, watcher: 1.4, wretch: 1.5, cipher: 2, knight: 1.5, wraith: 1.5, inkhulk: 1, scrivener: 1.4, hound: 1.5 },
      props: ['crystals'],
    },
  ];

  D.FLOORS = [
    { s: 0, size: 50, rooms: [9, 12], budget: 7 },
    { s: 0, size: 54, rooms: [10, 13], budget: 9 },
    { s: 1, size: 54, rooms: [10, 13], budget: 10 },
    { s: 1, size: 58, rooms: [11, 14], budget: 12 },
    { s: 2, size: 58, rooms: [11, 14], budget: 13 },
    { s: 2, boss: 'redactor' },
    { s: 3, size: 60, rooms: [11, 14], budget: 15 },
    { s: 3, size: 62, rooms: [12, 15], budget: 17 },
    { s: 4, size: 62, rooms: [12, 15], budget: 18 },
    { s: 4, boss: 'unwritten' },
  ];
  D.RELIC_AFTER = new Set([1, 3, 5, 7]);

  D.COST = {
    wretch: 1, moth: 0.6, watcher: 2, hollow: 1.6, drowned: 1.3, choir: 2.2, echo: 2, lurker: 1.8, maw: 4,
    tome: 0.45, scrivener: 2.4, inkhulk: 6, wraith: 2, bloom: 2.5, hound: 1, cipher: 2.6, bellringer: 2.4, broodsac: 2.8, mite: 0.4, knight: 3.5, hanged: 1.4,
  };

  // Weapons. ammo: null (infinite) | 'verse' | 'letters' | 'oil' | 'lucidity'.
  D.WEAPONS = {
    quill: {
      name: 'QUILL', ammo: null, cd: 0.24, auto: true, dmg: 15, spread: 0.01, col: [0.95, 0.85, 0.62], flash: 0.45,
      desc: 'A sidearm that writes in straight lines. Never runs dry.',
      art: [
        '      _/|  ',
        '     / ||  ',
        '    /__||  ',
        '    |##||  ',
        '   _|##||_ ',
        '  / |##|| \\',
        ' /__|__||__\\',
      ],
    },
    psalter: {
      name: 'PSALTER', ammo: 'verse', cost: 1, cd: 0.85, pellets: 8, dmg: 10, spread: 0.12, col: [0.8, 0.55, 0.35], flash: 1, knock: 2.6,
      desc: 'A scattergun bound in leather. Fires a stanza of iron.',
      art: [
        '    ___   ___    ',
        '   |=#=| |=#=|   ',
        '   |###|_|###|   ',
        '  _|#########|_  ',
        ' / | PSALTER | \\ ',
        '/__|_________|__\\',
      ],
    },
    litany: {
      name: 'LITANY', ammo: 'letters', cost: 1, cd: 0.075, auto: true, dmg: 8, speed: 22, col: [0.7, 0.9, 1.0], flash: 0.25,
      phrase: 'IN THE BEGINNING WAS THE WORD AND THE WORD WAS HUNGRY ',
      desc: 'Fires a sentence, one letter at a time.',
      art: [
        '      [||]     ',
        '     _[||]_    ',
        '    |:|  |:|   ',
        '    |:|==|:|   ',
        '    |:|==|:|   ',
        '   /|:|__|:|\\  ',
        '  /_|______|_\\ ',
      ],
    },
    lance: {
      name: 'LANTERN LANCE', ammo: 'oil', perSec: 13, dps: 95, beam: true, col: [1.0, 0.92, 0.6], flash: 0.2,
      desc: 'Burns lantern oil as a beam of light. Light is ammunition.',
      art: [
        '      .-.      ',
        '     ( * )     ',
        '      |=|      ',
        '     /| |\\     ',
        '    | |=| |    ',
        '    |_|=|_|    ',
        '     /___\\     ',
      ],
    },
    word: {
      name: 'THE UNSPOKEN WORD', ammo: 'lucidity', cost: 12, cd: 1.3, dmg: 190, radius: 3.3, speed: 9, col: [0.85, 0.4, 1.0], flash: 0.7,
      desc: 'Speak what should not be said. Costs your lucidity, erases everything nearby.',
      art: [
        '     _ _ _      ',
        '    | | | |_    ',
        '    | | | | |   ',
        '  _ |       |   ',
        ' ( \\|   @   |   ',
        '  \\         /   ',
        '   \\_______/    ',
      ],
    },
    palimpsest: {
      name: 'PALIMPSEST', ammo: 'letters', cost: 18, cd: 0.9, charge: 0.55, dmg: 175, col: [1.0, 0.3, 0.3], flash: 1,
      desc: 'Hold to charge. Writes over the world: pierces walls and everything behind them.',
      art: [
        '       ||      ',
        '      |==|     ',
        '      |==|     ',
        '     /|==|\\    ',
        '    |=|==|=|   ',
        '    |=|==|=|   ',
        '   /__|__|__\\  ',
      ],
    },
  };
  D.WEAPON_ORDER = ['quill', 'psalter', 'litany', 'lance', 'word', 'palimpsest'];
  D.AMMO_MAX = { verse: 36, letters: 240, oil: 100 };
  D.AMMO_NAME = { verse: 'VERSES', letters: 'LETTERS', oil: 'OIL', lucidity: 'LUCIDITY' };

  // Relics ("marginalia"): passive modifiers.
  D.RELICS = {
    inkblood: { name: 'INKBLOOD', desc: 'Kills restore 3 vitae.', sym: 'drop', mod: (m) => (m.killHeal += 3) },
    gilded: { name: 'GILDED MARGINS', desc: '+25 maximum vitae.', sym: 'heart', mod: (m) => (m.hpMax += 25) },
    erratum: { name: 'ERRATUM', desc: '20% of hits ricochet to another foe.', sym: 'star', mod: (m) => (m.ricochet += 0.2) },
    concordance: { name: 'CONCORDANCE', desc: 'Lucidity drains 35% slower.', sym: 'ring', mod: (m) => (m.lucDrain *= 0.65) },
    blackwick: { name: 'BLACK WICK', desc: 'Your lantern burns no oil.', sym: 'flame', mod: (m) => (m.oilDrain = 0) },
    haste: { name: 'VERSE OF HASTE', desc: '+18% movement speed.', sym: 'arrowR', mod: (m) => (m.speed *= 1.18) },
    second: { name: 'SECOND READING', desc: 'Dash recovers twice as fast.', sym: 'spiral', mod: (m) => (m.dashCd *= 0.5) },
    recursive: { name: 'RECURSIVE PSALM', desc: 'The Psalter fires 50% more pellets.', sym: 'sun', mod: (m) => (m.pellets *= 1.5) },
    doubled: { name: 'LITANY OF THE DOUBLED', desc: 'The Litany speaks two letters at once.', sym: 'cross', mod: (m) => (m.litanyDouble = true) },
    madness: { name: 'MADNESS ENGINE', desc: 'The damage bonus from low lucidity is doubled.', sym: 'eye', mod: (m) => (m.gnosis *= 2) },
    eyelids: { name: 'SEWN EYELIDS', desc: 'Immune to the gaze of Watchers. Your view narrows.', sym: 'moon', mod: (m) => { m.gazeImmune = true; m.fov *= 0.86; } },
    ash: { name: 'TONGUE OF ASH', desc: 'The Unspoken Word costs half as much lucidity.', sym: 'skull', mod: (m) => (m.wordCost *= 0.5) },
    pale: { name: 'PALE LANTERN', desc: 'Your lantern reaches 40% further.', sym: 'sun', mod: (m) => (m.lampR *= 1.4) },
    reservoir: { name: 'INK RESERVOIR', desc: '+50% maximum ammunition.', sym: 'drop', mod: (m) => (m.ammoMax *= 1.5) },
    thorned: { name: 'THORNED QUILL', desc: 'Quill damage +70%.', sym: 'tri', mod: (m) => (m.quill *= 1.7) },
    ward: { name: 'WARDING SIGIL', desc: 'Take 15% less damage.', sym: 'diamond', mod: (m) => (m.dmgTaken *= 0.85) },
    hymn: { name: 'HYMNAL SPLINTER', desc: 'Kills restore 2 lucidity.', sym: 'wave', mod: (m) => (m.lucOnKill += 2) },
    index: { name: 'INDEX OF ENDS', desc: 'Kills have a 25% chance to drop ammunition.', sym: 'key', mod: (m) => (m.ammoOnKill += 0.25) },
    // forbidden folio
    folio: { name: 'CURSED FOLIO', desc: '+35% damage. Phantasms walk with you always.', sym: 'skull', forbidden: true, mod: (m) => { m.dmg *= 1.35; m.alwaysHalluc = true; } },
    lampeyes: { name: 'LAMP OF EYES', desc: 'Foes inside your lantern light take +25% damage.', sym: 'eye', forbidden: true, mod: (m) => (m.lampDmg += 0.25) },
    mirror: { name: 'MIRROR SCRIPT', desc: 'Dashing leaves an afterimage that detonates.', sym: 'spiral', forbidden: true, mod: (m) => (m.dashBlast = true) },
    censor: { name: "CENSOR'S BAR", desc: 'Foes below 15% vitae are redacted instantly.', sym: 'hand', forbidden: true, mod: (m) => (m.execute = 0.15) },
    tithe: { name: 'TITHE OF INK', desc: '+40% Ink gathered.', sym: 'drop', forbidden: true, mod: (m) => (m.inkMul *= 1.4) },
    hunger: { name: 'HUNGRY LIGHT', desc: 'The Lance heals you as it burns.', sym: 'flame', forbidden: true, mod: (m) => (m.beamHeal += 0.025) },
    unbound: { name: 'UNBOUND PAGE', desc: 'Dash through foes to wound them.', sym: 'arrowU', forbidden: true, mod: (m) => (m.dashHit = true) },
    gnosis: { name: 'SECOND SIGHT', desc: 'Secret walls reveal themselves below 80 lucidity.', sym: 'eye', forbidden: true, mod: (m) => (m.secretAt = 80) },
  };

  D.BASE_MODS = () => ({
    dmg: 1, hpMax: 0, speed: 1, lucDrain: 1, gnosis: 1, lampR: 1, ammoMax: 1, dashCd: 1, killHeal: 0, ricochet: 0, execute: 0,
    lucOnKill: 1, oilDrain: 1, wordCost: 1, gazeImmune: false, fov: 1, alwaysHalluc: false, ammoOnKill: 0, lampDmg: 0,
    dashBlast: false, pellets: 1, litanyDouble: false, quill: 1, beamHeal: 0, inkMul: 1, dmgTaken: 1, dashHit: false, secretAt: 50,
  });

  D.READERS = {
    archivist: {
      name: 'THE ARCHIVIST', hp: 100, luc: 100, oil: 100, weapons: ['quill', 'psalter'], ammo: { verse: 18, letters: 0 }, cost: 0,
      desc: 'Balanced and patient. Reading lore yields 50% more Ink.', perk: 'lore',
    },
    lamplighter: {
      name: 'THE LAMPLIGHTER', hp: 85, luc: 100, oil: 140, weapons: ['quill', 'lance'], ammo: { verse: 0, letters: 0 }, cost: 150,
      desc: 'Carries more oil and a brighter lamp. Lit braziers mend wounds.', perk: 'lamp',
    },
    heretic: {
      name: 'THE HERETIC', hp: 90, luc: 70, oil: 90, weapons: ['quill', 'word'], ammo: { verse: 0, letters: 40 }, cost: 300,
      desc: 'Already half-mad. Madness hits twice as hard; secret walls show early.', perk: 'heresy',
    },
  };
  D.READER_ORDER = ['archivist', 'lamplighter', 'heretic'];

  D.ANNOTATIONS = {
    vellum: { name: 'VELLUM SKIN', desc: '+10 maximum vitae per tier.', costs: [60, 120, 200] },
    steady: { name: 'STEADY HAND', desc: '+8% damage per tier.', costs: [80, 160, 260] },
    pockets: { name: 'DEEP POCKETS', desc: '+20% ammunition per tier.', costs: [70, 150] },
    wick: { name: 'TRIMMED WICK', desc: 'The lantern burns 25% slower per tier.', costs: [90, 180] },
    margin: { name: 'THIRD MARGIN', desc: 'Choose from one more relic at every altar.', costs: [250] },
    folio: { name: 'FORBIDDEN FOLIO', desc: 'Adds eight forbidden relics to the pool.', costs: [200] },
    palimpsest: { name: 'PALIMPSEST', desc: 'The Palimpsest can now be found in the deep.', costs: [180] },
  };
  D.ANNOTATION_ORDER = ['vellum', 'steady', 'pockets', 'wick', 'margin', 'folio', 'palimpsest'];

  D.HERESIES = {
    brittle: { name: 'BRITTLE LAMP', desc: 'Oil burns twice as fast.', ink: 0.25 },
    crowded: { name: 'THE CROWDED DARK', desc: '40% more foes.', ink: 0.3 },
    thin: { name: 'THIN MIND', desc: 'Begin every run at 60 lucidity.', ink: 0.2 },
    hungry: { name: 'HUNGRY TEXT', desc: 'Foes deal 30% more damage.', ink: 0.3 },
  };
  D.HERESY_ORDER = ['brittle', 'crowded', 'thin', 'hungry'];

  // Codex text for every creature. 'rule' is revealed after three kills.
  D.CODEX = {
    wretch: { name: 'WRETCH', epi: 'an erased person, still walking', rule: 'They hesitate before they strike. Step back as their arms rise.' },
    moth: { name: 'LAMP-MOTH', epi: 'it eats light, and then the lamp', rule: 'They hunt your lantern. Put it out and they forget you.' },
    watcher: { name: 'WATCHER', epi: 'a proofreader searching for the error', rule: 'It cannot move while you see it - but its gaze erodes your mind.' },
    hollow: { name: 'HOLLOW', epi: 'a shape the light passes through', rule: 'Invisible in light. Put out your lantern to see the outline.' },
    drowned: { name: 'DROWNED', epi: 'a reader who read the water', rule: 'Unhurtable beneath the surface. Strike when it rises.' },
    choir: { name: 'CHOIR', epi: 'the voices of the deleted, singing names', rule: 'They inhale before they sing. Dash through the notes.' },
    echo: { name: 'ECHO', epi: 'it is not sure which of you is real', rule: 'Every shot you fire at it, it returns. Kill it with few, heavy blows.' },
    lurker: { name: 'LURKER', epi: 'it lives at the edge of sight', rule: 'Only visible in the corner of your eye. Look at it and it freezes, unseen.' },
    maw: { name: 'MAW', epi: 'an appetite with a body attached', rule: 'It roars before it charges. Sidestep: it stuns itself on walls.' },
    tome: { name: 'TOME SWARM', epi: 'books that learned to bite', rule: 'They flock. Break the flock with a blast; never chase a single page.' },
    scrivener: { name: 'SCRIVENER', epi: 'it writes the traps you walk into', rule: 'It lays glowing mines and blinks away when cornered. Watch the floor.' },
    inkhulk: { name: 'INK GOLEM', epi: 'a library that stood up', rule: 'Its book-plates blunt your damage until they break. Dash through the slam.' },
    wraith: { name: 'CANDLEWICK WRAITH', epi: 'a vigil that never went out', rule: 'It dives through you and leaves fire. Kill it at range: it bursts into flame.' },
    bloom: { name: 'TENDRIL BLOOM', epi: 'something planted in the margins', rule: 'Rooted. It whips anything close and lobs spores that rot the mind.' },
    hound: { name: 'MARGIN HOUND', epi: 'it hunts in the white space', rule: 'Packs circle, then pounce. Dash sideways when one crouches.' },
    cipher: { name: 'CIPHER', epi: 'a question with no answer, rotating', rule: 'Its shield turns. Strike through the gap; dodge the beam once it has aimed.' },
    bellringer: { name: 'BELL-RINGER', epi: 'it tolls for the unread', rule: 'The toll travels outward as a ring. Dash through it. It hastens nearby foes.' },
    broodsac: { name: 'BROODSAC', epi: 'full, and getting fuller', rule: 'Every wound releases mites. Burst it from afar, and mind the gas.' },
    mite: { name: 'MITE', epi: 'a full stop with legs', rule: 'It explodes when it reaches you. Shoot first.' },
    knight: { name: 'MIRROR KNIGHT', epi: 'it returns what you give it', rule: 'Its shield reflects shots from the front. Flank it, blast it, or catch it charging.' },
    hanged: { name: 'THE HANGED', epi: 'a reader who stopped reading', rule: 'It waits above. Look up before you walk under.' },
    phantasm: { name: 'PHANTASM', epi: 'a mistake your mind is making', rule: 'Harmless. Their letters fail at the edges. Do not waste your ink.' },
    redactor: { name: 'THE REDACTOR', epi: 'appointed to keep you from certain words', rule: 'It blacks out the world in bars. The bars move - read the gaps.' },
    unwritten: { name: 'THE UNWRITTEN', epi: 'the shape of where something should be', rule: 'Break the four seals. Then strike the heart before the page empties.' },
  };
  D.CODEX_ORDER = ['wretch', 'moth', 'tome', 'scrivener', 'hanged', 'watcher', 'hollow', 'drowned', 'bloom', 'broodsac', 'mite', 'hound', 'bellringer', 'choir', 'echo', 'lurker', 'maw', 'cipher', 'knight', 'wraith', 'inkhulk', 'phantasm', 'redactor', 'unwritten'];

  D.LORE = [
    'The Archive was not built. It was remembered into place, one shelf at a time, by people who were afraid of forgetting.',
    'Every surface is a sentence. Walls are only the words we agreed not to read.',
    'Brother Ocre read the lowest shelf aloud. By morning his name was missing from every record, including his own mouth.',
    'Do not trust the dark. Trust it less when it is quiet.',
    'The Watchers were proofreaders once. They are still looking for the error. They have decided it is you.',
    'Light is borrowed text. Every lamp you burn is a paragraph you will not get back.',
    'In the Drowned Stacks the ink ran. The books still speak, but only in the voice of water.',
    'We found a door that was a wall that was a door. It depended on how much we understood.',
    'The Choir sings the names of the erased. If you hear your own, do not answer.',
    'Beneath the Ossuary the letters are bones, and the bones are letters, and both are tired.',
    'The Redactor was appointed to keep us safe from certain words. It has been very thorough.',
    'There is a hole in the text beneath the world. We call it the Lacuna because we were not permitted to call it anything else.',
    'It is not a god. A god is something. This is the shape of where something should be.',
    'Readers go down. The Order counts the lamps that come back. The number has a single digit, and it is not a large one.',
    'The Echo is not mocking you. It simply does not know which of you is real. Lately, neither do we.',
    'Do not look directly. That is not a warning. It is instructions.',
    'When the margins begin to whisper, they are telling you where the true walls are.',
    'Madness is only a reading the world did not authorize.',
    'The deeper you go, the fewer letters there are. Near the bottom there is only one, and it is very patient.',
    'Every Reader who falls becomes a footnote. Read them. They wrote for you.',
    'The sky beneath the world is full of stars. Some of them are eyes. Most of the eyes are closed. Pray they stay closed.',
    'The Unwritten does not hate. Hate requires a sentence.',
    'We were wrong. It was never trying to get in. It is trying to finish reading.',
    'If you are reading this, you are already part of the text. Turn the page carefully.',
  ];

  D.WALL_TEXT = [
    'REMEMBER', 'DO NOT READ', 'ERRATUM', 'LOOK AWAY', 'IT SEES', 'FORGET THE NAMES', 'INDEX OF ENDS', 'BELOW',
    'TURN BACK READER', 'THE LAMP IS A LIE', 'OCRE WAS HERE', 'WHO WROTE THIS', 'NOT A GOD', 'UNWRITTEN', 'HUSH',
    'COUNT THE LAMPS', 'THE WALLS LISTEN', 'MARGINALIA', 'IN THE BEGINNING', 'SEE ALSO: NOTHING', 'ABSENCE', 'KEEP READING',
  ];

  D.SEED_WORDS = [
    ['ASHEN', 'HOLLOW', 'DROWNED', 'SILENT', 'GILDED', 'BLIND', 'PALE', 'HUNGRY', 'BROKEN', 'ENDLESS', 'SUNKEN', 'BLACK',
      'WEEPING', 'FORGOTTEN', 'CROWNED', 'LAST', 'NAMELESS', 'BOUND', 'VEILED', 'BURNING', 'FIRST', 'THIN', 'WOUNDED', 'QUIET'],
    ['CHOIR', 'LAMP', 'INDEX', 'MARGIN', 'VERSE', 'SPINE', 'FOLIO', 'WELL', 'EYE', 'PSALM', 'STAIR', 'CANDLE',
      'TONGUE', 'LETTER', 'ARCHIVE', 'MOTH', 'BELL', 'PAGE', 'NAME', 'SHELF', 'THRONE', 'SEAL', 'WICK', 'VAULT'],
    ['UNDERTOW', 'ASCENDS', 'SLEEPS', 'UNSPOKEN', 'REMAINS', 'BELOW', 'UNREAD', 'FALLS', 'WAITS', 'BURNS', 'TURNS', 'ENDS',
      'LISTENS', 'OPENS', 'DREAMS', 'ERASED', 'RETURNS', 'WEEPS', 'WATCHES', 'SINGS', 'ROTS', 'BLEEDS', 'KNEELS', 'FORGETS'],
  ];

  D.ENDING = [
    'THE HEART OF THE UNWRITTEN COMES APART INTO EMPTY SPACE.',
    '',
    'For one moment the page beneath the world is blank, and you can read it:',
    'there is nothing written there, and nothing waiting, and nothing at all.',
    '',
    'Then, very slowly, the first letter of a new sentence begins to form.',
    'It is your name.',
    '',
    'You were never descending, Reader. You were being read.',
  ];
  D.TRUE_ENDING = [
    '',
    'Because you have read every fragment, you understand what comes next:',
    'whoever finishes reading this sentence becomes the next Unwritten.',
    'You close the book before the last word. The Lacuna stays open, and hungry, and quiet.',
    'This is the only victory the text allows.',
  ];

  D.TIPS = [
    'Hold TAB to unfold the map of everything you have seen.',
    'Your lantern burns oil. Press F to put it out - the dark has uses.',
    'Low lucidity makes you stronger, and shows you walls that are lies.',
    'Press V to watch yourself from behind. Some rooms will show you anyway.',
    'Dash with SPACE. For a moment, nothing can touch you.',
    'Light braziers with E. Standing near the flame restores your mind.',
    'Every fragment you read is kept forever in the Codex.',
    'Look for doorways that show somewhere else. Walk through them.',
  ];
})();
