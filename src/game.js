'use strict';
// The game: state machine, runs and floors, combat resolution, effects, the director,
// menus, saving. Everything else is called from here.
(function () {
  const G = window.G;
  const D = G.Data, In = G.Input, A = G.Audio, R = G.R, UI = G.UI, E = G.Ent, GL = G.Glyphs;
  const SAVE_KEY = 'asciiooter.save.v1';
  const DEFAULT_OPTS = { sens: 1, fov: 90, glyph: 14, master: 0.8, music: 0.7, sfx: 0.9, calm: false, distort: 1, crt: true, invertY: false, third: false, fps: false, threads: true, res: 'auto', sharp: 1.5 };
  const lt = [0, 0, 0];

  function defaultSave() {
    return {
      v: 1, ink: 0, totalInk: 0, readers: { archivist: true }, annot: {}, heresiesOn: {},
      codex: { seen: {}, kills: {}, lore: [] }, relicsSeen: {},
      stats: { runs: 0, deaths: 0, wins: 0, best: 0, kills: 0, trueEnd: false }, epitaphs: [], readerCount: 0, daily: {}, opts: {},
    };
  }

  const Game = (G.Game = {
    state: 'title', time: 0, frame: 0, nextId: 1,
    ents: [], parts: [], voids: [], omens: [], bars: [], whispers: [], msgs: [], lights: [], dynLights: [], lines: [], rings: [], waves: [], hazards: [], shocks: [],
    fx: { shake: 0, flash: 0, flashCol: [1, 1, 1], hitstop: 0, corrupt: 0, wallWarp: 0, collapse: 0, collapseTarget: 0, fovKick: 0, hitMarker: 0, invert: 0, aberr: 0 },
    st: { sel: 0 }, vm: { x: 0, y: 0, rot: 0, sway: 0, show: false, charge: 0 }, thirdPerson: false, cam: { x: 0, y: 0, a: 0, pitch: 0, z: 0.5 }, aimA: 0,
    gaze: 0, choir: 0, lanceLoop: false, prompt: null, titleT: 0, fpsShow: 0, msShow: 0,
  });

  // ------------------------------------------------------------------ setup
  Game.init = function (dsp) {
    this.dsp = dsp;
    UI.bind(dsp);
    const s = G.store.load(SAVE_KEY, null);
    this.save = Object.assign(defaultSave(), s || {});
    this.save.codex = Object.assign(defaultSave().codex, this.save.codex || {});
    this.save.stats = Object.assign(defaultSave().stats, this.save.stats || {});
    this.opts = Object.assign({}, DEFAULT_OPTS, this.save.opts || {});
    this.thirdPerson = this.opts.third;
    this.applyOpts();
    if (this.opts.threads) G.MT.start();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (G.debug && G.params.has('floor')) {
      this.startRun(G.params.get('reader') || 'archivist', G.params.get('seed') || null, false);
      const f = parseInt(G.params.get('floor'), 10) || 0;
      if (f) this.loadFloor(Math.min(D.FLOORS.length - 1, f));
      if (G.params.has('third')) this.thirdPerson = true;
      if (G.params.has('luc')) this.player.luc = parseFloat(G.params.get('luc'));
    }
  };
  // Cells per frame the CPU is trusted with: more with render threads, unlimited at FULL.
  Game.cellBudget = function () {
    if (this.opts.res === 'full') return Infinity;
    const t = G.MT.threads;
    return t ? Math.round(13000 * Math.min(2.6, 1 + 0.55 * t)) : 13000;
  };
  Game.resize = function () {
    const g = this.dsp.setup(this.opts.glyph, this.cellBudget(), this.opts.sharp);
    R.alloc(g.cols, g.rows);
  };
  Game.applyOpts = function () {
    A.vol.master = this.opts.master;
    A.vol.music = this.opts.music;
    A.vol.sfx = this.opts.sfx;
    A.applyVolumes();
  };
  Game.persist = function () {
    this.save.opts = this.opts;
    G.store.save(SAVE_KEY, this.save);
  };

  // ------------------------------------------------------------------ services used by entities
  Game.sound = function (name, x, y, opt) {
    A.play(name, x === undefined ? opt : Object.assign({ x, y }, opt || {}));
  };
  Game.msg = function (text, col, dur) {
    if (this.msgs.length && this.msgs[this.msgs.length - 1].text === text) {
      this.msgs[this.msgs.length - 1].t = dur || 2.5;
      return;
    }
    this.msgs.push({ text, col: col || [1, 1, 1], t: dur || 2.5 });
    if (this.msgs.length > 4) this.msgs.shift();
  };
  Game.distP = function (e) {
    return Math.hypot(e.x - this.player.x, e.y - this.player.y);
  };
  Game.losP = function (e) {
    if (e.losT > this.time) return e.losV;
    e.losT = this.time + 0.12 + Math.random() * 0.05;
    e.losV = this.level.los(e.x, e.y, this.player.x, this.player.y);
    return e.losV;
  };
  Game.lightAt = function (x, y) {
    this.level.light(x, y, lt);
    return (lt[0] + lt[1] + lt[2]) / 3;
  };
  Game.nearLitBrazier = function (x, y, r) {
    for (const e of this.ents) if (e.alive && e.type === 'brazier' && e.lit && Math.hypot(e.x - x, e.y - y) < r) return e;
    return null;
  };
  Game.codexSee = function (type) {
    const k = E.codexKey(type);
    if (!this.save.codex.seen[k]) {
      this.save.codex.seen[k] = true;
      if (D.CODEX[k] && k !== 'phantasm') this.msg(`NEW CODEX ENTRY: ${D.CODEX[k].name}`, [0.7, 0.6, 1], 2.2);
    }
  };
  Game.loseLucidity = function (v, kind) {
    const P = this.player;
    const k = kind === 'word' || kind === 'read' ? 1 : P.mods.lucDrain;
    P.luc = Math.max(0, P.luc - v * k);
  };
  Game.shake = function (a) {
    this.fx.shake = Math.min(14, Math.max(this.fx.shake, a));
  };
  Game.flash = function (col, a) {
    this.fx.flashCol = col;
    this.fx.flash = Math.max(this.fx.flash, a);
  };
  Game.addLight = function (x, y, c, rad, i, life) {
    this.lights.push({ x, y, r: c[0], g: c[1], b: c[2], rad, i, life, max: life });
  };
  Game.knock = function (kx, ky) {
    this.player.kx += kx;
    this.player.ky += ky;
  };
  Game.noise = function (x, y, r) {
    for (const e of this.ents) {
      if (!e.alive || e.kind !== 'enemy' || e.state !== 'idle') continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < r * 0.5 || (d < r && this.level.los(e.x, e.y, x, y))) e.alerted = true;
    }
  };
  const FIRE = [[1, 1, 0.92], [1, 0.88, 0.45], [1, 0.55, 0.15], [0.75, 0.18, 0.04], [0.2, 0.04, 0.02]];
  Game.FIRE = FIRE;
  Game.part = function (o) {
    if (this.parts.length > 3200) return null;
    const p = {
      x: o.x, y: o.y, z: o.z || 0, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, grav: o.grav || 0, drag: o.drag || 0, life: o.life || 0.5,
      g: o.g === undefined ? GL.id('sym:dot') : o.g, r: o.r === undefined ? 1 : o.r, gr: o.gr === undefined ? 1 : o.gr, b: o.b === undefined ? 1 : o.b,
      glow: o.glow || 0, noDepth: o.noDepth, fade: o.fade, add: o.add, ramp: o.ramp, lit: o.lit, streak: o.streak, size: o.size || 0, grow: o.grow || 0,
      splat: o.splat, buoy: o.buoy || 0, drip: o.drip, col: o.col, rest: o.rest || 0.3, fric: o.fric || 0.6, rad: o.rad || 0.03,
      av: o.av || 0, ang: o.ang || G.rand.range(0, 7), tumble: o.tumble, litMin: o.litMin || 0, solid: o.solid, flutter: o.flutter || 0, sleep: false,
    };
    p.max = p.life;
    this.parts.push(p);
    return p;
  };
  // Sparks: short-lived streaks with a hot colour ramp.
  Game.sparks = function (x, y, z, n, speed, dirX, dirY, col) {
    for (let i = 0; i < n; i++) {
      const a = G.rand.range(0, G.TAU), s = G.rand.range(0.4, 1) * speed;
      this.part({
        x, y, z, vx: Math.cos(a) * s + (dirX || 0) * speed * 0.6, vy: Math.sin(a) * s + (dirY || 0) * speed * 0.6, vz: G.rand.range(0.5, 3),
        grav: 9, drag: 1.5, life: G.rand.range(0.15, 0.45), streak: 0.035, add: true, glow: 0.9, ramp: col ? null : FIRE,
        r: col ? col[0] : 1, gr: col ? col[1] : 1, b: col ? col[2] : 1,
      });
    }
  };
  Game.smoke = function (x, y, z, n, size, col, rise) {
    for (let i = 0; i < n; i++)
      this.part({
        x: x + G.rand.range(-0.15, 0.15), y: y + G.rand.range(-0.15, 0.15), z, vx: G.rand.range(-0.3, 0.3), vy: G.rand.range(-0.3, 0.3), vz: rise || 0.6,
        drag: 1.2, life: G.rand.range(0.6, 1.4), size: size * G.rand.range(0.7, 1.3), grow: size * 1.5, g: -1, lit: true,
        r: col ? col[0] : 0.5, gr: col ? col[1] : 0.48, b: col ? col[2] : 0.45,
      });
  };
  // Ink: droplets that fall and leave stains where they land.
  Game.splatter = function (x, y, z, n, col, speed, dirX, dirY, em) {
    for (let i = 0; i < n; i++) {
      const a = G.rand.range(0, G.TAU), s = G.rand.range(0.3, 1) * speed;
      this.part({
        x, y, z, vx: Math.cos(a) * s + (dirX || 0) * speed * 0.8, vy: Math.sin(a) * s + (dirY || 0) * speed * 0.8, vz: G.rand.range(0.5, 2.5),
        grav: 9, life: 1.5, g: GL.ch(G.rand.pick(['.', ',', "'", '`'])), r: col[0] * 1.4 + 0.1, gr: col[1] * 1.4 + 0.05, b: col[2] * 1.4 + 0.05,
        splat: { c: col, em: em || 0 }, glow: em ? 0.5 : 0, fade: false,
      });
    }
  };
  Game.footstep = function (water) {
    const P = this.player;
    if (water) this.ring(P.x, P.y, 0.02, 0.05, 0.6, 0.7, [0.4, 0.85, 0.9], { water: true });
    else if (!this.level.st.ink) this.smoke(P.x, P.y, 0.05, 1, 0.12, [0.45, 0.4, 0.35], 0.15);
  };
  Game.decal = function (x, y, z, r, col, a, em, wall) {
    if (!this.level) return;
    this.level.addDecal({ x, y, z: z || 0, r, c: col, a: a === undefined ? 0.85 : a, em: em || 0, wall: !!wall, s: G.rand.range(0, 100) });
  };
  Game.line = function (x0, y0, z0, x1, y1, z1, c, life, o) {
    if (this.lines.length > 60) this.lines.shift();
    this.lines.push(Object.assign({ x0, y0, z0, x1, y1, z1, c, life, max: life }, o || {}));
  };
  Game.ring = function (x, y, z, r0, r1, life, c, o) {
    if (this.rings.length > 40) this.rings.shift();
    this.rings.push(Object.assign({ x, y, z, r0, r1, life, max: life, c, i: 1 }, o || {}));
  };
  Game.wave = function (x, y, str) {
    this.waves.push({ x, y, t: 0, max: 0.7, str: str || 1 });
    if (this.waves.length > 4) this.waves.shift();
  };
  Game.burst = function (x, y, z, n, col, glyphs, speed) {
    for (let i = 0; i < n; i++) {
      let g;
      if (glyphs === 'sigil') g = GL.id((G.rand.chance(0.5) ? 'sa:' : 'sb:') + G.rand.int(0, 95));
      else if (glyphs === 'letters') g = GL.ch(String.fromCharCode(65 + G.rand.int(0, 25)));
      else g = GL.ch(glyphs.charAt(G.rand.int(0, glyphs.length - 1)));
      const a = G.rand.range(0, G.TAU), s = G.rand.range(0.3, 1) * (speed || 2);
      const j = G.rand.range(0.7, 1.2);
      this.part({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: G.rand.range(0.5, 2.5), grav: 6, life: G.rand.range(0.35, 0.9), g, r: col[0] * j, gr: col[1] * j, b: col[2] * j, glow: 0.3 });
    }
  };
  Game.spawn = function (type, x, y, o) {
    const def = E.defs[type];
    if (!def) return null;
    const sc = def.kind !== 'enemy' ? 1 : def.boss ? 1 + ((this.hpScale || 1) - 1) * 0.5 : this.hpScale || 1;
    const e = {
      id: this.nextId++, type, def, kind: def.kind, x, y, z: def.z || 0, vx: 0, vy: 0, kx: 0, ky: 0,
      r: def.r || 0.3, h: def.h || 1, w: def.w || 1, hp: (def.hp || 1) * sc, maxHp: (def.hp || 1) * sc, alive: true,
      state: 'idle', st: 0, cd: G.rand.range(0.4, 1.4), flash: 0, walk: G.rand.range(0, 6), col: def.col, emit: def.emit, data: {}, seen: false,
    };
    if (o) Object.assign(e, o);
    e.face = e.face === undefined ? G.rand.range(0, G.TAU) : e.face;
    e.hitT = 0;
    if (o && o.summon) e.spawnT = 1;
    if (def.init) def.init(e, this);
    this.ents.push(e);
    return e;
  };
  Game.proj = function (o) {
    const big = !!o.big;
    this.ents.push({
      id: this.nextId++, type: 'orb', def: E.defs.orb, kind: 'proj', x: o.x, y: o.y, z: o.z || 0.5, vx: o.vx, vy: o.vy, dmg: o.dmg, team: o.team,
      life: o.life || 3, homing: o.homing || 0, col: o.col, emit: o.col, r: o.r || 0.15, h: big ? 0.7 : 0.36, w: big ? 0.7 : 0.36, glyph: o.glyph,
      blast: o.blast, alive: true, hidden: !!o.glyph, data: {}, flash: 0, vz: o.vz || 0, grav: o.grav || 0, land: o.land, src: o.src,
      model: o.model, fire: o.fire,
    });
    if (o.model) {
      const p = this.ents[this.ents.length - 1];
      p.def = E.defs[o.model];
      p.h = p.def.h;
      p.w = p.def.w;
      p.z = o.z;
    }
  };
  Game.omen = function (x, y, t, dmg) {
    this.omens.push({ x, y, t, max: t, dmg });
  };
  Game.redact = function (n) {
    for (let i = 0; i < n; i++) this.bars.push({ y: G.rand.range(0.06, 0.72), h: G.rand.int(2, Math.max(3, Math.floor(this.dsp.rows * 0.09))), vy: G.rand.range(-0.05, 0.05), t: 4.6 });
    this.sound('redact');
    this.flash([0, 0, 0], 0.3);
  };
  Game.bossAlive = function () {
    return this.ents.some((e) => e.alive && e.def.boss && !e.def.sub);
  };
  Game.playerShot = function (dmg) {
    for (const e of this.ents) if (e.alive && e.def.onShot) e.def.onShot(e, this, dmg);
  };
  Game.dissolve = function (e) {
    if (!e.alive) return;
    e.alive = false;
    e.dying = true;
    e.dieT = 0;
    this.burst(e.x, e.y, e.h * 0.5, 14, [0.6, 0.6, 0.7], 'sigil', 1.5);
    this.sound('flutter', e.x, e.y);
  };
  Game.dashStrike = function (P) {
    for (const e of this.ents) {
      if (!e.alive || e.kind !== 'enemy' || e.dashHit === P.dashCd) continue;
      if (Math.hypot(e.x - P.x, e.y - P.y) < e.r + 0.5) {
        e.dashHit = P.dashCd;
        this.damageEnemy(e, 30 * P.damageMul(), { x: e.x, y: e.y, knock: 3, dirX: P.vx / 13, dirY: P.vy / 13 });
      }
    }
  };

  // Trace a ray through the map (optionally through portals). Returns segments in portal space.
  Game.trace = function (x, y, dx, dy, maxT, stopWalls, portals) {
    const L = this.level;
    const segs = [];
    let mx = Math.floor(x), my = Math.floor(y);
    const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    let sdx = (dx > 0 ? mx + 1 - x : x - mx) * ddx, sdy = (dy > 0 ? my + 1 - y : y - my) * ddy;
    let t0 = 0, ox = 0, oy = 0;
    const walls = [];
    for (let i = 0; i < 256; i++) {
      let t, dir;
      if (sdx < sdy) {
        t = sdx;
        sdx += ddx;
        dir = sx > 0 ? 0 : 1;
      } else {
        t = sdy;
        sdy += ddy;
        dir = sy > 0 ? 2 : 3;
      }
      if (t > maxT) break;
      let nx = mx + (dir < 2 ? sx : 0), ny = my + (dir >= 2 ? sy : 0);
      const p = portals ? L.portal(mx, my, dir) : null;
      if (p) {
        segs.push({ t0, t1: t, ox, oy });
        t0 = t;
        ox += p.ox;
        oy += p.oy;
        nx += p.ox;
        ny += p.oy;
      }
      mx = nx;
      my = ny;
      if (L.wall(mx, my)) {
        if (stopWalls) {
          segs.push({ t0, t1: t, ox, oy });
          return { segs, t, hit: true, tx: mx, ty: my };
        }
        if (!walls.length || walls[walls.length - 1][0] !== mx || walls[walls.length - 1][1] !== my) walls.push([mx, my, t]);
      }
    }
    segs.push({ t0, t1: maxT, ox, oy });
    return { segs, t: maxT, hit: false, walls };
  };

  // Where shots visibly leave from: the weapon's muzzle in first person, the Reader's hand in third.
  Game.muzzle = function (a) {
    const c = this.cam, P = this.player;
    if (!this.thirdPerson) {
      const dx = Math.cos(c.a), dy = Math.sin(c.a);
      return { x: c.x + dx * 0.55 - dy * 0.17, y: c.y + dy * 0.55 + dx * 0.17, z: c.z - 0.13 };
    }
    return { x: P.x + Math.cos(a) * 0.35 - Math.sin(P.a) * 0.2, y: P.y + Math.sin(a) * 0.35 + Math.cos(P.a) * 0.2, z: 0.62 };
  };

  Game.hitscan = function (x, y, a, range, dmg, o) {
    o = o || {};
    const dx = Math.cos(a), dy = Math.sin(a);
    const tr = this.trace(x, y, dx, dy, range, !o.walls, true);
    const hits = [];
    for (const e of this.ents) {
      if (!e.alive || (e.kind !== 'enemy' && !e.def.shootable)) continue;
      for (const s of tr.segs) {
        const rx = e.x - s.ox - x, ry = e.y - s.oy - y;
        const t = rx * dx + ry * dy;
        if (t < s.t0 - 0.3 || t > s.t1 + 0.3 || t < 0) continue;
        const perp = Math.abs(rx * dy - ry * dx);
        if (perp < e.r + 0.1) {
          hits.push({ e, t });
          break;
        }
      }
    }
    hits.sort((p, q) => p.t - q.t);
    const use = o.pierce ? hits : hits.slice(0, 1);
    let total = 0;
    for (const h of use) {
      const ho = { x: x + dx * h.t, y: y + dy * h.t, dirX: dx, dirY: dy, knock: o.knock, tick: o.tick, src: 'player' };
      if (h.e.kind === 'enemy') total += this.damageEnemy(h.e, dmg, ho);
      else this.damageProp(h.e, dmg, ho);
    }
    // the world takes damage too
    if (tr.hit && (o.pierce || !use.length)) G.Phys.damageWall(this, tr.tx, tr.ty, dmg * (o.tick ? 0.7 : o.wallMul || 0.45), x + dx * tr.t, y + dy * tr.t, 0.5, dx, dy);
    if (o.rail && tr.walls) for (const w of tr.walls) G.Phys.damageWall(this, w[0], w[1], dmg * 0.9, x + dx * w[2], y + dy * w[2], 0.5, dx, dy);
    const endT = !o.pierce && use.length ? use[0].t : tr.t;
    // visuals live in the unwrapped space the camera sees
    const mz = this.muzzle(a);
    const hz = mz.z + (0.48 - mz.z) * Math.min(1, endT / 3);
    const ex = x + dx * endT, ey = y + dy * endT;
    if (o.tracer) this.line(mz.x, mz.y, mz.z, ex, ey, hz, o.tracer, 0.09, { taper: true, head: true });
    if (o.beam) {
      const jx = Math.sin(this.time * 40) * 0.02;
      this.line(mz.x, mz.y, mz.z, ex + jx, ey - jx, hz, [1, 0.92, 0.6], 0.045, { w: 2, flicker: true });
      this.line(mz.x, mz.y, mz.z, ex, ey, hz, [0.6, 0.35, 0.1], 0.045, { w: 1, glyph: GL.ch('=') });
      for (let k = 1; k <= 3; k++) {
        const t = (endT * k) / 3.5;
        this.dynLights.push({ x: x + dx * t, y: y + dy * t, r: 1, g: 0.85, b: 0.5, rad: 4, i: 0.9 });
      }
      if (Math.random() < 0.5) this.sparks(ex - dx * 0.1, ey - dy * 0.1, hz, 2, 2.5, -dx, -dy);
    }
    if (o.rail) {
      this.line(mz.x, mz.y, mz.z, x + dx * range, y + dy * range, 0.5, [1, 0.25, 0.2], 0.55, { sigil: true, noDepth: true });
      this.line(mz.x, mz.y, mz.z, x + dx * range, y + dy * range, 0.5, [1, 0.8, 0.7], 0.2, { w: 2 });
      for (const h of use) this.ring(h.e.x, h.e.y, 0.5, 0.1, 1.2, 0.35, [1, 0.3, 0.2]);
    }
    if (!use.length && tr.hit && !o.beam) {
      const hx = x + dx * (tr.t - 0.04), hy = y + dy * (tr.t - 0.04);
      this.sparks(hx, hy, hz, 4, 2.4, -dx, -dy);
      this.smoke(hx, hy, hz, 1, 0.12, null, 0.4);
      this.decal(hx + dx * 0.05, hy + dy * 0.05, hz, G.rand.range(0.05, 0.09), this.level.st.ink ? [0.05, 0.05, 0.05] : [0.04, 0.03, 0.025], 0.9, 0, true);
    }
    return total;
  };

  Game.damageEnemy = function (e, dmg, o) {
    if (!e.alive) return 0;
    o = o || {};
    let d = dmg;
    if (e.def.hurt) d = e.def.hurt(e, this, d, o);
    if (!e.alive || d <= 0) return 0;
    const P = this.player;
    if (P.mods.lampDmg && P.lanternOn && this.distP(e) < P.lampRadius()) d *= 1 + P.mods.lampDmg;
    e.hp -= d;
    e.flash = o.tick ? Math.max(e.flash, 0.03) : 0.09;
    if (!o.tick || e.hitT <= 0) {
      e.hitT = 0.22;
      const c = this.cam;
      const side = (o.dirX || 0) * -Math.sin(c.a) + (o.dirY || 0) * Math.cos(c.a);
      e.lean = G.clamp(side, -1, 1) * (e.def.heavy ? 0.3 : 1);
    }
    e.alerted = true;
    if (e.state === 'idle') e.state = 'chase';
    if (o.knock) {
      const m = e.def.mass || (e.def.heavy ? 6 : 1);
      e.kx += ((o.dirX || 0) * o.knock * 1.3) / m;
      e.ky += ((o.dirY || 0) * o.knock * 1.3) / m;
    }
    e.lastHit = o;
    if (!o.tick || Math.random() < 0.15) {
      const n = o.tick ? 1 : Math.min(7, 2 + Math.floor(d / 8));
      const blood = e.def.blood || [0.4, 0.05, 0.05];
      const hz = (e.z || 0) + e.h * G.rand.range(0.35, 0.75);
      const bx = e.x - (o.dirX || 0) * e.r * 0.5, by = e.y - (o.dirY || 0) * e.r * 0.5;
      this.splatter(bx, by, hz, n, blood, 2.2, o.dirX, o.dirY, e.def.bloodEmit);
      if (!o.tick) this.sparks(bx, by, hz, 2 + (n >> 1), 3, -(o.dirX || 0), -(o.dirY || 0), e.def.bloodEmit ? blood : null);
      if (this.frame - (this.lastHitSnd || 0) > 2) {
        this.sound('hit', e.x, e.y);
        this.lastHitSnd = this.frame;
      }
    }
    this.fx.hitMarker = 0.1;
    if (!o.ric && !o.tick && P.mods.ricochet && Math.random() < P.mods.ricochet) {
      let best = null, bd = 7;
      for (const f of this.ents) {
        if (f === e || !f.alive || f.kind !== 'enemy') continue;
        const dd = Math.hypot(f.x - e.x, f.y - e.y);
        if (dd < bd && this.level.los(e.x, e.y, f.x, f.y)) {
          bd = dd;
          best = f;
        }
      }
      if (best) {
        for (let t = 0; t < bd; t += 0.4) this.part({ x: e.x + ((best.x - e.x) * t) / bd, y: e.y + ((best.y - e.y) * t) / bd, z: 0.6, g: GL.id('sym:dot'), r: 1, gr: 0.9, b: 0.4, life: 0.12, glow: 1 });
        this.damageEnemy(best, d * 0.5, { ric: true });
      }
    }
    if (e.alive && P.mods.execute && !e.def.boss && e.hp > 0 && e.hp < e.maxHp * P.mods.execute) {
      this.burst(e.x, e.y, e.h * 0.6, 10, [0.05, 0.05, 0.05], 'letters', 2);
      e.hp = 0;
    }
    if (e.hp <= 0) this.killEnemy(e, o, -e.hp);
    return d;
  };

  Game.killEnemy = function (e, o, overkill) {
    if (!e.alive) return;
    e.alive = false;
    const P = this.player, def = e.def;
    if (def.phantom) return this.dissolve(e);
    o = o || e.lastHit || {};
    const blood = def.blood || [0.35, 0.05, 0.05];
    this.decal(e.x, e.y, 0, Math.min(1.2, 0.3 + e.r * 0.9), blood, 0.9, def.bloodEmit || 0);
    this.splatter(e.x, e.y, (e.z || 0) + e.h * 0.5, 10, blood, 3, o.dirX, o.dirY, def.bloodEmit);
    // the creature's own body comes apart into physical fragments of its alphabet
    const force = 2.5 + Math.min(6, (overkill || 0) / 12) + (o.blast ? 4 : 0) + (def.heavy ? 1.5 : 0);
    G.Phys.shatter(this, e, force, o.dirX || 0, o.dirY || 0, def.boss ? 520 : def.heavy ? 320 : 200);
    if (def.boss) {
      e.dying = true;
      e.dieT = 0;
    }
    this.smoke(e.x, e.y, (e.z || 0) + e.h * 0.4, 4, 0.35, [blood[0] * 0.8 + 0.1, blood[1] * 0.8 + 0.05, blood[2] * 0.8 + 0.05], 0.4);
    this.sparks(e.x, e.y, (e.z || 0) + e.h * 0.5, def.heavy ? 18 : 8, 3.5);
    if (def.heavy) {
      this.ring(e.x, e.y, 0.03, 0.2, 2.4, 0.5, [1, 0.5, 0.3]);
      this.wave(e.x, e.y, 0.6);
    }
    let ink = def.ink || 0;
    while (ink > 0) {
      const v = Math.min(ink, 4);
      ink -= v;
      this.spawn('ink', e.x + G.rand.range(-0.4, 0.4), e.y + G.rand.range(-0.4, 0.4), { val: v, z: 0 });
    }
    if (P.mods.ammoOnKill && Math.random() < P.mods.ammoOnKill) this.spawn(G.rand.pick(['verse', 'letters', 'oil']), e.x, e.y);
    P.luc = Math.min(100, P.luc + P.mods.lucOnKill);
    if (P.mods.killHeal) P.hp = Math.min(P.maxHp, P.hp + P.mods.killHeal);
    const k = E.codexKey(e.type);
    if (!def.sub) {
      this.save.codex.kills[k] = (this.save.codex.kills[k] || 0) + 1;
      if (this.save.codex.kills[k] === 3 && D.CODEX[k] && !def.boss) this.msg(`YOU UNDERSTAND THE ${D.CODEX[k].name}`, [0.7, 0.6, 1], 3);
    }
    this.save.stats.kills++;
    this.run.kills++;
    this.sound('kill', e.x, e.y);
    this.fx.hitstop = Math.max(this.fx.hitstop, def.heavy ? 0.08 : 0.025);
    if (def.heavy) this.shake(5);
    if (def.onDeath) def.onDeath(e, this);
    if (def.boss && !def.sub) this.bossKilled(e);
  };

  // Explosions: damage creatures, things and walls in the radius, shove everything, and leave scars.
  // o.fire: a fire blast (orange, leaves burning ground); o.player: also hurts the Reader; o.small: no screen-wide effects.
  Game.explode = function (x, y, rad, dmg, o) {
    o = o || {};
    const P = this.player, L = this.level;
    for (const e of this.ents) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > rad + e.r) continue;
      const k = 1 - (0.6 * Math.min(d, rad)) / rad;
      const ho = { knock: 6, dirX: (e.x - x) / (d || 1), dirY: (e.y - y) / (d || 1), blast: true };
      if (e.kind === 'enemy' && (o.team !== 'enemy' || o.all)) this.damageEnemy(e, dmg * k, ho);
      else if (e.def.shootable) this.damageProp(e, dmg * k, ho);
    }
    if (o.player || o.team === 'enemy') {
      const d = Math.hypot(P.x - x, P.y - y);
      if (d < rad) this.hurtPlayer((o.pdmg || dmg * 0.35) * (1 - (0.5 * d) / rad), x, y, o.src || null);
    }
    // walls within reach crack or collapse
    const r0 = Math.ceil(rad);
    for (let ty = Math.floor(y) - r0; ty <= Math.floor(y) + r0; ty++)
      for (let tx = Math.floor(x) - r0; tx <= Math.floor(x) + r0; tx++) {
        if (!L.inb(tx, ty) || !L.tiles[ty * L.w + tx]) continue;
        const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
        if (d < rad + 0.6) G.Phys.damageWall(this, tx, ty, dmg * (o.wallMul || 1.3) * (1 - d / (rad + 0.8)), tx + 0.5, ty + 0.5, 0.6, (tx + 0.5 - x) / (d || 1), (ty + 0.5 - y) / (d || 1));
      }
    G.Phys.impulse(this, x, y, 0.4, rad * 1.8, o.force || 9);
    const fire = !!o.fire;
    const c1 = o.col || (fire ? [1, 0.55, 0.15] : [0.9, 0.55, 1]);
    if (!fire && !o.small) this.voids.push({ x, y, r: rad, life: 0.45, max: 0.45 });
    this.ring(x, y, 0.05, 0.3, rad * 1.6, 0.6, c1);
    this.ring(x, y, 0.6, 0.2, rad * 1.1, 0.45, [1, 0.9, 0.8], { glyph: GL.id('sym:star') });
    if (fire) {
      for (let i = 0; i < 46; i++) {
        const a = G.rand.range(0, G.TAU), s = G.rand.range(1, 6);
        this.part({ x, y, z: 0.4, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: G.rand.range(0.5, 4), drag: 2.2, buoy: 4, life: G.rand.range(0.4, 1.1), size: G.rand.range(0.15, 0.4), grow: 0.4, g: GL.ch('*'), ramp: FIRE, add: true, glow: 1 });
      }
      this.hazards.push({ x, y, r: rad * 0.55, t: 3.5, type: 'fire', dmg: 12, burnsAll: true });
      this.decal(x, y, 0, rad * 0.7, [0.03, 0.02, 0.015], 0.85, 0);
    } else this.decal(x, y, 0, rad * 0.55, [0.02, 0.01, 0.03], 0.8, 0);
    this.sparks(x, y, 0.5, 34, 8, 0, 0, fire ? null : [0.9, 0.6, 1]);
    this.smoke(x, y, 0.3, fire ? 12 : 8, 0.6, fire ? [0.25, 0.2, 0.18] : [0.35, 0.25, 0.45], 0.9);
    for (let i = 0; i < 18; i++) {
      const a = G.rand.range(0, G.TAU), s = G.rand.range(2, 7);
      this.part({ x, y, z: 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: G.rand.range(1, 5), grav: 11, col: true, rest: 0.35, fric: 0.6, life: G.rand.range(1.5, 3), g: GL.ch(G.rand.pick(['#', '%', '*', '='])), r: 0.3, gr: 0.25, b: 0.22, lit: true, tumble: true, av: G.rand.range(-15, 15) });
    }
    this.wave(x, y, o.small ? 0.5 : 1.2);
    this.shake(o.small ? 4 : 9);
    if (!o.small) this.flash(fire ? [1, 0.8, 0.5] : [0.9, 0.85, 1], 0.22);
    if (!fire && !o.small) this.fx.invert = 0.6;
    this.sound('boom', x, y);
    this.addLight(x, y, fire ? [1, 0.6, 0.25] : [0.8, 0.5, 1], rad * 3, 2, 0.35);
    if (!fire) this.burst(x, y, 0.5, 20, [0.85, 0.5, 1], 'sigil', 5);
  };

  // Shootable things: props shatter, casks explode.
  Game.damageProp = function (e, dmg, o) {
    if (!e.alive) return;
    o = o || {};
    e.hp -= dmg;
    e.flash = 0.06;
    const m = e.def.mass || 1;
    e.kx += ((o.dirX || 0) * (2 + dmg * 0.08)) / m;
    e.ky += ((o.dirY || 0) * (2 + dmg * 0.08)) / m;
    if (o.blast) e.vz = Math.max(e.vz || 0, 3 / m);
    e.sleep = false;
    if (e.def.onHurt) e.def.onHurt(e, this, dmg, o);
    if (e.hp <= 0 && e.alive && !e.def.fuse) this.breakProp(e, o);
  };
  Game.breakProp = function (e, o) {
    e.alive = false;
    o = o || {};
    G.Phys.shatter(this, e, 3 + (o.blast ? 4 : 0), o.dirX || 0, o.dirY || 0, 140);
    this.smoke(e.x, e.y, e.h * 0.5, 3, 0.25, null, 0.3);
    this.sound('crumble', e.x, e.y, { vol: 0.5 });
    if (e.def.onBreak) e.def.onBreak(e, this, o);
  };

  Game.hurtPlayer = function (dmg, sx, sy, src) {
    const P = this.player;
    if (!P.alive || this.state !== 'play' || P.inv > 0 || (G.debug && G.params.has('god'))) return;
    const d = dmg * this.dmgScale * P.mods.dmgTaken;
    P.hp -= d;
    P.inv = 0.1;
    P.hurtT = 1;
    P.hurtDir = Math.atan2(sy - P.y, sx - P.x);
    this.flash([0.6, 0, 0], Math.min(0.45, 0.12 + d / 60));
    this.shake(2 + d / 6);
    this.sound('hurt');
    if (P.hp <= 0) {
      const k = src ? E.codexKey(src.type) : null;
      this.killPlayer(k && D.CODEX[k] ? D.CODEX[k].name : 'THE DARK');
    }
  };

  Game.gainInk = function (v) {
    const P = this.player;
    let mul = P ? P.mods.inkMul : 1;
    for (const h in this.save.heresiesOn) if (this.save.heresiesOn[h]) mul *= 1 + D.HERESIES[h].ink;
    const n = Math.max(1, Math.round(v * mul));
    this.save.ink += n;
    this.save.totalInk += n;
    if (this.run) this.run.ink += n;
  };

  // ------------------------------------------------------------------ runs and floors
  Game.randomSeed = function () {
    const W = D.SEED_WORDS;
    return [W[0], W[1], W[2]].map((l) => l[Math.floor(Math.random() * l.length)]).join(' ');
  };
  Game.startRun = function (readerId, seed, daily) {
    const S = this.save;
    this.run = { reader: readerId, seed: seed || this.randomSeed(), daily: !!daily, floor: 0, ink: 0, kills: 0, time: 0, n: ++S.readerCount, lore: 0 };
    S.stats.runs++;
    const her = {};
    for (const h in S.heresiesOn) if (S.heresiesOn[h]) her[h] = true;
    this.heresy = her;
    this.player = new G.Player(readerId, S, her);
    this.loadFloor(0);
    this.persist();
  };
  Game.loadFloor = function (fi) {
    const S = this.save, run = this.run, P = this.player;
    run.floor = fi;
    S.stats.best = Math.max(S.stats.best, fi);
    const FL = D.FLOORS[fi];
    // a weapon you don't own yet may be waiting somewhere on the floor
    let weapon = null;
    if (!FL.boss && G.rand.chance(0.7)) {
      const pool = D.WEAPON_ORDER.filter((w) => !P.weapons.includes(w) && (w !== 'palimpsest' || (S.annot.palimpsest || 0) > 0));
      if (pool.length) weapon = G.rand.pick(pool);
    }
    const L = (this.level = G.Level.generate(fi, run.seed, { enemyMul: this.heresy.crowded ? 1.4 : 1, weapon }));
    this.hpScale = 1 + 0.1 * fi;
    this.dmgScale = (1 + 0.07 * fi) * (this.heresy.hungry ? 1.3 : 1);
    this.ents = [];
    this.parts = [];
    this.voids = [];
    this.omens = [];
    this.bars = [];
    this.whispers = [];
    this.lights = [];
    this.lines = [];
    this.rings = [];
    this.waves = [];
    this.hazards = [];
    this.shocks = [];
    G.Phys.initWalls(L);
    this.bossRef = null;
    this.fx.collapse = 0;
    this.fx.collapseTarget = 0;
    for (const s of L.spawns) {
      const o = {};
      if (s.lit !== undefined) o.lit = s.lit;
      if (s.val !== undefined) o.val = s.val;
      if (s.kind) o.kind2 = s.kind;
      if (s.weapon) {
        o.weapon = s.weapon;
        o.col = D.WEAPONS[s.weapon].col;
        o.emit = D.WEAPONS[s.weapon].col;
      }
      this.spawn(s.type, s.x, s.y, o);
    }
    // a fallen Reader's remnant
    const ep = S.epitaphs.find((x) => x.floor === fi && !x.claimed);
    if (ep && !FL.boss) {
      const rooms = L.rooms.filter((r) => r.type !== 'start' && r.type !== 'vault');
      if (rooms.length) {
        const r = rooms[ep.n % rooms.length];
        const p = L.randomFloorIn(r, new G.RNG(ep.n), 1);
        this.spawn('remnant', p.x, p.y, { ep, val: ep.ink });
      }
    }
    P.x = L.start.x;
    P.y = L.start.y;
    P.a = L.start.a;
    P.vx = P.vy = 0;
    P.pitch = 0;
    this.avatar = this.spawn('avatar', P.x, P.y, { isPlayer: true, player: P });
    this.flowTile = -1;
    this.flowT = 0;
    this.titleT = 5;
    this.arriveT = 1;
    this.directorT = 12;
    this.whisperT = 3;
    A.setStratum(L.st.root);
    this.state = 'play';
    this.persist();
  };
  Game.descend = function () {
    if (this.bossAlive() || this.state !== 'play') return;
    this.state = 'descend';
    this.descT = 0;
    this.sound('descend');
    A.stopLoops();
  };
  Game.afterDescend = function () {
    const cur = this.run.floor;
    const next = cur + 1;
    if (next >= D.FLOORS.length) return this.victory();
    if (D.RELIC_AFTER.has(cur)) this.offerRelics(null, () => this.loadFloor(next));
    else this.loadFloor(next);
  };
  Game.bossKilled = function (e) {
    if (e.type === 'redactor') {
      const A2 = this.level.arena;
      this.spawn('exitwell', A2.cx, A2.cy);
      this.level.lights.push({ x: A2.cx, y: A2.cy, rad: 8, i: 1.2, c: [0.6, 0.35, 1] });
      this.level.bake();
      this.msg('THE REDACTOR IS STRUCK FROM THE RECORD', [1, 0.4, 0.4], 4);
      this.msg('A WELL OPENS IN THE FLOOR', [0.8, 0.6, 1], 4);
      this.bars = [];
      this.flash([1, 1, 1], 0.5);
      this.fx.hitstop = 0.4;
      for (const x of this.ents) if (x.alive && x.kind === 'enemy') this.killEnemy(x);
    } else if (e.type === 'heart') {
      this.fx.hitstop = 0.6;
      for (const x of this.ents) if (x.alive && x.kind === 'enemy') this.killEnemy(x);
      this.victory();
    }
  };
  Game.victory = function () {
    const S = this.save;
    S.stats.wins++;
    S.stats.best = D.FLOORS.length;
    if (S.codex.lore.length >= D.LORE.length) S.stats.trueEnd = true;
    if (this.run.daily) S.daily[this.run.seed] = Math.max(S.daily[this.run.seed] || 0, 99);
    this.gainInk(150);
    this.state = 'victory';
    this.vicT = 0;
    A.stopLoops();
    In.unlock();
    this.persist();
  };
  Game.killPlayer = function (cause) {
    const P = this.player, S = this.save, run = this.run;
    if (!P.alive) return;
    P.alive = false;
    P.hp = 0;
    S.stats.deaths++;
    const st = this.level.st;
    const text = `HERE THE TEXT OF READER ${run.n} ENDS. TAKEN BY ${cause} IN ${st.name}. THEY CARRIED ${P.relics.length} RELICS, AND READ ${run.lore} FRAGMENTS ON THE WAY DOWN.`;
    this.epitaph = { floor: run.floor, text, ink: Math.floor(run.ink * 0.5) + 5, n: run.n, cause };
    S.epitaphs.push(this.epitaph);
    if (S.epitaphs.length > 12) S.epitaphs.shift();
    if (run.daily) S.daily[run.seed] = Math.max(S.daily[run.seed] || 0, run.floor + 1);
    this.deathCause = cause;
    this.state = 'dead';
    this.deadT = 0;
    this.sound('death');
    A.stopLoops();
    In.unlock();
    this.persist();
  };
  Game.offerRelics = function (n, after) {
    const S = this.save, P = this.player;
    const pool = Object.keys(D.RELICS).filter((id) => !P.relics.includes(id) && (!D.RELICS[id].forbidden || (S.annot.folio || 0) > 0));
    G.rand.shuffle(pool);
    const count = n || 3 + (S.annot.margin || 0);
    const choices = pool.slice(0, count);
    if (!choices.length) {
      this.gainInk(30);
      this.msg('THE MARGINS ARE EMPTY. +30 INK', [0.6, 0.55, 1]);
      if (after) after();
      return;
    }
    this.relicSt = { sel: 0, choices, after, prev: this.state };
    this.state = 'relic';
    this.sound('relic');
  };
  Game.readLore = function (e) {
    const S = this.save;
    const unread = [];
    for (let i = 0; i < D.LORE.length; i++) if (!S.codex.lore.includes(i)) unread.push(i);
    const idx = unread.length ? G.rand.pick(unread) : G.rand.int(0, D.LORE.length - 1);
    if (!S.codex.lore.includes(idx)) S.codex.lore.push(idx);
    e.read = true;
    this.run.lore++;
    this.loseLucidity(8, 'read');
    const ink = Math.round(12 * (this.player.reader === 'archivist' ? 1.5 : 1));
    this.gainInk(ink);
    this.page = { title: `FRAGMENT ${idx + 1} OF ${D.LORE.length}`, lines: [D.LORE[idx], '', `(-8 LUCIDITY, +${ink} INK)`], t: 0, accent: [1, 0.85, 0.55] };
    this.state = 'read';
    this.sound('read');
    this.persist();
  };
  Game.readEpitaph = function (e) {
    const ep = e.ep;
    const lines = [ep.text];
    if (!e.claimed) {
      e.claimed = true;
      ep.claimed = true;
      this.gainInk(e.val || 5);
      lines.push('', `THEY LEFT YOU ${e.val || 5} INK.`);
    }
    this.page = { title: `THE REMNANT OF READER ${ep.n}`, lines, t: 0, accent: [0.6, 0.7, 1] };
    this.state = 'read';
    this.sound('read');
    this.persist();
  };

  // ------------------------------------------------------------------ the frame
  Game.step = function (dt) {
    if (G.MT.changed) {
      G.MT.changed = false;
      this.resize();
    }
    In.pollPad();
    this.time += dt;
    this.frame++;
    const t0 = performance.now();
    const s = this.state;
    if (s === 'play') this.updatePlay(dt);
    else if (s === 'descend') {
      this.descT += dt;
      this.updateWorldLite(dt);
      if (this.descT > 1.6) this.afterDescend();
    }
    if (s === 'play' || s === 'descend' || s === 'pause' || s === 'relic' || s === 'read' || s === 'dead' || s === 'victory') this.renderPlay(dt);
    else this.dsp.clear();
    this.renderState(dt);
    this.updateFx(dt);
    const ms = performance.now() - t0;
    this.msAcc = (this.msAcc || 0) + ms;
    this.fpsAcc = (this.fpsAcc || 0) + 1;
    this.fpsClock = (this.fpsClock || 0) + dt;
    if (this.fpsClock > 0.5) {
      this.fpsShow = Math.round(this.fpsAcc / this.fpsClock);
      this.msShow = (this.msAcc / this.fpsAcc).toFixed(1);
      this.fpsAcc = this.msAcc = this.fpsClock = 0;
    }
    this.dsp.present(this.time);
    In.endFrame();
  };

  Game.updateFx = function (dt) {
    const f = this.fx, d = this.dsp.fx, o = this.opts;
    const playing = this.player && (this.state === 'play' || this.state === 'pause' || this.state === 'relic' || this.state === 'read' || this.state === 'descend');
    const luc = playing ? this.player.luc / 100 : 1;
    const halluc = playing && this.player.mods.alwaysHalluc ? 0.15 : 0;
    const dist = o.distort;
    f.corrupt = (luc < 0.6 ? Math.pow((0.6 - luc) / 0.6, 1.5) * 0.32 : 0) * dist + halluc * 0.3;
    f.wallWarp = (luc < 0.45 ? (0.45 - luc) / 0.45 : 0) * dist;
    f.collapse += (f.collapseTarget - f.collapse) * Math.min(1, dt * 1.5);
    d.shakeX = (Math.random() * 2 - 1) * f.shake;
    d.shakeY = (Math.random() * 2 - 1) * f.shake;
    f.shake = Math.max(0, f.shake - dt * 30);
    d.flash = (o.calm ? 0.25 : 1) * f.flash;
    d.flashCol = f.flashCol;
    f.flash = Math.max(0, f.flash - dt * 2.6);
    d.invert = o.calm ? 0 : f.invert * 0.5;
    f.invert = Math.max(0, f.invert - dt * 4);
    d.aberr = ((1 - luc) * (1 - luc) * 0.014 + halluc * 0.004) * dist + (playing && this.player.hurtT > 0.7 ? 0.004 : 0);
    d.warp = luc < 0.3 ? ((0.3 - luc) / 0.3) * dist : 0;
    d.scan = o.crt ? 0.55 : 0;
    d.curve = o.crt ? 0.035 : 0;
    d.noise = o.crt ? 0.022 : 0.006;
    const lowHp = playing && this.player.hp / this.player.maxHp < 0.3;
    d.vig = 0.5 + (lowHp ? 0.35 + 0.15 * Math.sin(this.time * 6) : 0);
    d.glow = 1;
    const wv = d.waves;
    wv.fill(0);
    if (playing && this.state !== 'descend') {
      for (let i = 0; i < this.waves.length && i < 4; i++) {
        const w = this.waves[i];
        R.project(w.x, w.y, 0.5, this._wp || (this._wp = {}));
        if (this._wp.d <= 0.2) continue;
        const k = w.t / w.max;
        wv[i * 4] = this._wp.cx / this.dsp.cols;
        wv[i * 4 + 1] = this._wp.cy / this.dsp.rows;
        wv[i * 4 + 2] = k * 0.5;
        wv[i * 4 + 3] = (1 - k) * w.str * (o.calm ? 0.3 : 1);
      }
    }
    const hpK = playing ? this.player.hp / this.player.maxHp : 1;
    const hurt = playing ? Math.max(0, this.player.hurtT) : 0;
    d.sat = 1 - (hpK < 0.35 ? (0.35 - hpK) * 1.6 : 0) - (1 - luc) * 0.25;
    d.tint = [1 + hurt * 0.15, 1 - hurt * 0.12, 1 - hurt * 0.12 + (1 - luc) * 0.06];
    d.speed = playing && this.player.dashT > 0 && !o.calm ? 0.8 : Math.max(0, d.speed - dt * 6);
    f.fovKick = Math.max(0, f.fovKick - dt * 40);
    f.hitMarker -= dt;
  };

  Game.computeCamera = function () {
    const P = this.player, L = this.level;
    const sp = Math.min(1, Math.hypot(P.vx, P.vy) / 4);
    const bob = Math.sin(P.walk * 2) * 0.03 * sp;
    if (!this.thirdPerson) {
      this.cam = { x: P.x, y: P.y, a: P.a, pitch: P.pitch, z: 0.5 + bob };
      this.aimA = P.a;
      return;
    }
    const ca = Math.cos(P.a), sa = Math.sin(P.a);
    const back = 2.4, side = 0.55;
    const tx = P.x - ca * back - sa * side, ty = P.y - sa * back + ca * side;
    let cx = P.x, cy = P.y;
    const free = (x, y) => !L.wall(Math.floor(x - 0.18), Math.floor(y - 0.18)) && !L.wall(Math.floor(x + 0.18), Math.floor(y - 0.18)) && !L.wall(Math.floor(x - 0.18), Math.floor(y + 0.18)) && !L.wall(Math.floor(x + 0.18), Math.floor(y + 0.18));
    for (let i = 1; i <= 24; i++) {
      const k = i / 24;
      const x = P.x + (tx - P.x) * k, y = P.y + (ty - P.y) * k;
      if (!free(x, y)) break;
      cx = x;
      cy = y;
    }
    const z = Math.min(L.st.ceilH - 0.12, 0.95);
    this.cam = { x: cx, y: cy, a: P.a, pitch: P.pitch - 0.1, z: z + bob };
    // aim from the Reader toward whatever the crosshair rests on
    const tr = this.trace(cx, cy, ca, sa, 40, true, false);
    let T = tr.t;
    for (const e of this.ents) {
      if (!e.alive || e.kind !== 'enemy') continue;
      const rx = e.x - cx, ry = e.y - cy, t = rx * ca + ry * sa;
      if (t > 0.5 && t < T && Math.abs(rx * sa - ry * ca) < e.r) T = t;
    }
    const ax = cx + ca * T, ay = cy + sa * T;
    this.aimA = Math.hypot(ax - P.x, ay - P.y) > 1 ? Math.atan2(ay - P.y, ax - P.x) : P.a;
  };

  // The weapon in your hands: bob, sway, recoil, switching and dash tilt.
  Game.updateViewmodel = function (dt) {
    const v = this.vm, P = this.player;
    v.show = !this.thirdPerson && (this.state === 'play' || this.state === 'descend') && P.alive;
    const sp = Math.min(1, Math.hypot(P.vx, P.vy) / 4.4);
    const turn = In.mdx * this.opts.sens * 0.0006 + In.turnAxis() * 0.02;
    v.sway += (G.clamp(turn, -0.06, 0.06) - v.sway) * Math.min(1, dt * 10);
    const bx = Math.sin(P.walk) * 0.018 * sp, by = Math.abs(Math.cos(P.walk)) * 0.025 * sp;
    const idle = Math.sin(this.time * 1.6) * 0.006;
    const rec = P.recoil;
    const sw = Math.max(0, P.switchT) * 2.4;
    const dash = P.dashT > 0 ? 1 : 0;
    const w = P.weapon();
    const shake = w.charge && P.charge > w.charge * 0.9 ? Math.sin(this.time * 70) * 0.003 : P.beaming ? Math.sin(this.time * 55) * 0.004 : 0;
    v.x = bx - v.sway * 0.5 + rec * 0.01 + shake;
    v.y = by + idle + rec * 0.06 + sw * 0.5 + dash * 0.05;
    v.rot = -0.12 + v.sway * 1.2 - rec * 0.16 + dash * 0.12 + bx * 1.5;
    v.charge = w.charge ? P.charge / w.charge : 0;
  };

  // A reduced world update for transitions (particles keep falling, nothing attacks).
  Game.updateWorldLite = function (dt) {
    this.updateParticles(dt);
  };
  Game.updateParticles = function (dt) {
    G.Phys.update(this, dt);
  };

  Game.updatePlay = function (dt) {
    const P = this.player, L = this.level;
    if (In.pause() || (this.wasLocked && !In.locked && !G.debug)) {
      this.wasLocked = false;
      this.state = 'pause';
      this.st = { sel: 0 };
      A.stopLoops();
      In.unlock();
      return;
    }
    if (In.locked) this.wasLocked = true;
    if (In.mpressed[0] && !In.locked) In.lock();
    if (In.camera()) {
      this.thirdPerson = !this.thirdPerson;
      this.msg(this.thirdPerson ? 'THIRD PERSON' : 'FIRST PERSON', [0.7, 0.7, 0.7], 1.2);
    }
    this.run.time += dt;
    this.titleT -= dt;
    this.arriveT -= dt;
    for (const m of this.msgs) m.t -= dt;
    this.msgs = this.msgs.filter((m) => m.t > 0);
    if (this.fx.hitstop > 0) {
      this.fx.hitstop -= dt;
      this.computeCamera();
      return;
    }
    this.computeCamera();
    this.gaze = 0;
    this.choir = 0;
    P.update(this, dt);
    if (this.state !== 'play') return;
    const av = this.avatar;
    av.x = P.x;
    av.y = P.y;
    av.walk = P.walk;
    // flow field toward the player
    const ptile = Math.floor(P.y) * L.w + Math.floor(P.x);
    this.flowT -= dt;
    if (ptile !== this.flowTile || this.flowT <= 0) {
      L.computeFlow(P.x, P.y);
      this.flowTile = ptile;
      this.flowT = 0.5;
    }
    this.updateShifts(dt);
    // entities
    const ents = this.ents;
    this.prompt = null;
    let bestPrompt = 1.8;
    let threat = 0;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dying) {
        e.dieT += dt / (e.def.heavy ? 1.2 : 0.75);
        if (Math.random() < dt * 25) {
          const c = e.def.blood || [1, 0.5, 0.2];
          this.part({ x: e.x + G.rand.range(-0.3, 0.3) * e.w, y: e.y, z: (e.z || 0) + G.rand.range(0, 1) * e.h, vz: 0.8, buoy: 0.5, drag: 1, life: 0.6, g: GL.ch('*'), r: c[0] * 2 + 0.5, gr: c[1] * 2 + 0.3, b: c[2] * 2 + 0.1, add: true, glow: 0.8 });
        }
        if (e.dieT >= 1) e.dying = false;
      }
      if (!e.alive) continue;
      e.flash -= dt;
      e.hitT -= dt;
      if (e.spawnT > 0) e.spawnT = Math.max(0, e.spawnT - dt * 2);
      if (e.kind === 'proj') {
        this.updateProj(e, dt);
        continue;
      }
      if (e.def.update) e.def.update(e, this, dt);
      if (!e.alive) continue;
      if (e.def.fx) e.def.fx(e, this, dt);
      if (e.kind === 'enemy') {
        e.kx *= Math.max(0, 1 - dt * 7);
        e.ky *= Math.max(0, 1 - dt * 7);
        if (e.buffT > 0) {
          e.buffT -= dt;
          e.vx *= 1.4;
          e.vy *= 1.4;
          if (Math.random() < dt * 10) this.part({ x: e.x + G.rand.range(-0.2, 0.2), y: e.y + G.rand.range(-0.2, 0.2), z: (e.z || 0) + e.h * Math.random(), vz: 0.8, life: 0.5, g: GL.ch('*'), r: 1, gr: 0.85, b: 0.4, add: true, glow: 0.8 });
        }
        e.blocked = L.move(e, (e.vx + e.kx) * dt, (e.vy + e.ky) * dt, e.r, false);
        if (!e.def.ownZ && !e.ownZ && (e.vz || e.z > (e.def.z || 0) + 0.001)) {
          // thrown into the air by blasts and leaps
          e.vz = (e.vz || 0) - 14 * dt;
          e.z += e.vz * dt;
          if (e.z <= (e.def.z || 0)) {
            e.z = e.def.z || 0;
            if (e.vz < -3) {
              this.smoke(e.x, e.y, 0.05, 2, 0.2, null, 0.15);
              this.sound('thud', e.x, e.y, { vol: 0.5 });
              if (e.def.onLand) e.def.onLand(e, this);
            }
            e.vz = 0;
          }
        }
        const spd = Math.hypot(e.vx, e.vy);
        const want = spd > 0.25 ? Math.atan2(e.vy, e.vx) : e.state !== 'idle' ? Math.atan2(P.y - e.y, P.x - e.x) : e.face;
        e.face += G.angleDiff(e.face, want) * Math.min(1, dt * 7);
        if (spd > 0.25) e.walk = (e.walk || 0) + dt * Math.min(spd, 6) * 2.6;
        if (e.state !== 'idle' && this.distP(e) < 14) threat += e.def.boss ? 4 : e.def.heavy ? 2 : 1;
      }
      const d = Math.hypot(e.x - P.x, e.y - P.y);
      if (e.kind === 'pickup') {
        e.z = (e.z0 === undefined ? (e.z0 = e.z || 0) : e.z0) + 0.12 + Math.sin(this.time * 2.5 + e.id) * 0.06;
        if (d < 0.75 && e.def.touch(e, this)) {
          e.alive = false;
          this.sound('pickup');
          this.burst(e.x, e.y, 0.3, 6, e.emit || [1, 1, 1], '*', 1.5);
        }
      }
      if (e.kind === 'thing' && e.def.solid && d < e.r + 0.24 && d > 0.001) {
        const k = (e.r + 0.24 - d) / d;
        P.x += (P.x - e.x) * k;
        P.y += (P.y - e.y) * k;
      }
      if (e.def.interact && d < bestPrompt) {
        const rel = Math.abs(G.angleDiff(P.a, Math.atan2(e.y - P.y, e.x - P.x)));
        const text = e.def.prompt ? e.def.prompt(e, this) : null;
        if (text && (rel < 0.9 || d < 0.9)) {
          bestPrompt = d;
          this.prompt = { e, text };
        }
      }
      if (e.type === 'exitwell' && d < 0.55 && !this.bossAlive()) this.descend();
    }
    if (this.prompt && In.interact()) this.prompt.e.def.interact(this.prompt.e, this);
    // separation
    for (let i = 0; i < ents.length; i++) {
      const a = ents[i];
      if (!a.alive || a.kind !== 'enemy') continue;
      const dp = Math.hypot(a.x - P.x, a.y - P.y);
      if (dp < a.r + 0.25 && dp > 0.001) {
        const k = (a.r + 0.25 - dp) / dp;
        L.move(a, (a.x - P.x) * k, (a.y - P.y) * k, a.r, false);
      }
      for (let j = i + 1; j < ents.length; j++) {
        const b = ents[j];
        if (!b.alive || b.kind !== 'enemy') continue;
        const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy), m = a.r + b.r;
        if (dd < m && dd > 0.001) {
          const k = ((m - dd) / dd) * 0.5;
          L.move(a, -dx * k, -dy * k, a.r, false);
          L.move(b, dx * k, dy * k, b.r, false);
        }
      }
    }
    if (ents.length > 300 || this.frame % 120 === 0) this.ents = ents.filter((e) => e.alive || e.dying);
    this.updateParticles(dt);
    // effects lifetimes
    for (const v of this.voids) v.life -= dt;
    this.voids = this.voids.filter((v) => v.life > 0);
    for (const b of this.bars) {
      b.t -= dt;
      b.y += b.vy * dt;
    }
    this.bars = this.bars.filter((b) => b.t > 0);
    for (const o of this.omens) {
      o.t -= dt;
      if (Math.random() < dt * 30) {
        const a = Math.random() * G.TAU;
        this.part({ x: o.x + Math.cos(a) * 1.2, y: o.y + Math.sin(a) * 1.2, z: 0.03, g: GL.id('sym:dot'), r: 1, gr: 0.15, b: 0.1, life: 0.25, glow: 0.8 });
      }
      if (o.t <= 0) {
        if (Math.hypot(P.x - o.x, P.y - o.y) < 1.3) this.hurtPlayer(o.dmg, o.x, o.y, null);
        this.burst(o.x, o.y, 0.1, 12, [1, 0.2, 0.15], 'sigil', 3);
        this.sound('thud', o.x, o.y);
        this.addLight(o.x, o.y, [1, 0.2, 0.1], 4, 1.5, 0.2);
      }
    }
    this.omens = this.omens.filter((o) => o.t > 0);
    for (const l of this.lights) l.life -= dt;
    this.lights = this.lights.filter((l) => l.life > 0);
    this.updateEffects(dt);
    G.Phys.bodies(this, dt);
    G.Phys.hazards(this, dt);
    this.ambient(dt);
    this.director(dt);
    // audio state
    A.setListener(P.x, P.y, P.a);
    A.loop('lance', this.lanceLoop ? 0.18 : 0, 0);
    A.loop('gaze', this.gaze * 0.08, 0);
    A.loop('choir', this.choir * 0.08, 0);
    A.update(dt, { menu: false, luc: P.luc / 100, threat: Math.min(1, threat / 5), danger: Math.max(P.hp / P.maxHp < 0.35 ? 1 - P.hp / P.maxHp : 0, P.luc < 25 ? (25 - P.luc) / 25 : 0), awe: (R.skyFraction || 0) * 2 });
  };

  Game.updateProj = function (e, dt) {
    const L = this.level, P = this.player;
    e.life -= dt;
    if (e.life <= 0) return this.projEnd(e, false);
    if (e.homing) {
      const want = Math.atan2(P.y - e.y, P.x - e.x), cur = Math.atan2(e.vy, e.vx), sp = Math.hypot(e.vx, e.vy);
      const na = cur + G.clamp(G.angleDiff(cur, want), -e.homing * dt, e.homing * dt);
      e.vx = Math.cos(na) * sp;
      e.vy = Math.sin(na) * sp;
    }
    if (e.grav) {
      e.vz -= e.grav * dt;
      e.z += e.vz * dt;
      e.spin = (e.spin || 0) + dt * 8;
      if (e.z <= 0.05) {
        e.z = 0.05;
        return this.projEnd(e, true);
      }
    }
    const sp = Math.hypot(e.vx, e.vy) || 1;
    const steps = Math.max(1, Math.ceil((sp * dt) / 0.15));
    for (let s = 0; s < steps; s++) {
      let nx = e.x + (e.vx * dt) / steps, ny = e.y + (e.vy * dt) / steps;
      const cx = Math.floor(e.x), cy = Math.floor(e.y);
      if (Math.floor(nx) !== cx) {
        const p = L.portal(cx, cy, nx > e.x ? 0 : 1);
        if (p) {
          nx += p.ox;
          ny += p.oy;
        } else if (L.solid(Math.floor(nx), cy)) return this.projEnd(e, true);
      }
      if (Math.floor(ny) !== Math.floor(e.y) && Math.floor(nx) === Math.floor(e.x)) {
        const p = L.portal(Math.floor(e.x), cy, ny > e.y ? 2 : 3);
        if (p) {
          nx += p.ox;
          ny += p.oy;
        }
      }
      if (L.solid(Math.floor(nx), Math.floor(ny))) return this.projEnd(e, true);
      e.x = nx;
      e.y = ny;
      if (e.team === 'player') {
        for (const t of this.ents) {
          if (!t.alive || t.kind !== 'enemy') continue;
          const dd = (t.x - e.x) ** 2 + (t.y - e.y) ** 2, rr = t.r + e.r;
          if (dd < rr * rr) {
            if (!e.blast) this.damageEnemy(t, e.dmg, { x: e.x, y: e.y, dirX: e.vx / sp, dirY: e.vy / sp, knock: 0.4 });
            return this.projEnd(e, true);
          }
        }
      } else if ((!e.grav || e.z < 1.1) && Math.hypot(P.x - e.x, P.y - e.y) < 0.28 + e.r) {
        this.hurtPlayer(e.dmg, e.x - e.vx, e.y - e.vy, null);
        return this.projEnd(e, true);
      }
    }
    if (e.glyph) {
      this.part({ x: e.x, y: e.y, z: e.z, g: e.glyph, r: e.col[0], gr: e.col[1], b: e.col[2], life: 0.034, glow: 0.8, fade: false });
      if (this.frame % 2) this.part({ x: e.x, y: e.y, z: e.z, g: e.glyph, r: e.col[0] * 0.5, gr: e.col[1] * 0.5, b: e.col[2] * 0.6, life: 0.18, glow: 0.3, add: true });
    } else if (Math.random() < 0.6) this.part({ x: e.x, y: e.y, z: e.z, vz: 0.3, life: 0.3, g: GL.ch(G.rand.chance(0.5) ? '.' : '*'), r: e.col[0], gr: e.col[1], b: e.col[2], add: true, glow: 0.6, size: e.blast ? 0.35 : 0 });
    if (e.glyph) {
      /* letters cast no light */
    } else if (this.dynLights.length < 10) this.dynLights.push({ x: e.x, y: e.y, r: e.col[0], g: e.col[1], b: e.col[2], rad: e.blast ? 4 : 2.2, i: 0.8 });
  };
  Game.projEnd = function (e, hit) {
    e.alive = false;
    if (e.land === 'gas') {
      this.hazards.push({ x: e.x, y: e.y, r: 1.7, t: 4.5, type: 'gas', dmg: 3, luc: 6, col: [0.35, 0.8, 0.3] });
      this.smoke(e.x, e.y, 0.2, 10, 0.5, [0.35, 0.75, 0.3], 0.4);
      this.sound('splash', e.x, e.y);
      return;
    }
    if (e.land === 'chunk') {
      this.explode(e.x, e.y, 1.5, e.dmg, { team: 'enemy', pdmg: e.dmg, small: true, src: e.src, force: 6 });
      if (e.def.model) G.Phys.shatter(this, e, 4, 0, 0, 90);
      return;
    }
    if (e.blast) return this.explode(e.x, e.y, e.blast, e.dmg, { fire: e.fire, team: e.team, pdmg: e.dmg * 0.5 });
    if (hit) {
      if (e.glyph) this.burst(e.x, e.y, e.z, 2, e.col, 'letters', 1.5);
      else {
        this.sparks(e.x, e.y, e.z, 6, 2.5, 0, 0, e.col);
        this.ring(e.x, e.y, e.z, 0.05, 0.6, 0.25, e.col, { glyph: GL.id('sym:dot') });
      }
      this.addLight(e.x, e.y, e.col, 3, 1, 0.15);
    }
  };

  Game.updateEffects = function (dt) {
    for (const l of this.lines) l.life -= dt;
    this.lines = this.lines.filter((l) => l.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const w of this.waves) w.t += dt;
    this.waves = this.waves.filter((w) => w.t < w.max);
  };

  // Each stratum breathes its own particles into the lantern light.
  Game.ambient = function (dt) {
    const P = this.player, L = this.level, st = L.st;
    this.ambT = (this.ambT || 0) - dt;
    if (this.ambT > 0) return;
    this.ambT = 0.03;
    const a = G.rand.range(0, G.TAU), r = G.rand.range(0.5, 7);
    const x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
    if (L.solid(Math.floor(x), Math.floor(y))) return;
    const H = st.ceilH;
    const id = st.id;
    if (id === 0) {
      if (G.rand.chance(0.04)) this.part({ x, y, z: G.rand.range(0.3, H), vx: G.rand.range(-0.2, 0.2), vy: G.rand.range(-0.2, 0.2), vz: -0.15, life: 6, g: GL.ch(G.rand.pick(['=', '~', '-'])), r: 0.8, gr: 0.7, b: 0.5, lit: true });
      else this.part({ x, y, z: G.rand.range(0, H), vx: G.rand.range(-0.08, 0.08), vy: G.rand.range(-0.08, 0.08), vz: G.rand.range(-0.03, 0.05), life: G.rand.range(3, 6), g: GL.id('sym:dot'), r: 1, gr: 0.85, b: 0.6, lit: true });
    } else if (id === 1) {
      if (G.rand.chance(0.35)) this.part({ x, y, z: H - 0.05, vz: -0.5, grav: 6, life: 2, g: GL.ch("'"), r: 0.6, gr: 0.95, b: 1, lit: true, splat: L.flags[Math.floor(y) * L.w + Math.floor(x)] & G.Data.F.WATER ? null : { c: [0.05, 0.12, 0.12], em: 0 }, drip: true });
      else this.part({ x, y, z: G.rand.range(0, 0.6), vz: 0.25, life: 2.5, g: GL.id('sym:ring'), r: 0.5, gr: 0.9, b: 0.9, lit: true });
    } else if (id === 2) {
      this.part({ x, y, z: H, vx: G.rand.range(-0.1, 0.1), vy: G.rand.range(-0.1, 0.1), vz: -0.22, life: 5, g: GL.ch(G.rand.pick(['.', ',', '`'])), r: 0.85, gr: 0.75, b: 0.7, lit: true });
    } else if (id === 3) {
      this.part({ x, y, z: G.rand.range(0, 0.6), vz: G.rand.range(0.1, 0.35), vx: G.rand.range(-0.1, 0.1), life: 6, g: GL.id(G.rand.chance(0.7) ? 'sym:dot' : 'sym:star'), r: 0.85, gr: 0.6, b: 1, glow: 0.6, add: true });
    } else {
      this.part({ x, y, z: G.rand.range(0, 0.4), vz: G.rand.range(0.15, 0.4), life: 6, g: GL.ch(G.rand.pick(['.', ',', "'", '-'])), r: 0.1, gr: 0.08, b: 0.08 });
    }
    // drips meet water as ripples
    for (const p of this.parts) {
      if (p.drip && p.z < 0.05 && p.life > 0) {
        p.life = 0;
        if (L.flags[Math.floor(p.y) * L.w + Math.floor(p.x)] & G.Data.F.WATER) this.ring(p.x, p.y, 0.02, 0.02, 0.35, 0.8, [0.4, 0.8, 0.85], { water: true });
      }
    }
  };

  // Pillars that move when no one is looking.
  Game.updateShifts = function (dt) {
    const L = this.level;
    for (const s of L.shifts) {
      if (s.arena && !L.shiftActive) continue;
      s.t -= dt;
      if (s.t > 0) continue;
      s.t = s.arena ? 4 : G.rand.range(4, 8);
      const all = s.a.concat(s.b);
      if (all.some((i) => L.seen[i] > this.frame - 20)) continue;
      const target = s.on ? s.a : s.b, from = s.on ? s.b : s.a;
      const occupied = (i) => this.ents.some((e) => e.alive && (e.kind === 'enemy' || e.isPlayer || e.kind === 'thing') && Math.floor(e.y) * L.w + Math.floor(e.x) === i);
      if (target.some(occupied)) continue;
      for (const i of from) L.tiles[i] = 0;
      for (const i of target) L.tiles[i] = D.MAT.PILLAR;
      s.on = 1 - s.on;
      this.flowT = 0;
    }
  };

  // The director: hallucinations and whispers.
  Game.director = function (dt) {
    const P = this.player, L = this.level;
    const halluc = P.luc < 40 || P.mods.alwaysHalluc;
    this.directorT -= dt;
    if (halluc && this.directorT <= 0) {
      this.directorT = G.rand.range(8, 16) * (P.luc < 20 ? 0.6 : 1);
      if (this.ents.filter((e) => e.alive && e.type === 'phantasm').length < 3) {
        for (let tries = 0; tries < 30; tries++) {
          const a = G.rand.range(0, G.TAU), r = G.rand.range(7, 12);
          const x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
          const tx = Math.floor(x), ty = Math.floor(y);
          if (L.solid(tx, ty) || L.flow[ty * L.w + tx] > 30 || L.seen[ty * L.w + tx] > this.frame - 5) continue;
          const types = Object.keys(L.st.enemies).filter((t) => t !== 'drowned' && t !== 'hollow');
          this.spawn('phantasm', tx + 0.5, ty + 0.5, { data: { mimic: G.rand.pick(types) }, col: [0.65, 0.65, 0.7], state: 'chase', summon: true });
          break;
        }
      }
    }
    // whispers in the margins, pointing to the lie in the wall
    for (const w of this.whispers) w.t -= dt;
    this.whispers = this.whispers.filter((w) => w.t > 0);
    if (P.luc < 50) {
      this.whisperT -= dt;
      if (this.whisperT <= 0 && this.whispers.length < 6) {
        this.whisperT = G.rand.range(0.6, 2.5) * (P.luc / 50 + 0.3);
        let side = G.rand.chance(0.5) ? -1 : 1, text = G.rand.pick(D.WALL_TEXT).toLowerCase();
        let best = null, bd = 16;
        for (let i = 0; i < L.w * L.h; i++) {
          if (!(L.flags[i] & D.F.SECRET)) continue;
          const d = Math.hypot((i % L.w) + 0.5 - P.x, Math.floor(i / L.w) + 0.5 - P.y);
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        if (best !== null && G.rand.chance(0.6)) {
          const rel = G.angleDiff(P.a, Math.atan2(Math.floor(best / L.w) + 0.5 - P.y, (best % L.w) + 0.5 - P.x));
          side = rel > 0 ? 1 : -1;
          text = G.rand.pick(['the wall is a lie', 'this way', 'it is hollow here', 'through', 'not a wall']);
        }
        const cols = this.dsp.cols, rows = this.dsp.rows;
        const x = side < 0 ? G.rand.int(1, 6) : cols - text.length - G.rand.int(1, 6);
        this.whispers.push({ text, x, y: G.rand.int(5, rows - 7), t: 2.5, max: 2.5 });
      }
    }
  };

  // ------------------------------------------------------------------ rendering
  Game.renderPlay = function () {
    const P = this.player, dsp = this.dsp;
    if (this.state !== 'play') this.computeCamera();
    const fov = this.opts.fov * P.mods.fov + this.fx.fovKick;
    R.setupCamera(this.cam, fov, dsp.cellW, dsp.cellH);
    // dynamic lights: transient + muzzle + lantern-held glows
    const dl = this.dynLights;
    for (const l of this.lights) {
      const k = l.life / l.max;
      dl.push({ x: l.x, y: l.y, r: l.r, g: l.g, b: l.b, rad: l.rad, i: l.i * k });
    }
    for (const e of this.ents) {
      if (!e.alive || dl.length > 12) continue;
      if (e.type === 'exitwell') dl.push({ x: e.x, y: e.y, r: 0.6, g: 0.3, b: 1, rad: 3, i: 0.6 + 0.2 * Math.sin(this.time * 3) });
      if (e.type === 'brazier' && e.lit) dl.push({ x: e.x, y: e.y, r: 1, g: 0.6, b: 0.25, rad: 4, i: 0.35 + 0.15 * Math.sin(this.time * 17 + e.id) });
    }
    if (this.thirdPerson && P.lanternOn) dl.push({ x: P.x, y: P.y, r: 1, g: 0.75, b: 0.4, rad: 2.5, i: 0.5 });
    // creatures' glowing parts light their surroundings
    const glows = [];
    for (const e of this.ents) {
      if (!e.alive || !e.def.light) continue;
      const lg = e.def.light(e, this);
      if (!lg) continue;
      const d2 = (e.x - P.x) ** 2 + (e.y - P.y) ** 2;
      if (d2 > 400) continue;
      glows.push({ d2, l: { x: e.x, y: e.y, z: (e.z || 0) + e.h * 0.7, r: lg[0], g: lg[1], b: lg[2], rad: lg[3], i: lg[4] } });
    }
    glows.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < glows.length && dl.length < 10; i++) dl.push(glows[i].l);
    this.updateViewmodel(1 / 60);
    R.renderWorld(this);
    R.toCells(this, dsp);
    R.drawRings(this, dsp);
    R.drawParticles(this, dsp);
    R.drawLines(this, dsp);
    R.drawVoids(this, dsp);
    this.dynLights = [];
    UI.whispers(this);
    UI.bars(this);
    if (this.state === 'play' || this.state === 'descend') {
      UI.crosshair(this);
      if (!this.thirdPerson) UI.chargeBar(this);
    }
    UI.hud(this);
    UI.bossBar(this);
    UI.damageArrows(this);
    if (this.state === 'play') {
      UI.messages(this);
      UI.prompt(this);
      UI.titleCard(this);
      if (In.mapHeld()) UI.map(this);
      if (!In.locked && !G.debug && this.time - (this.lockHintT || 0) > 0) {
        UI.caption(Math.floor(dsp.rows * 0.7), 'CLICK TO TAKE CONTROL OF THE MOUSE', [0.8, 0.75, 0.6], 0.3, this.level.st.ink);
      }
    }
    if (this.arriveT > 0) UI.scramble(this, this.arriveT * 0.9, (this.time * 12) | 0);
    if (this.state === 'descend') UI.scramble(this, Math.min(1, this.descT / 1.4), (this.time * 12) | 0);
  };

  // Title / menu backdrop: the colossus over a skyline of spires.
  const backLevel = { st: null, flags: new Uint8Array(1), text: [], secretOpen: false, w: 1 };
  Game.backdrop = function (kind, dim) {
    backLevel.st = Object.assign({}, D.STRATA[3], { farDist: 1e9, wallSet: 'box', ink: kind === 'void' });
    R.backdrop(this, kind, backLevel);
    if (dim) UI.dim(0, 0, this.dsp.cols, this.dsp.rows, dim);
  };

  Game.renderState = function (dt) {
    const s = this.state;
    const H = STATES[s];
    if (H) H.call(this, dt);
  };

  // ------------------------------------------------------------------ screens
  const ACC = [1, 0.72, 0.32];
  const DIM = [0.55, 0.52, 0.48];
  const STATES = {
    title() {
      this.backdrop('cosmos');
      const rows = this.dsp.rows, cols = this.dsp.cols;
      const h = Math.max(5, Math.floor(rows / 6));
      UI.bigText('ASCIIOOTER', cols / 2, Math.floor(rows * 0.3), h, 'blocks', (i, j, w) => [1, 0.55 + 0.35 * (j / h), 0.25 + 0.3 * Math.sin(i / w * 3 + this.time)], 0.7);
      UI.textC(Math.floor(rows * 0.3) + Math.ceil(h / 2) + 1, 'T H E   U N W R I T T E N   D E E P', [0.85, 0.75, 1], null, 0.4);
      if (Math.sin(this.time * 3) > -0.3) UI.textC(Math.floor(rows * 0.68), 'PRESS ENTER OR CLICK TO BEGIN', ACC, null, 0.5);
      UI.textC(rows - 3, 'no engine - no assets - every pixel is a letter', [0.4, 0.38, 0.45]);
      A.update(dt(), { menu: true, luc: 1, threat: 0, danger: 0, awe: 0.6 });
      if (In.anyStart()) {
        A.unlock();
        this.state = 'menu';
        this.st = { sel: 0 };
      }
    },
    menu() {
      this.backdrop('cosmos');
      const rows = this.dsp.rows, cols = this.dsp.cols;
      const h = Math.max(4, Math.floor(rows / 9));
      UI.bigText('ASCIIOOTER', cols / 2, Math.floor(rows * 0.16), h, 'blocks', [1, 0.7, 0.35], 0.5);
      const S = this.save;
      const items = [
        { label: 'DESCEND', right: 'new run' },
        { label: 'DAILY RITE', right: todaySeed() },
        { label: 'SPEAK A SEED', right: 'replay a run' },
        { label: 'SCRIPTORIUM', right: `${S.ink} ink` },
        { label: 'CODEX', right: `${Object.keys(S.codex.seen).length}/${D.CODEX_ORDER.length} - ${S.codex.lore.length}/${D.LORE.length}` },
        { label: 'OPTIONS' },
        { label: 'HOW TO PLAY' },
      ];
      if (G.desktop) items.push({ label: 'QUIT TO DESKTOP' });
      const y0 = Math.floor(rows * 0.33);
      const c = UI.menu(items, this.st, 0, y0, { center: true, width: 40, gap: 2, accent: ACC });
      UI.textC(rows - 4, `RUNS ${S.stats.runs}   DEATHS ${S.stats.deaths}   VICTORIES ${S.stats.wins}   DEEPEST ${S.stats.best}   SLAIN ${S.stats.kills}`, DIM);
      UI.textC(rows - 2, D.TIPS[Math.floor(this.time / 6) % D.TIPS.length], [0.45, 0.43, 0.5]);
      A.update(1 / 60, { menu: true, luc: 1, threat: 0, danger: 0, awe: 0.6 });
      if (c === 0) this.goReaders(null, false);
      else if (c === 1) this.goReaders(todaySeed(), true);
      else if (c === 2) {
        this.state = 'seed';
        this.seedText = '';
      } else if (c === 3) {
        this.state = 'scriptorium';
        this.st = { sel: 0 };
      } else if (c === 4) {
        this.state = 'codex';
        this.st = { sel: 0, tab: 0 };
      } else if (c === 5) {
        this.optsBack = 'menu';
        this.state = 'options';
        this.st = { sel: 0 };
      } else if (c === 6) this.state = 'howto';
      else if (c === 7) {
        this.persist();
        window.close();
      }
      if (In.back()) this.state = 'title';
    },
    readers() {
      this.backdrop('cosmos', 0.4);
      const rows = this.dsp.rows;
      const S = this.save;
      UI.textC(Math.floor(rows * 0.12), this.pendingDaily ? 'THE DAILY RITE' : 'CHOOSE YOUR READER', ACC, null, 0.5);
      UI.textC(Math.floor(rows * 0.12) + 1, `seed: "${this.pendingSeed || 'chosen by the dark'}"`, DIM);
      const items = D.READER_ORDER.map((id) => {
        const r = D.READERS[id];
        const owned = S.readers[id];
        return { label: r.name, right: owned ? '' : `${r.cost} ink to awaken`, disabled: !owned && S.ink < r.cost };
      });
      items.push({ label: 'BACK' });
      const y0 = Math.floor(rows * 0.28);
      const c = UI.menu(items, this.st, 0, y0, { center: true, width: 46, gap: 2, accent: ACC });
      const sel = D.READER_ORDER[this.st.sel];
      if (sel) {
        const r = D.READERS[sel];
        const y = y0 + items.length * 2 + 1;
        UI.textC(y, r.desc, [0.85, 0.8, 0.7]);
        UI.textC(y + 1, `VITAE ${r.hp}   LUCIDITY ${r.luc}   OIL ${r.oil}   CARRIES ${r.weapons.map((w) => D.WEAPONS[w].name).join(' + ')}`, DIM);
        UI.drawShape(E.defs.avatar, Math.floor(this.dsp.cols / 2) - 8, y + 3, 16, Math.min(12, rows - y - 5), this.time, [0.8, 0.7, 0.55]);
      }
      if (c === items.length - 1 || In.back()) {
        this.state = 'menu';
        this.st = { sel: 0 };
      } else if (c >= 0) {
        const id = D.READER_ORDER[c];
        if (!S.readers[id]) {
          S.ink -= D.READERS[id].cost;
          S.readers[id] = true;
          this.persist();
          this.sound('relic');
        } else this.startRun(id, this.pendingSeed, this.pendingDaily);
      }
    },
    seed() {
      this.backdrop('cosmos', 0.4);
      const rows = this.dsp.rows;
      UI.textC(Math.floor(rows * 0.3), 'SPEAK THE SEED', ACC, null, 0.5);
      UI.textC(Math.floor(rows * 0.3) + 2, 'Type any words. The same words always open the same descent.', DIM);
      for (const k of In.typed) {
        if (k.length === 1 && /[a-zA-Z0-9 ]/.test(k) && this.seedText.length < 40) this.seedText += k.toUpperCase();
        if (k === 'Backspace') this.seedText = this.seedText.slice(0, -1);
      }
      const blink = Math.sin(this.time * 6) > 0 ? '_' : ' ';
      UI.textC(Math.floor(rows * 0.45), `" ${this.seedText}${blink} "`, [1, 0.9, 0.7], null, 0.4);
      UI.textC(Math.floor(rows * 0.6), 'ENTER to descend   -   ESC to return', DIM);
      if (In.hit('Enter') && this.seedText.trim()) this.goReaders(this.seedText.trim(), false);
      if (In.hit('Escape')) this.state = 'menu';
    },
    scriptorium() {
      this.backdrop('cosmos', 0.4);
      const rows = this.dsp.rows, S = this.save;
      UI.textC(Math.floor(rows * 0.08), 'THE SCRIPTORIUM', ACC, null, 0.5);
      UI.textC(Math.floor(rows * 0.08) + 1, `Spend the ink you carried out of the dark.   INK: ${S.ink}`, DIM);
      const items = [];
      const acts = [];
      for (const id of D.ANNOTATION_ORDER) {
        const a = D.ANNOTATIONS[id], tier = S.annot[id] || 0, max = a.costs.length;
        const cost = a.costs[tier];
        items.push({ label: `${a.name} ${'*'.repeat(tier)}${'.'.repeat(max - tier)}`, right: tier >= max ? 'complete' : `${cost} ink`, disabled: tier >= max || S.ink < cost });
        acts.push(() => {
          S.ink -= cost;
          S.annot[id] = tier + 1;
          this.sound('relic');
        });
      }
      if (S.stats.wins > 0) {
        for (const id of D.HERESY_ORDER) {
          const h = D.HERESIES[id];
          items.push({ label: `HERESY: ${h.name}`, right: S.heresiesOn[id] ? `ON  +${Math.round(h.ink * 100)}% ink` : 'off' });
          acts.push(() => (S.heresiesOn[id] = !S.heresiesOn[id]));
        }
      }
      items.push({ label: 'BACK' });
      acts.push(() => {
        this.state = 'menu';
        this.st = { sel: 3 };
      });
      const y0 = Math.floor(rows * 0.2);
      const gap = rows > 40 ? 2 : 1;
      const c = UI.menu(items, this.st, 0, y0, { center: true, width: 52, gap, accent: ACC });
      const selId = D.ANNOTATION_ORDER[this.st.sel];
      const desc = selId ? D.ANNOTATIONS[selId].desc : this.st.sel < items.length - 1 ? D.HERESIES[D.HERESY_ORDER[this.st.sel - D.ANNOTATION_ORDER.length]].desc : '';
      UI.textC(y0 + items.length * gap + 1, desc, [0.85, 0.8, 0.7]);
      if (S.stats.wins === 0) UI.textC(rows - 3, 'Heresies are revealed to those who reach the bottom.', [0.4, 0.38, 0.45]);
      if (c >= 0) {
        acts[c]();
        this.persist();
      }
      if (In.back()) {
        this.state = 'menu';
        this.st = { sel: 3 };
      }
    },
    codex() {
      this.backdrop('cosmos', 0.3);
      const rows = this.dsp.rows, cols = this.dsp.cols, S = this.save;
      const tabs = ['BESTIARY', 'FRAGMENTS', 'RELICS', 'RECORDS'];
      if (In.left()) {
        this.st.tab = (this.st.tab + 3) % 4;
        this.st.sel = 0;
      }
      if (In.right()) {
        this.st.tab = (this.st.tab + 1) % 4;
        this.st.sel = 0;
      }
      let tx = Math.floor(cols / 2) - 26;
      tabs.forEach((t, i) => {
        UI.text(tx, 2, t, i === this.st.tab ? ACC : DIM, null, i === this.st.tab ? 0.5 : 0);
        tx += t.length + 6;
      });
      UI.textC(3, '<  LEFT / RIGHT  >', [0.35, 0.33, 0.4]);
      const lx = Math.max(2, Math.floor(cols / 2) - 40);
      if (this.st.tab === 0) {
        const items = D.CODEX_ORDER.map((k) => ({ label: S.codex.seen[k] ? D.CODEX[k].name : '? ? ?', right: S.codex.seen[k] ? `${S.codex.kills[k] || 0} slain` : '' }));
        UI.menu(items, this.st, lx, 6, { width: 30, accent: ACC });
        const k = D.CODEX_ORDER[this.st.sel];
        const seen = S.codex.seen[k];
        const rx = lx + 36;
        if (seen) {
          const c = D.CODEX[k];
          UI.text(rx, 6, c.name, ACC, null, 0.5);
          UI.text(rx, 7, c.epi, [0.8, 0.75, 0.68]);
          const lines = (S.codex.kills[k] || 0) >= 3 || k === 'redactor' || k === 'unwritten' ? UI.wrap(c.rule, 40) : ['Slay three to understand it.'];
          lines.forEach((l, i) => UI.text(rx, 9 + i, l, [0.7, 0.65, 0.9]));
          const def = E.defs[k === 'unwritten' ? 'heart' : k];
          if (def && def.model) UI.drawShape(def, rx, 13, Math.min(40, cols - rx - 2), Math.min(22, rows - 16), this.time, def.col);
        } else UI.text(rx, 6, 'You have not met this yet.', DIM);
      } else if (this.st.tab === 1) {
        const items = D.LORE.map((l, i) => ({ label: S.codex.lore.includes(i) ? `${String(i + 1).padStart(2)}. ${l.slice(0, 26)}...` : `${String(i + 1).padStart(2)}. - - -` }));
        const view = Math.max(5, rows - 10);
        const off = G.clamp(this.st.sel - (view >> 1), 0, Math.max(0, items.length - view));
        const sub = items.slice(off, off + view);
        const st2 = { sel: this.st.sel - off };
        UI.menu(sub, st2, lx, 6, { width: 36, accent: ACC });
        this.st.sel = G.clamp(st2.sel + off, 0, items.length - 1);
        if (S.codex.lore.includes(this.st.sel)) UI.wrap(D.LORE[this.st.sel], 38).forEach((l, i) => UI.text(lx + 42, 6 + i, l, [0.9, 0.85, 0.75]));
      } else if (this.st.tab === 2) {
        const ids = Object.keys(D.RELICS);
        const items = ids.map((id) => ({ label: S.relicsSeen[id] ? D.RELICS[id].name : '? ? ?' }));
        const view = Math.max(5, rows - 10);
        const off = G.clamp(this.st.sel - (view >> 1), 0, Math.max(0, items.length - view));
        const st2 = { sel: this.st.sel - off };
        UI.menu(items.slice(off, off + view), st2, lx, 6, { width: 30, accent: ACC });
        this.st.sel = G.clamp(st2.sel + off, 0, items.length - 1);
        const r = D.RELICS[ids[this.st.sel]];
        if (S.relicsSeen[ids[this.st.sel]]) {
          UI.put(lx + 38, 6, GL.id('sym:' + r.sym), [1, 0.8, 0.4], null, 0.8);
          UI.text(lx + 40, 6, r.name, ACC);
          UI.wrap(r.desc, 36).forEach((l, i) => UI.text(lx + 40, 8 + i, l, [0.85, 0.8, 0.7]));
          if (r.forbidden) UI.text(lx + 40, 11, 'FORBIDDEN', [1, 0.3, 0.3]);
        }
      } else {
        const st = S.stats;
        const lines = [
          `Readers sent down     ${st.runs}`, `Readers lost          ${st.deaths}`, `Readers returned      ${st.wins}`, `Deepest floor         ${st.best}`,
          `Creatures unwritten   ${st.kills}`, `Ink gathered (all)    ${S.totalInk}`, `True ending           ${st.trueEnd ? 'READ' : 'unread'}`, '', 'EPITAPHS:',
        ];
        lines.forEach((l, i) => UI.text(lx, 6 + i, l, [0.85, 0.8, 0.7]));
        let y = 6 + lines.length;
        for (const ep of S.epitaphs.slice().reverse()) {
          for (const l of UI.wrap(ep.text, Math.min(90, cols - lx - 4))) {
            if (y >= rows - 2) break;
            UI.text(lx + 2, y++, l, ep.claimed ? [0.4, 0.4, 0.45] : [0.6, 0.65, 0.9]);
          }
          y++;
        }
      }
      if (In.back()) {
        this.state = 'menu';
        this.st = { sel: 4 };
      }
    },
    options() {
      if (this.optsBack === 'menu') this.backdrop('cosmos', 0.4);
      else UI.dim(0, 0, this.dsp.cols, this.dsp.rows, 0.25);
      const o = this.opts, rows = this.dsp.rows;
      const glyphNames = { 11: 'SMALL (sharper)', 14: 'MEDIUM', 18: 'LARGE (faster)', 22: 'HUGE (fastest)' };
      const rowsDef = [
        ['MOUSE SENSITIVITY', () => o.sens.toFixed(2), (d) => (o.sens = G.clamp(o.sens + d * 0.1, 0.1, 4))],
        ['FIELD OF VIEW', () => `${o.fov}`, (d) => (o.fov = G.clamp(o.fov + d * 5, 60, 120))],
        ['GLYPH SIZE', () => glyphNames[o.glyph] || o.glyph, (d) => {
          const v = [11, 14, 18, 22];
          o.glyph = v[G.clamp(v.indexOf(o.glyph) + d, 0, v.length - 1)];
          this.resize();
        }],
        ['MASTER VOLUME', () => `${Math.round(o.master * 100)}%`, (d) => (o.master = G.clamp(o.master + d * 0.1, 0, 1))],
        ['MUSIC & AMBIENCE', () => `${Math.round(o.music * 100)}%`, (d) => (o.music = G.clamp(o.music + d * 0.1, 0, 1))],
        ['EFFECTS VOLUME', () => `${Math.round(o.sfx * 100)}%`, (d) => (o.sfx = G.clamp(o.sfx + d * 0.1, 0, 1))],
        ['REDUCE FLASHING', () => (o.calm ? 'ON' : 'OFF'), () => (o.calm = !o.calm)],
        ['MADNESS DISTORTION', () => `${Math.round(o.distort * 100)}%`, (d) => (o.distort = G.clamp(o.distort + d * 0.25, 0, 1))],
        ['CRT GLASS', () => (o.crt ? 'ON' : 'OFF'), () => (o.crt = !o.crt)],
        ['INVERT LOOK', () => (o.invertY ? 'ON' : 'OFF'), () => (o.invertY = !o.invertY)],
        ['START IN THIRD PERSON', () => (o.third ? 'ON' : 'OFF'), () => (o.third = !o.third)],
        ['RENDER THREADS', () => (!G.MT.supported() ? 'UNAVAILABLE (ONE THREAD)' : o.threads ? `ON (${G.MT.threads + 1})` : 'OFF'), () => {
          if (!G.MT.supported()) return;
          o.threads = !o.threads;
          if (o.threads) G.MT.start();
          else G.MT.stop();
          this.resize();
        }],
        ['RESOLUTION', () => (o.res === 'full' ? 'FULL (SLOWEST)' : 'AUTO (FITS YOUR CPU)'), () => {
          o.res = o.res === 'full' ? 'auto' : 'full';
          this.resize();
        }],
        ['SHARPNESS', () => (o.sharp >= 2 ? 'HIGH-DPI' : o.sharp > 1 ? 'BALANCED' : 'FAST'), (d) => {
          const v = [1, 1.5, 2];
          o.sharp = v[G.clamp(v.indexOf(o.sharp) + d, 0, v.length - 1)];
          this.resize();
        }],
        ['SHOW FRAME RATE', () => (o.fps ? 'ON' : 'OFF'), () => (o.fps = !o.fps)],
        ['BACK', () => '', null],
      ];
      UI.textC(Math.floor(rows * 0.1), 'OPTIONS', ACC, null, 0.5);
      const items = rowsDef.map((r) => ({ label: r[0], right: r[1]() }));
      const y0 = Math.floor(rows * 0.18);
      const gap = rows > 36 ? 2 : 1;
      const c = UI.menu(items, this.st, 0, y0, { center: true, width: 50, gap, accent: ACC });
      const cur = rowsDef[this.st.sel];
      let d = 0;
      if (In.left()) d = -1;
      if (In.right()) d = 1;
      if (cur[2] && (d || (c === this.st.sel && c >= 0))) {
        cur[2](d || 1);
        this.applyOpts();
        this.persist();
      }
      UI.textC(y0 + items.length * gap + 1, 'LEFT / RIGHT to change', DIM);
      if ((c === rowsDef.length - 1) || In.back()) {
        this.persist();
        this.state = this.optsBack;
        this.st = { sel: 0 };
      }
    },
    howto() {
      this.backdrop('cosmos', 0.4);
      UI.page('HOW TO DESCEND', [
        'MOVE  WASD / arrows        LOOK  mouse (click to capture)       FIRE  left mouse',
        'DASH  space / right mouse  LANTERN  F     INTERACT  E     MAP  hold TAB',
        'WEAPONS  1-6, wheel, Q for last     CAMERA  V switches first / third person',
        'PAUSE  ESC       Gamepads work too.',
        '',
        'Find the well on each floor and descend. Ten floors, five strata, two things waiting at the bottom of them.',
        'VITAE is your life. LUCIDITY is your mind: darkness, gazes, songs and forbidden reading wear it down. Madness makes you hit harder, shows you walls that are lies, and fills the dark with things that are not there.',
        'OIL feeds your lantern. Some creatures only exist in light; some only in darkness.',
        'INK is kept forever. Spend it in the Scriptorium.',
      ], 99, ACC, 'ESC to return');
      if (In.back() || In.accept()) this.state = 'menu';
    },
    pause() {
      UI.dim(0, 0, this.dsp.cols, this.dsp.rows, 0.3);
      const rows = this.dsp.rows;
      UI.bigText('PAUSED', this.dsp.cols / 2, Math.floor(rows * 0.25), Math.max(3, Math.floor(rows / 12)), 'braille', [0.9, 0.85, 0.75], 0.3);
      const items = [{ label: 'RESUME' }, { label: this.thirdPerson ? 'SWITCH TO FIRST PERSON' : 'SWITCH TO THIRD PERSON' }, { label: 'OPTIONS' }, { label: 'ABANDON THIS READER' }];
      const c = UI.menu(items, this.st, 0, Math.floor(rows * 0.42), { center: true, width: 34, gap: 2, accent: ACC });
      this.printRunInfo(Math.floor(rows * 0.42) + 10);
      if (c === 0 || In.hit('Escape') || In.hit('KeyP')) {
        this.state = 'play';
        In.lock();
      } else if (c === 1) this.thirdPerson = !this.thirdPerson;
      else if (c === 2) {
        this.optsBack = 'pause';
        this.state = 'options';
        this.st = { sel: 0 };
      } else if (c === 3) {
        this.state = 'play';
        this.killPlayer('THEIR OWN HAND');
      }
    },
    relic() {
      const rs = this.relicSt, rows = this.dsp.rows, cols = this.dsp.cols;
      UI.dim(0, 0, cols, rows, 0.25);
      UI.textC(Math.floor(rows * 0.14), 'FROM THE MARGINS, TAKE ONE', [1, 0.85, 0.5], null, 0.6);
      const n = rs.choices.length;
      const cw = Math.min(30, Math.floor((cols - 4) / n) - 2), ch = 12;
      const x0 = Math.floor((cols - n * (cw + 2)) / 2), y0 = Math.floor(rows * 0.3);
      if (In.left() || In.up()) rs.sel = (rs.sel + n - 1) % n;
      if (In.right() || In.downNav()) rs.sel = (rs.sel + 1) % n;
      const mc = UI.mouseCell();
      let chosen = -1;
      rs.choices.forEach((id, i) => {
        const r = D.RELICS[id];
        const x = x0 + i * (cw + 2);
        if (In.moved && mc.x >= x && mc.x < x + cw && mc.y >= y0 && mc.y < y0 + ch) rs.sel = i;
        const on = i === rs.sel;
        const col = on ? [1, 0.82, 0.4] : [0.55, 0.5, 0.45];
        UI.frame(x, y0, cw, ch, col, on, [0.03, 0.025, 0.02]);
        UI.put(x + Math.floor(cw / 2), y0 + 2, GL.id('sym:' + r.sym), col, null, on ? 1 : 0.3);
        UI.wrap(r.name, cw - 4).forEach((l, k) => UI.text(x + Math.floor((cw - l.length) / 2), y0 + 4 + k, l, col, null, on ? 0.4 : 0));
        UI.wrap(r.desc, cw - 4).forEach((l, k) => UI.text(x + 2, y0 + 7 + k, l, [0.85, 0.8, 0.72]));
        if (r.forbidden) UI.text(x + 2, y0 + ch - 2, 'FORBIDDEN', [1, 0.3, 0.3]);
        UI.text(x + cw - 3, y0 + ch - 2, `${i + 1}`, DIM);
        if (In.hit('Digit' + (i + 1))) chosen = i;
        if (In.mpressed[0] && mc.x >= x && mc.x < x + cw && mc.y >= y0 && mc.y < y0 + ch) chosen = i;
      });
      if (In.accept()) chosen = rs.sel;
      UI.textC(y0 + ch + 2, 'ARROWS + ENTER, 1-' + n + ', OR CLICK', DIM);
      if (chosen >= 0) {
        const id = rs.choices[chosen];
        const P = this.player;
        P.relics.push(id);
        P.recompute();
        this.save.relicsSeen[id] = true;
        this.sound('relic');
        this.msg(`${D.RELICS[id].name}: ${D.RELICS[id].desc}`, [1, 0.85, 0.5], 4);
        this.persist();
        this.state = 'play';
        In.lock();
        if (rs.after) rs.after();
      }
    },
    read(dt) {
      const p = this.page;
      p.t += 1 / 60;
      UI.page(p.title, p.lines, p.t, p.accent, 'E / ENTER to close');
      if ((In.accept() || In.back() || In.mpressed[0]) && p.t > 0.3) {
        this.state = 'play';
        In.lock();
      }
      void dt;
    },
    dead() {
      this.deadT += 1 / 60;
      const rows = this.dsp.rows, cols = this.dsp.cols;
      const k = Math.min(1, this.deadT / 1.5);
      UI.dim(0, 0, cols, rows, 1 - k * 0.8);
      if (this.deadT < 0.4) return;
      UI.bigText('UNWRITTEN', cols / 2, Math.floor(rows * 0.22), Math.max(4, Math.floor(rows / 8)), 'sigilB', [0.9 * k, 0.15 * k, 0.12 * k], 0.6 * k);
      const ep = this.epitaph;
      UI.wrap(ep.text, Math.min(80, cols - 8)).forEach((l, i) => UI.textC(Math.floor(rows * 0.42) + i, l, [0.85 * k, 0.8 * k, 0.72 * k]));
      this.printRunInfo(Math.floor(rows * 0.56));
      UI.textC(Math.floor(rows * 0.56) + 6, 'Your remnant will wait on this floor for the next Reader.', [0.55, 0.6, 0.85]);
      if (this.deadT > 1.5) {
        UI.textC(rows - 4, 'ENTER to return to the surface', ACC, null, 0.4);
        if (In.accept() || In.mpressed[0]) {
          this.state = 'menu';
          this.st = { sel: 0 };
          this.player = null;
        }
      }
    },
    victory() {
      this.vicT += 1 / 60;
      const rows = this.dsp.rows, cols = this.dsp.cols;
      this.fx.collapseTarget = 1;
      const w = Math.min(1, this.vicT / 3);
      for (let i = 0; i < cols * rows; i++) {
        if (G.hash2(i, 3, 3) < w) {
          this.dsp.glyph[i] = 0;
          this.dsp.bg[i * 4] = this.dsp.bg[i * 4 + 1] = this.dsp.bg[i * 4 + 2] = 236;
        }
      }
      if (this.vicT < 3) return;
      const lines = D.ENDING.concat(this.save.stats.trueEnd ? D.TRUE_ENDING : []);
      let budget = Math.floor((this.vicT - 3) * 40);
      lines.forEach((l, i) => {
        const s = l.slice(0, Math.max(0, budget));
        budget -= l.length;
        UI.textC(Math.floor(rows * 0.2) + i * 2, s.padEnd(l.length, ' '), [0.08, 0.06, 0.06], [0.925, 0.925, 0.925]);
      });
      UI.textC(rows - 6, `Reader ${this.run.n} reached the bottom with ${this.run.kills} creatures unwritten and ${this.run.ink} ink.`, [0.3, 0.25, 0.25], [0.925, 0.925, 0.925]);
      if (!this.save.stats.trueEnd) UI.textC(rows - 5, `Read all ${D.LORE.length} fragments to understand what you have done.`, [0.5, 0.2, 0.2], [0.925, 0.925, 0.925]);
      if (this.vicT > 8) {
        UI.textC(rows - 3, 'ENTER to return', [0.5, 0.1, 0.1], [0.925, 0.925, 0.925]);
        if (In.accept() || In.mpressed[0]) {
          this.state = 'menu';
          this.st = { sel: 0 };
          this.player = null;
          this.fx.collapseTarget = 0;
          this.fx.collapse = 0;
        }
      }
    },
  };
  const dt = () => 1 / 60;

  Game.printRunInfo = function (y) {
    const P = this.player, run = this.run;
    if (!P || !run) return;
    const m = Math.floor(run.time / 60), s = Math.floor(run.time % 60);
    UI.textC(y, `FLOOR ${run.floor + 1}/${D.FLOORS.length}   TIME ${m}:${String(s).padStart(2, '0')}   SLAIN ${run.kills}   INK ${run.ink}   SEED "${run.seed}"`, DIM);
    const rel = P.relics.map((r) => D.RELICS[r].name).join(', ');
    if (rel) UI.wrap('RELICS: ' + rel, Math.min(90, this.dsp.cols - 6)).forEach((l, i) => UI.textC(y + 2 + i, l, [0.75, 0.65, 0.45]));
  };

  Game.goReaders = function (seed, daily) {
    this.pendingSeed = seed;
    this.pendingDaily = daily;
    this.state = 'readers';
    this.st = { sel: 0 };
  };
  function todaySeed() {
    const d = new Date();
    return `RITE ${d.getUTCFullYear()} ${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  // ------------------------------------------------------------------ extra effect entity
  E.defs.afterimage = {
    type: 'afterimage', kind: 'effect', r: 0.2, h: 1.1, w: 0.95, col: [0.5, 0.5, 0.9], emit: [0.7, 0.7, 1], set: 'braille', glow: 1, noShadow: true,
    update(e, g, dt2) {
      e.data.t = (e.data.t || 0) + dt2;
      if (e.data.t > 0.6) {
        e.alive = false;
        g.explode(e.x, e.y, 2.2, 60 * g.player.damageMul());
      }
    },
  };
})();
