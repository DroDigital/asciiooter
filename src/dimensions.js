'use strict';
// The dimensions below the library. Past the Ossuary the descent leaves anything that was ever
// written down, and the things that live there are made of geometry, light and sight:
//   the Folded Geometry - Tesseract, Recursion, and THE ORTHOGON
//   the Prism Abyss      - Refractor, Chromaghast (and its false echoes)
//   the Inside of the Eye - Oculoid, Gnasher, and THE OCULUS
(function () {
  const G = window.G;
  const E = G.Ent;
  const { wake, wander, seek, keepRange, melee } = E.ai;
  const { circ, ell, tcap, box, smin } = G.Models.sdf;
  const mat = G.Models.mat, emit = G.Models.emit;
  const hex = G.hex;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt;
  const fract = (x) => x - Math.floor(x);
  const rnd = (a, b) => G.rand.range(a, b);
  const def = (name, d) => {
    d.type = name;
    d.cel = d.kind === 'enemy';
    E.defs[name] = d;
    return d;
  };
  const toward = (e, P) => Math.atan2(P.y - e.y, P.x - e.x);
  const turn = (a, want, rate) => a + G.clamp(G.angleDiff(a, want), -rate, rate);
  const deflect = (g, e, z, col) => {
    g.sparks(e.x, e.y, z, 4, 3, 0, 0, col);
    if (g.frame % 4 === 0) g.sound('ping', e.x, e.y);
  };
  // A beam from (x, y) along angle a, stopped by walls. Hurts the player standing in it.
  function beam(g, e, x, y, z, a, col, dmg, dd, key, tick) {
    const P = g.player, dx = cos(a), dy = sin(a);
    const tr = g.trace(x, y, dx, dy, 30, true, false);
    const ex = x + dx * tr.t, ey = y + dy * tr.t;
    g.line(x, y, z, ex, ey, 0.5, [col[0] * 0.6 + 0.4, col[1] * 0.6 + 0.4, col[2] * 0.6 + 0.4], 0.05, { w: 2 });
    g.line(x, y, z, ex, ey, 0.5, col, 0.05, { w: 1, glyph: G.Glyphs.ch('=') });
    if (Math.random() < 0.4) g.sparks(ex, ey, 0.5, 1, 2.5, -dx, -dy, col);
    const rx = P.x - x, ry = P.y - y, along = rx * dx + ry * dy, perp = abs(rx * dy - ry * dx);
    dd[key] = (dd[key] || 0) - 1 / 60;
    if (along > 0 && along < tr.t && perp < 0.42 && dd[key] <= 0) {
      g.hurtPlayer(dmg, e.x, e.y, e);
      dd[key] = tick || 0.2;
    }
    return tr.t;
  }

  // ---------------------------------------------------------------- 4D wireframes
  // Projects a rotating tesseract into the sprite: 16 vertices, 32 edges. `flat` folds it
  // down toward a square; `s` is the size in world units.
  const EDGES = [];
  for (let a = 0; a < 16; a++) for (let b = 0; b < 4; b++) if (!(a & (1 << b))) EDGES.push(a, a | (1 << b));
  function project4(pv, t, seed, s, flat, cx, cy) {
    const a1 = t * 0.9 + seed, a2 = t * 0.6 + seed * 0.7, a3 = t * 0.35;
    const c1 = cos(a1), s1 = sin(a1), c2 = cos(a2), s2 = sin(a2), c3 = cos(a3), s3 = sin(a3);
    for (let v = 0; v < 16; v++) {
      let x = v & 1 ? 1 : -1, y = v & 2 ? 1 : -1, z = v & 4 ? 1 : -1, w = v & 8 ? 1 : -1;
      let q = x * c1 - w * s1;
      w = x * s1 + w * c1;
      x = q;
      q = y * c2 - z * s2;
      z = y * s2 + z * c2;
      y = q;
      q = x * c3 - z * s3;
      z = x * s3 + z * c3;
      x = q;
      const k4 = 1 / (2.6 - w * 0.8), px = x * k4, py = y * k4, pz = z * k4;
      const k3 = 1 / (3.2 - pz);
      pv[v * 2] = px * k3;
      pv[v * 2 + 1] = py * k3;
    }
    // normalise, so the turning shape always fills (and never overflows) its sprite
    let mr = 1e-6;
    for (let v = 0; v < 32; v++) mr = max(mr, abs(pv[v]));
    const k = s / mr;
    for (let v = 0; v < 16; v++) {
      pv[v * 2] = cx + pv[v * 2] * k;
      pv[v * 2 + 1] = cy + pv[v * 2 + 1] * k * (1 - 0.6 * flat);
    }
  }
  function wireDist(pv, X, Y, r) {
    let d = 9;
    for (let k = 0; k < EDGES.length; k += 2) {
      const a = EDGES[k] * 2, b = EDGES[k + 1] * 2;
      const q = tcap(X, Y, pv[a], pv[a + 1], pv[b], pv[b + 1], r, r);
      if (q < d) d = q;
    }
    return d;
  }
  function vertDist(pv, X, Y, r) {
    let d = 9;
    for (let v = 0; v < 16; v++) {
      const q = circ(X - pv[v * 2], Y - pv[v * 2 + 1], r);
      if (q < d) d = q;
    }
    return d;
  }
  function verts(e, t, s, cy) {
    const dd = e.data;
    if (!dd.pv) dd.pv = new Float32Array(32);
    if (dd.pvT !== t) {
      dd.pvT = t;
      project4(dd.pv, t, e.id * 1.3, s, dd.fold || 0, 0, cy);
    }
    return dd.pv;
  }

  // ---------------------------------------------------------------- TESSERACT
  def('tesseract', {
    kind: 'enemy', hp: 70, speed: 3.2, r: 0.4, h: 1.3, w: 1.4, z: 0.35, ownZ: true, fly: true, mass: 1.2, set: 'box', ink: 4, glow: 0.45,
    col: hex('#9fe8ff'), emit: hex('#7fe8ff'), blood: hex('#7fe8ff'), bloodEmit: 0.8, thick: 0.05,
    mats: [mat('#1a2a3a', 0.9, 60), emit('#7fe8ff'), emit('#ffffff'), emit('#ff4fd8')],
    model(X, Y, e, t, o) {
      const pv = verts(e, t, 0.6, 0.65);
      const wd = wireDist(pv, X, Y, 0.035), vd = vertDist(pv, X, Y, 0.06);
      const d = min(wd, vd);
      o.d = d;
      if (d > 0) return;
      const open = e.state === 'open';
      if (vd <= wd) {
        o.m = 2;
        o.e = 1.2;
      } else {
        o.m = open || e.state === 'unfold' ? 3 : 1;
        o.e = open ? 1.2 : 0.6;
      }
    },
    hurt(e, g, d, o) {
      if ((e.data.fold || 0) > 0.5 && !(o && o.blast)) {
        deflect(g, e, e.z + 0.65, [0.6, 0.95, 1]);
        return d * 0.1;
      }
      return d * 1.25;
    },
    update(e, g, dt) {
      const dd = e.data, P = g.player;
      e.z = 0.35 + sin(g.time * 1.5 + e.id) * 0.08;
      dd.fold = (dd.fold === undefined ? 1 : dd.fold) + ((e.state === 'open' || e.state === 'unfold' ? 0 : 1) - (dd.fold === undefined ? 1 : dd.fold)) * min(1, dt * 6);
      if (!wake(e, g)) return wander(e, g, dt);
      const d = g.distP(e);
      e.cd -= dt;
      if (e.state === 'unfold') {
        e.vx = e.vy = 0;
        e.st += dt;
        if (Math.random() < dt * 20) g.part({ x: e.x + rnd(-0.6, 0.6), y: e.y + rnd(-0.6, 0.6), z: e.z + rnd(0.2, 1.1), life: 0.3, g: G.Glyphs.id('bx:15'), r: 1, gr: 0.4, b: 0.9, glow: 1, add: true });
        if (e.st >= 0.7) {
          e.state = 'open';
          e.st = 0;
          g.sound('palimpsest', e.x, e.y, { vol: 0.6 });
        }
        return;
      }
      if (e.state === 'open') {
        e.vx = e.vy = 0;
        e.st += dt;
        // it fires along the four right angles of the world
        for (let k = 0; k < 4; k++) beam(g, e, e.x, e.y, e.z + 0.65, (k * Math.PI) / 2, [1, 0.35, 0.9], 4, dd, 'b' + k, 0.2);
        g.dynLights.push({ x: e.x, y: e.y, r: 1, g: 0.4, b: 0.9, rad: 4, i: 1 });
        if (e.st >= 1.8) {
          e.state = 'chase';
          e.cd = rnd(2.5, 3.5);
        }
        return;
      }
      // folded: it slides only along the axes, turning at right angles
      dd.slide = (dd.slide || 0) - dt;
      if (dd.slide <= 0) {
        dd.slide = rnd(0.5, 0.9);
        const dx = P.x - e.x, dy = P.y - e.y;
        const alongX = G.rand.chance(0.25) ? abs(dx) < abs(dy) : abs(dx) >= abs(dy);
        const sp = e.def.speed * (d > 3 ? 1 : -0.7);
        dd.vx = alongX ? Math.sign(dx) * sp : 0;
        dd.vy = alongX ? 0 : Math.sign(dy) * sp;
      }
      if (!g.losP(e)) seek(e, g, e.def.speed);
      else {
        e.vx = dd.vx || 0;
        e.vy = dd.vy || 0;
      }
      if (e.blocked) dd.slide = 0;
      if (e.cd <= 0 && d < 12 && g.losP(e)) {
        e.state = 'unfold';
        e.st = 0;
        g.sound('palimpsestCharge', e.x, e.y, { vol: 0.7 });
      }
    },
    light: (e) => [0.5, 0.9, 1, 3, e.state === 'open' ? 1.2 : 0.4],
    group: [1, 2],
  });

  // ---------------------------------------------------------------- RECURSION
  // A Sierpinski triangle, distance by folding toward the nearest corner.
  const TV = [0, -1, -0.866, 0.5, 0.866, 0.5];
  const TN = [0, 1, -0.866, -0.5, 0.866, -0.5]; // outward normals of the opposite edges
  function sierpinski(x, y, depth) {
    let sc = 1;
    for (let i = 0; i < depth; i++) {
      let bi = 0, bd = 1e9;
      for (let k = 0; k < 3; k++) {
        const dx = x - TV[k * 2], dy = y - TV[k * 2 + 1], q = dx * dx + dy * dy;
        if (q < bd) {
          bd = q;
          bi = k;
        }
      }
      x = x * 2 - TV[bi * 2];
      y = y * 2 - TV[bi * 2 + 1];
      sc *= 2;
    }
    let d = -1e9;
    for (let k = 0; k < 3; k++) d = max(d, x * TN[k * 2] + y * TN[k * 2 + 1] - 0.5);
    return d / sc;
  }
  def('recursion', {
    kind: 'enemy', hp: 60, speed: 3.0, r: 0.38, h: 1.25, w: 1.35, z: 0.25, ownZ: true, fly: true, mass: 1, set: 'sigilB', ink: 2, glow: 1.2,
    col: hex('#ffd36a'), emit: hex('#fff2a0'), blood: hex('#ffe08a'), bloodEmit: 0.7, thick: 0.06,
    mats: [mat('#4a3410', 0.6, 30), emit('#ffd36a'), emit('#ffffff'), mat('#b08a30', 0.8, 40)],
    init(e) {
      const gen = (e.data.gen = e.gen || 0);
      const s = Math.pow(0.62, gen);
      e.r *= s;
      e.h *= s;
      e.w *= s;
      e.hp = e.maxHp = e.maxHp * Math.pow(0.45, gen);
      e.data.s = s;
    },
    model(X, Y, e, t, o) {
      const s = e.data.s || 1, k = 0.56 * s;
      const a = t * 1.2 * (e.data.gen % 2 ? -1 : 1) + e.id;
      const px = X / k, py = (Y - e.h * 0.5) / k;
      const x = px * cos(a) - py * sin(a), y = px * sin(a) + py * cos(a);
      const d = sierpinski(x, y, 3) * k;
      const eye = circ(px, py, 0.13) * k;
      o.d = min(d, eye);
      if (o.d > 0) return;
      if (eye < 0) {
        o.m = circ(px, py, 0.06) < 0 ? 2 : 1;
        o.e = 1.6;
        return;
      }
      if (d > -0.025 * s) {
        o.m = 1;
        o.e = 1.2;
        return;
      }
      o.m = fract(x * 4 + y * 4) < 0.5 ? 0 : 3;
    },
    update(e, g, dt) {
      const dd = e.data, P = g.player, gen = dd.gen || 0;
      e.z = 0.25 + sin(g.time * 2 + e.id) * 0.1;
      if (!wake(e, g)) return wander(e, g, dt);
      const d = g.distP(e), sp = e.def.speed * Math.pow(1.3, gen);
      e.cd -= dt;
      if (dd.lunge > 0) {
        dd.lunge -= dt;
        if (!dd.hit && d < 0.75 + e.r) {
          g.hurtPlayer(8 - gen * 2, e.x, e.y, e);
          dd.hit = true;
        }
        return;
      }
      seek(e, g, sp);
      if (d < 2.2 && e.cd <= 0 && g.losP(e)) {
        const a = toward(e, P);
        e.vx = cos(a) * sp * 3;
        e.vy = sin(a) * sp * 3;
        dd.lunge = 0.28;
        dd.hit = false;
        e.cd = 1.3;
        g.sound('swipe', e.x, e.y, { vol: 0.6 });
      } else if (gen === 0 && d > 4 && d < 11 && e.cd <= 0 && g.losP(e)) {
        const a = toward(e, P);
        for (let k = -1; k <= 1; k++) g.proj({ x: e.x, y: e.y, z: 0.8, vx: cos(a + k * 0.2) * 7, vy: sin(a + k * 0.2) * 7, dmg: 6, team: 'enemy', life: 2.5, col: [1, 0.85, 0.3], r: 0.15, glyph: G.Glyphs.id('sym:tri') });
        e.cd = 2.6;
      }
    },
    onDeath(e, g) {
      const gen = e.data.gen || 0;
      if (gen >= 2 || (e.lastHit && e.lastHit.blast)) return;
      for (let k = 0; k < 2; k++) {
        const a = rnd(0, G.TAU);
        const c = g.spawn('recursion', e.x + cos(a) * 0.4, e.y + sin(a) * 0.4, { gen: gen + 1, state: 'chase', alerted: true });
        if (c) {
          c.kx = cos(a) * 4;
          c.ky = sin(a) * 4;
          c.cd = 0.6;
        }
      }
      g.burst(e.x, e.y, e.z + e.h * 0.5, 16, [1, 0.85, 0.3], 'sigil', 3);
    },
    light: () => [1, 0.85, 0.4, 2.5, 0.5],
    group: [1, 2],
  });

  // ---------------------------------------------------------------- REFRACTOR
  const RGB = [[1, 0.25, 0.25], [0.3, 1, 0.4], [0.35, 0.5, 1]];
  def('refractor', {
    kind: 'enemy', hp: 80, speed: 2.2, r: 0.35, h: 1.35, w: 1.1, z: 0.45, ownZ: true, fly: true, mass: 1, set: 'blocks', ink: 5, glow: 1.5,
    col: hex('#ffffff'), emit: hex('#ff7fe8'), blood: hex('#ffd0ff'), bloodEmit: 0.8, thick: 0.15,
    mats: [mat('#e8e0ff', 0.95, 80), emit('#ff3a3a'), emit('#3aff6a'), emit('#4a7aff'), emit('#ffffff'), mat('#8070c0', 0.95, 80)],
    model(X, Y, e, t, o) {
      const spin = t * 1.6 + e.id;
      const py = Y - 0.68, wx = 0.3 + 0.16 * abs(cos(spin));
      const d = (abs(X) / wx + abs(py) / 0.62 - 1) * min(wx, 0.62) * 0.8;
      o.d = d;
      if (d > 0) return;
      const core = (abs(X) / (wx * 0.5) + abs(py) / 0.3 - 1) * 0.15;
      if (core < 0) {
        if (e.data.feed) {
          o.m = 4;
          o.e = 2;
          return;
        }
        const sec = Math.floor(fract(Math.atan2(py, X * cos(spin)) / G.TAU + spin * 0.2) * 6) % 3;
        o.m = 1 + sec;
        o.e = 1.4;
        return;
      }
      o.m = (X * cos(spin) > 0) !== (py > 0) ? 0 : 5;
      o.k = 0.85 + 0.15 * fract(X * 9 + py * 5);
    },
    hurt(e, g, d) {
      if (e.data.feed) {
        deflect(g, e, e.z + 0.7, [1, 0.9, 1]);
        return d * 0.5;
      }
      return d;
    },
    update(e, g, dt) {
      const dd = e.data, P = g.player;
      e.z = 0.45 + sin(g.time * 1.3 + e.id) * 0.1;
      // lamplight feeds it
      const d = g.distP(e);
      dd.feed = P.lanternOn && d < P.lampRadius() && g.losP(e);
      if (dd.feed) {
        e.hp = min(e.maxHp, e.hp + 6 * dt);
        if (Math.random() < dt * 8) g.part({ x: P.x + (e.x - P.x) * Math.random(), y: P.y + (e.y - P.y) * Math.random(), z: 0.8, life: 0.4, g: G.Glyphs.id('sym:dot'), r: 1, gr: 0.95, b: 0.7, glow: 1, add: true });
      }
      if (!wake(e, g)) return wander(e, g, dt);
      e.cd -= dt;
      if (e.state === 'sing') {
        e.vx = e.vy = 0;
        e.st += dt;
        if (Math.random() < dt * 14) {
          const c = RGB[(Math.random() * 3) | 0];
          g.part({ x: e.x + rnd(-0.5, 0.5), y: e.y + rnd(-0.5, 0.5), z: e.z + rnd(0.2, 1.2), life: 0.4, g: G.Glyphs.id('sym:diamond'), r: c[0], gr: c[1], b: c[2], glow: 1, add: true });
        }
        if (e.st >= 0.8) {
          // three colours from three places, meeting where you stood
          const tx = P.x, ty = P.y, a = toward(e, P), dist = max(1, g.distP(e)), T = dist / 7.5;
          for (let k = 0; k < 3; k++) {
            const off = (k - 1) * 1.3, ox = e.x - sin(a) * off, oy = e.y + cos(a) * off;
            const L = Math.hypot(tx - ox, ty - oy) || 1;
            g.proj({ x: ox, y: oy, z: 0.8, vx: ((tx - ox) / L) * (L / T), vy: ((ty - oy) / L) * (L / T), dmg: 5, team: 'enemy', life: T + 0.05, col: RGB[k], r: 0.16 });
          }
          g.omen(tx, ty, T + 0.1, 14);
          g.sound('sing', e.x, e.y, { vol: 0.7 });
          e.state = 'chase';
          e.cd = 3.2;
        }
        return;
      }
      keepRange(e, g, e.def.speed, 5, 9);
      if (e.cd <= 0 && d < 13 && g.losP(e)) {
        e.state = 'sing';
        e.st = 0;
      }
    },
    light: (e, g) => {
      const c = RGB[Math.floor(g.time * 2 + e.id) % 3];
      return [c[0], c[1], c[2], 3, e.data.feed ? 1 : 0.6];
    },
    group: [1, 2],
  });

  // ---------------------------------------------------------------- CHROMAGHAST
  function ghostModel(X, Y, e, t, o) {
    const tint = e.data.tint || 0;
    const sw = sin(t * 2 + e.id) * 0.05;
    const atk = e.state === 'windup' ? min(1, e.st / 0.4) : 0;
    const head = ell(X - sw * 0.5, Y - 0.25, 0.14, 0.17);
    const body = tcap(X, Y, sw * 0.5, 0.35, sw * 2, 1.3, 0.13, 0.26);
    const armL = tcap(X, Y, -0.12, 0.45, -0.4 - atk * 0.2, 0.7 - atk * 0.35, 0.05, 0.02);
    const armR = tcap(X, Y, 0.12, 0.45, 0.4 + atk * 0.2, 0.7 - atk * 0.35, 0.05, 0.02);
    let d = smin(smin(head, body, 0.06), min(armL, armR), 0.04);
    // the hem frays into ribbons
    if (Y > 1.05) d = max(d, -(abs(fract(X * 6 + t * 0.7) - 0.5) - 0.18) * 0.3);
    o.d = d;
    if (d > 0) return;
    const f = cos(e.rel || 0);
    if (head < 0 && f > 0.2) {
      const ex = abs(X - sw * 0.5 - sin(e.rel || 0) * 0.06) - 0.055, ey = Y - 0.25;
      if (ex * ex + ey * ey < 0.0011) {
        o.m = 3;
        o.e = 1.8;
        return;
      }
      if (abs(X) < 0.1 && Y > 0.2 && Y < 0.36) {
        o.m = 4;
        return;
      }
    }
    o.m = tint;
    o.k = 0.8 + 0.2 * sin(Y * 18 + t * 3);
  }
  const ghostMats = [mat('#ff4a6a', 0.5, 30, 0.4), mat('#4aff8a', 0.5, 30, 0.4), mat('#5a8aff', 0.5, 30, 0.4), emit('#ffffff'), mat('#100818')];
  def('chromaghast', {
    kind: 'enemy', hp: 90, speed: 3.4, r: 0.3, h: 1.5, w: 1.0, set: 'sigilA', ink: 5, glow: 1.2,
    col: hex('#e0e0ff'), emit: hex('#ffffff'), blood: hex('#c0a0ff'), bloodEmit: 0.5, thick: 0.1,
    mats: ghostMats,
    model: ghostModel,
    init(e, g) {
      const tints = G.rand.shuffle([0, 1, 2]);
      e.data.tint = tints[0];
      e.data.echoes = [];
      for (let k = 1; k < 3; k++) {
        const c = g.spawn('chromaecho', e.x + rnd(-1, 1), e.y + rnd(-1, 1), { data: { tint: tints[k], master: e } });
        if (c) e.data.echoes.push(c);
      }
    },
    update(e, g, dt) {
      const dd = e.data;
      if (!wake(e, g)) return wander(e, g, dt);
      e.cd -= dt;
      dd.shuffle = (dd.shuffle === undefined ? rnd(3, 5) : dd.shuffle) - dt;
      if (dd.shuffle <= 0) {
        // trade places with one of its echoes in a smear of colour
        const live = dd.echoes.filter((c) => c.alive);
        if (live.length) {
          const c = G.rand.pick(live);
          const x = e.x, y = e.y;
          e.x = c.x;
          e.y = c.y;
          c.x = x;
          c.y = y;
          for (const p of [e, c]) g.burst(p.x, p.y, 0.8, 10, RGB[(Math.random() * 3) | 0], '|', 2);
          g.sound('whoosh', e.x, e.y, { vol: 0.5 });
        }
        dd.shuffle = rnd(3.5, 5.5);
      }
      if (melee(e, g, dt, 1.2, 0.4, 10, 1.2)) return;
      seek(e, g, e.def.speed);
    },
    onDeath(e, g) {
      for (const c of e.data.echoes) if (c.alive) g.dissolve(c);
    },
    light: (e) => {
      const c = RGB[e.data.tint || 0];
      return [c[0], c[1], c[2], 2, 0.3];
    },
  });
  def('chromaecho', {
    kind: 'enemy', hp: 1, speed: 3.4, r: 0.3, h: 1.5, w: 1.0, set: 'sigilA', ink: 0, glow: 1.2, phantom: true, noShadow: true, stealth: true, codex: 'chromaghast',
    col: hex('#e0e0ff'), emit: hex('#ffffff'), blood: hex('#c0a0ff'), thick: 0.1,
    mats: ghostMats,
    model: ghostModel,
    hurt(e, g, d) {
      // a false one screams light when struck
      const c = RGB[e.data.tint || 0];
      g.flash(c, 0.35);
      g.loseLucidity(4, 'chroma');
      g.ring(e.x, e.y, 0.8, 0.2, 2.2, 0.4, c);
      g.sound('shriek', e.x, e.y, { vol: 0.6 });
      return d;
    },
    update(e, g, dt) {
      const m = e.data.master;
      if (!m || !m.alive) return g.dissolve(e);
      e.state = m.state === 'windup' ? 'windup' : 'chase';
      e.st = m.st;
      if (!wake(e, g)) return wander(e, g, dt);
      seek(e, g, e.def.speed * 0.95);
      if (g.distP(e) < 1.1) {
        e.vx *= -0.3;
        e.vy *= -0.3;
      }
    },
  });

  // ---------------------------------------------------------------- OCULOID
  function eyeModel(X, Y, e, t, o, R, cy, gaze, lid) {
    const px = X, py = Y - cy;
    const ball = circ(px, py, R);
    const rel = e.rel || 0, f = cos(rel), sd = sin(rel);
    o.d = ball;
    if (ball > 0) return false;
    // the back of it is a closed lid
    if (f < -0.15) {
      o.m = 5;
      o.k = abs(px + sd * 0.1) < R * 0.04 ? 0.4 : 0.85 + 0.15 * sin(py * 30);
      return true;
    }
    const ix = sd * R * 0.62, iy = 0;
    const ir = R * 0.42 * max(0.25, f);
    const di = Math.hypot((px - ix) / max(0.3, f), py - iy);
    const pupil = R * (0.16 + 0.12 * gaze);
    if (lid !== undefined && abs(py) > R * lid) {
      o.m = 5;
      o.k = 0.8 + 0.2 * sin(px * 25);
      return true;
    }
    if (di < pupil) {
      o.m = 2;
      if (di > pupil * 0.8 && gaze > 0.2) {
        o.m = 3;
        o.e = 1 + gaze * 2;
      }
      return true;
    }
    if (di < ir) {
      o.m = 1;
      o.e = 0.55 + 0.35 * sin(Math.atan2(py - iy, px - ix) * 24 + t);
      return true;
    }
    const v = abs(sin(px * 31 + sin(py * 17) * 2));
    o.m = v < 0.06 && di > ir * 1.4 ? 4 : 0;
    return true;
  }
  def('oculoid', {
    kind: 'enemy', hp: 60, speed: 2.6, r: 0.3, h: 1.05, w: 1.0, z: 0.7, ownZ: true, fly: true, mass: 0.8, set: 'sigilA', ink: 4, glow: 1.3,
    col: hex('#f0e0d8'), emit: hex('#ff3050'), blood: hex('#c01030'), thick: 0.12,
    mats: [mat('#f2e6dc', 0.6, 40, 0.5), emit('#3ad08a'), mat('#050203'), emit('#ff3050'), mat('#a02030', 0.1, 8, 0.6), mat('#c86070', 0.2, 10, 0.4)],
    model(X, Y, e, t, o) {
      if (eyeModel(X, Y, e, t, o, 0.34, 0.38, min(1, (e.data.gaze || 0) / 1.3))) return;
      // the optic nerve trails beneath it
      const sway = sin(t * 3 + e.id + Y * 5) * 0.08;
      const n = tcap(X, Y, 0, 0.66, sway, 1.02, 0.07, 0.02);
      if (n < o.d) {
        o.d = n;
        if (n < 0) o.m = 4;
      }
    },
    hurt(e, g, d, o) {
      if (o && o.blast) return d;
      const att = Math.atan2(-(o && o.dirY) || 0, -(o && o.dirX) || 1);
      if (abs(G.angleDiff(e.face || 0, att)) < 0.9) return d * 1.4;
      deflect(g, e, e.z + 0.4, [1, 0.6, 0.6]);
      return d * 0.3;
    },
    update(e, g, dt) {
      const dd = e.data, P = g.player;
      e.z = 0.7 + sin(g.time * 1.7 + e.id) * 0.12;
      if (!wake(e, g)) {
        e.face = turn(e.face || 0, e.face + sin(g.time * 0.3 + e.id), dt);
        return wander(e, g, dt);
      }
      const want = toward(e, P), d = g.distP(e);
      e.face = turn(e.face || 0, want, 1.3 * dt);
      e.cd -= dt;
      keepRange(e, g, e.def.speed, 5, 9);
      const los = g.losP(e);
      if (los && d < 14 && e.cd <= 0 && abs(G.angleDiff(e.face, want)) < 0.35) dd.gaze = (dd.gaze || 0) + dt;
      else dd.gaze = max(0, (dd.gaze || 0) - dt * 2);
      if (dd.gaze > 0.05) {
        const k = min(1, dd.gaze / 1.3);
        g.line(e.x, e.y, e.z + 0.38, P.x, P.y, 0.55, [k, 0.05, 0.12 * k], 0.04, { flicker: true });
      }
      if (dd.gaze >= 1.3) {
        g.line(e.x, e.y, e.z + 0.38, P.x, P.y, 0.55, [1, 0.6, 0.6], 0.12, { w: 2 });
        g.hurtPlayer(13, e.x, e.y, e);
        g.sound('gaze', e.x, e.y);
        dd.gaze = 0;
        e.cd = 1.6;
      }
    },
    light: (e) => [1, 0.2, 0.3, 2.5, 0.3 + min(1, (e.data.gaze || 0) / 1.3)],
    group: [1, 3],
  });

  // ---------------------------------------------------------------- GNASHER
  def('gnasher', {
    kind: 'enemy', hp: 110, speed: 4.2, r: 0.45, h: 1.3, w: 1.4, mass: 3, set: 'sigilB', ink: 6, glow: 1,
    col: hex('#e8d8c8'), emit: hex('#ff3050'), blood: hex('#8a0a1a'), thick: 0.12,
    mats: [mat('#6a1420', 0.2, 10, 0.5), mat('#f2ead8', 0.7, 40), mat('#200204'), emit('#ff3050'), mat('#a0303a', 0.3, 20, 0.5)],
    init(e) {
      e.data.mode = 'under';
      e.hidden = true;
      e.intangible = true;
    },
    model(X, Y, e, t, o) {
      const k = e.data.rise || 0, H = 1.3;
      const top = H - 1.2 * k;
      if (Y < top - 0.25) {
        o.d = 0.1;
        return;
      }
      const open = e.data.open || 0;
      const col = max(abs(X) - (0.32 + 0.04 * sin(Y * 12 + t * 4)), top + 0.12 - Y);
      // the mouth at the top: a ring of teeth around a dark throat
      const my = Y - top - 0.05;
      const rim = ell(X, my, 0.42, 0.14 + 0.12 * open);
      const d = min(col, rim);
      o.d = d;
      if (d > 0) return;
      const th = ell(X, my, 0.3, 0.06 + 0.1 * open);
      if (th < 0) {
        o.m = abs(X) < 0.08 && open > 0.3 ? 3 : 2;
        o.e = 1.2;
        return;
      }
      if (rim < 0 && fract((Math.atan2(my, X) / G.TAU) * 14) < 0.55) {
        o.m = 1;
        return;
      }
      o.m = fract(Y * 6 + sin(X * 9) * 0.3) < 0.2 ? 4 : 0;
    },
    hurt(e, g, d) {
      return e.intangible ? 0 : d;
    },
    update(e, g, dt) {
      const dd = e.data, P = g.player;
      e.cd -= dt;
      const d = g.distP(e);
      if (dd.mode === 'under') {
        e.hidden = true;
        e.intangible = true;
        dd.rise = 0;
        // its wake on the floor is all you see of it
        dd.trail = (dd.trail || 0) - dt;
        if (dd.trail <= 0 && d < 16) {
          dd.trail = 0.12;
          g.part({ x: e.x + rnd(-0.3, 0.3), y: e.y + rnd(-0.3, 0.3), z: 0.02, life: 0.9, g: G.Glyphs.ch(G.rand.pick(['~', '^', ','])), r: 0.8, gr: 0.15, b: 0.2, glow: 0.4 });
        }
        if (!wake(e, g)) return wander(e, g, dt);
        seek(e, g, e.def.speed);
        if (d < 1.8 && e.cd <= 0) {
          dd.mode = 'mark';
          dd.t = 0.9;
          dd.tx = P.x;
          dd.ty = P.y;
          g.ring(P.x, P.y, 0.03, 1.4, 0.35, 0.9, [1, 0.25, 0.3], { glyph: G.Glyphs.id('sym:tri') });
          g.sound('groan', P.x, P.y, { vol: 0.6 });
        }
        return;
      }
      if (dd.mode === 'mark') {
        e.vx = e.vy = 0;
        dd.t -= dt;
        if (Math.random() < dt * 25) {
          const a = rnd(0, G.TAU), r = 0.4 + 1.0 * (dd.t / 0.9);
          g.part({ x: dd.tx + cos(a) * r, y: dd.ty + sin(a) * r, z: 0.03, life: 0.2, g: G.Glyphs.id('sym:tri'), r: 1, gr: 0.9, b: 0.85, glow: 0.6 });
        }
        if (dd.t <= 0) {
          e.x = dd.tx;
          e.y = dd.ty;
          dd.mode = 'up';
          dd.up = 2.2;
          e.hidden = false;
          e.intangible = false;
          if (Math.hypot(P.x - e.x, P.y - e.y) < 1.0) {
            g.hurtPlayer(18, e.x, e.y, e);
          }
          g.shake(6);
          g.burst(e.x, e.y, 0.1, 22, [0.5, 0.1, 0.12], '#%*', 4);
          g.sound('roar', e.x, e.y, { vol: 0.7 });
          e.cd = 0.8;
        }
        return;
      }
      e.vx = e.vy = 0;
      if (dd.mode === 'up') {
        dd.rise = min(1, dd.rise + dt * 4);
        dd.open = 0.5 + 0.5 * sin(g.time * 9);
        dd.up -= dt;
        if (d < 1.4 && e.cd <= 0) {
          g.hurtPlayer(9, e.x, e.y, e);
          g.sound('swipe', e.x, e.y);
          e.cd = 1;
        }
        if (dd.up <= 0) dd.mode = 'sink';
        return;
      }
      // sinking back into the floor
      dd.rise = max(0, dd.rise - dt * 2);
      if (dd.rise <= 0) {
        dd.mode = 'under';
        e.cd = rnd(2, 3);
      }
    },
    light: (e) => [1, 0.2, 0.3, 2, e.data.mode === 'up' ? 0.6 : 0],
  });

  // ================================================================ bosses
  // ---------------------------------------------------------------- THE ORTHOGON
  def('orthogon', {
    kind: 'enemy', boss: true, hp: 3200, speed: 1.2, r: 1.0, h: 3.0, w: 3.0, z: 0.5, ownZ: true, fly: true, mass: 99, heavy: true, set: 'box', ink: 80, glow: 1.6, minLight: 0.4,
    col: hex('#9fe8ff'), emit: hex('#ffffff'), blood: hex('#7fe8ff'), bloodEmit: 1, thick: 0.08,
    mats: [mat('#0c1824', 0.9, 60), emit('#7fe8ff'), emit('#ffffff'), emit('#ff4fd8'), emit('#ffd36a')],
    model(X, Y, e, t, o) {
      const dd = e.data, open = dd.mode === 'open' ? 1 : dd.mode === 'opening' ? min(1, dd.t2 || 0) : 0;
      const pv = verts(e, t * 0.6, 1.4, 1.5);
      const wd = wireDist(pv, X, Y, 0.06), vd = vertDist(pv, X, Y, 0.1);
      const core = circ(X, Y - 1.5, 0.38 + 0.05 * sin(t * 5));
      // closed, its faces are shut plates over the core
      const plate = open < 0.5 ? box(X, Y - 1.5, 0.62, 0.62, 0.06) : 9;
      const d = min(wd, vd, core, plate);
      o.d = d;
      if (d > 0) return;
      if (vd <= d + 1e-4) {
        o.m = 2;
        o.e = 1.8;
      } else if (wd <= d + 1e-4) {
        o.m = open > 0.5 ? 3 : 1;
        o.e = 1.4;
      } else if (core < 0 && open > 0.5) {
        o.m = 4;
        o.e = 1.5 + 0.5 * sin(t * 8);
      } else {
        o.m = 0;
        o.k = 0.7 + 0.3 * (fract((X + Y) * 3) < 0.5 ? 1 : 0.5);
      }
    },
    hurt(e, g, d) {
      if (e.data.mode !== 'open') {
        deflect(g, e, e.z + 1.5, [0.6, 0.95, 1]);
        return d * 0.05;
      }
      return d;
    },
    update(e, g, dt) {
      if (!wake(e, g)) return;
      g.bossRef = e;
      const dd = e.data, P = g.player, A = g.level.arena;
      const fr = e.hp / e.maxHp, phase = fr < 0.33 ? 3 : fr < 0.66 ? 2 : 1;
      if (dd.phase !== phase) {
        dd.phase = phase;
        if (phase > 1) {
          g.msg(phase === 2 ? 'THE ORTHOGON FOLDS THE ROOM AROUND YOU' : 'THE ORTHOGON STOPS AGREEING WITH THE WORLD', [0.6, 0.95, 1]);
          g.shake(8);
        }
      }
      e.z = 0.5 + sin(g.time * 0.8) * 0.15;
      dd.mode = dd.mode || 'closed';
      dd.t = (dd.t === undefined ? 3 : dd.t) - dt;
      // drift around the centre of the arena
      const ox = A.cx + cos(g.time * 0.25) * 3 - e.x, oy = A.cy + sin(g.time * 0.25) * 3 - e.y;
      e.vx = ox * 0.6;
      e.vy = oy * 0.6;
      if (dd.mode === 'closed') {
        dd.fire = (dd.fire || 1) - dt;
        if (dd.fire <= 0) {
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2 + (phase === 3 && g.frame % 2 ? Math.PI / 4 : 0);
            g.proj({ x: e.x, y: e.y, z: 1.2, vx: cos(a) * 6, vy: sin(a) * 6, dmg: 10, team: 'enemy', life: 4, col: [0.6, 0.95, 1], r: 0.22, big: true });
          }
          g.sound('ping', e.x, e.y);
          dd.fire = 1.2 - phase * 0.15;
        }
        dd.sum = (dd.sum === undefined ? 6 : dd.sum) - dt;
        if (phase >= 2 && dd.sum <= 0) {
          for (let k = 0; k < phase - 1; k++) {
            const a = rnd(0, G.TAU);
            g.spawn(G.rand.chance(0.5) ? 'tesseract' : 'recursion', A.cx + cos(a) * (A.r - 2), A.cy + sin(a) * (A.r - 2), { state: 'chase', summon: true, alerted: true });
          }
          dd.sum = 13;
        }
        if (dd.t <= 0) {
          dd.mode = 'opening';
          dd.t = 0.9;
          dd.t2 = 0;
          g.sound('palimpsestCharge', e.x, e.y);
          dd.ba = Math.round(toward(e, P) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
        }
      } else if (dd.mode === 'opening') {
        dd.t2 += dt / 0.9;
        if (dd.t <= 0) {
          dd.mode = 'open';
          dd.t = 4 - phase * 0.3;
          g.sound('palimpsest', e.x, e.y);
          g.shake(5);
        }
      } else {
        // open: the core is exposed and four beams keep to right angles (later, they turn)
        const w = phase === 1 ? 0 : phase === 2 ? 0.3 : 0.55;
        dd.ba = (dd.ba || 0) + w * dt * (dd.dir || 1);
        for (let k = 0; k < 4; k++) beam(g, e, e.x, e.y, e.z + 1.5, dd.ba + (k * Math.PI) / 2 - Math.PI / 4, [1, 0.35, 0.9], 6, dd, 'b' + k, 0.22);
        g.dynLights.push({ x: e.x, y: e.y, r: 1, g: 0.85, b: 0.5, rad: 6, i: 1.2 });
        if (dd.t <= 0) {
          dd.mode = 'closed';
          dd.t = 4.5 - phase * 0.5;
          dd.dir = G.rand.chance(0.5) ? 1 : -1;
          if (phase === 3) {
            // and it simply is somewhere else
            for (let tries = 0; tries < 20; tries++) {
              const a = rnd(0, G.TAU), r = rnd(2, A.r - 4);
              const nx = A.cx + cos(a) * r, ny = A.cy + sin(a) * r;
              if (!g.level.solid(Math.floor(nx), Math.floor(ny)) && Math.hypot(nx - P.x, ny - P.y) > 5) {
                g.burst(e.x, e.y, 1.5, 30, [0.5, 0.9, 1], 'sigil', 4);
                e.x = nx;
                e.y = ny;
                break;
              }
            }
          }
        }
      }
    },
    light: (e) => [0.5, 0.9, 1, 8, e.data.mode === 'open' ? 1.3 : 0.7],
  });

  // ---------------------------------------------------------------- THE OCULUS
  def('oculus', {
    kind: 'enemy', boss: true, hp: 3600, speed: 0, r: 1.4, h: 3.4, w: 3.4, z: 0.5, ownZ: true, fly: true, mass: 99, heavy: true, set: 'sigilA', ink: 90, glow: 1.5, minLight: 0.45,
    col: hex('#f2e6dc'), emit: hex('#ff3050'), blood: hex('#c01030'), thick: 0.15,
    mats: [mat('#f2e6dc', 0.6, 40, 0.5), emit('#e0a83a'), mat('#020101'), emit('#ff3050'), mat('#a02030', 0.1, 8, 0.6), mat('#7a1828', 0.2, 10, 0.4)],
    model(X, Y, e, t, o) {
      const dd = e.data;
      if (eyeModel(X, Y, e, t, o, 1.45, 1.6, min(1, dd.burn || 0), max(0.04, dd.open === undefined ? 0 : dd.open))) return;
      // nerves hanging from it, down to the floor
      let d = 9;
      for (let k = -2; k <= 2; k++) {
        const sw = sin(t * 1.3 + k * 1.7 + Y * 3) * 0.12;
        d = min(d, tcap(X, Y, k * 0.45, 2.7, k * 0.6 + sw, 3.4, 0.12, 0.05));
      }
      if (d < o.d) {
        o.d = d;
        if (d < 0) o.m = 4;
      }
    },
    hurt(e, g, d) {
      if (e.data.mode !== 'stare') {
        deflect(g, e, e.z + 1.6, [1, 0.5, 0.5]);
        return d * 0.05;
      }
      return d;
    },
    update(e, g, dt) {
      if (!wake(e, g)) return;
      g.bossRef = e;
      const dd = e.data, P = g.player, A = g.level.arena;
      const fr = e.hp / e.maxHp, phase = fr < 0.33 ? 3 : fr < 0.66 ? 2 : 1;
      if (dd.phase !== phase) {
        dd.phase = phase;
        if (phase > 1) {
          g.msg(phase === 2 ? 'THE OCULUS WEEPS, AND ITS TEARS HAVE EYES' : 'THE OCULUS BLINKS, AND THE WORLD GOES WITH IT', [1, 0.4, 0.45]);
          g.shake(8);
        }
      }
      e.vx = e.vy = 0;
      e.z = 0.5 + sin(g.time * 0.6) * 0.1;
      const want = toward(e, P);
      e.face = turn(e.face === undefined ? want : e.face, want, (0.55 + phase * 0.1) * dt);
      dd.mode = dd.mode || 'shut';
      dd.t = (dd.t === undefined ? 3 : dd.t) - dt;
      if (dd.mode === 'shut') {
        dd.open = max(0, (dd.open || 0) - dt * 3);
        dd.burn = 0;
        // tears: they fall where you are standing
        dd.tear = (dd.tear || 0) - dt;
        if (dd.tear <= 0) {
          g.omen(P.x + rnd(-2.5, 2.5), P.y + rnd(-2.5, 2.5), 1.1, 12);
          dd.tear = 0.55 - phase * 0.08;
        }
        dd.sum = (dd.sum === undefined ? 4 : dd.sum) - dt;
        if (phase >= 2 && dd.sum <= 0) {
          for (let k = 0; k < phase; k++) {
            const a = rnd(0, G.TAU);
            g.spawn(phase === 3 && k === 0 ? 'gnasher' : 'oculoid', A.cx + cos(a) * (A.r - 2), A.cy + sin(a) * (A.r - 2), { state: 'chase', summon: true, alerted: true });
          }
          dd.sum = 14;
        }
        if (phase === 3) g.eyelid = max(g.eyelid || 0, dd.t < 0.7 ? 1 - dd.t / 0.7 : 0);
        if (dd.t <= 0) {
          dd.mode = 'waking';
          dd.t = 0.8;
          g.sound('gaze', e.x, e.y);
        }
      } else if (dd.mode === 'waking') {
        dd.open = min(1, (dd.open || 0) + dt / 0.8);
        if (dd.t <= 0) {
          dd.mode = 'stare';
          dd.t = 5.5;
        }
      } else {
        // the stare: a gaze along its facing, stopped by the pillars; held, it burns
        dd.open = 1;
        const a = e.face, dx = cos(a), dy = sin(a);
        const tr = g.trace(e.x, e.y, dx, dy, 40, true, false);
        const rx = P.x - e.x, ry = P.y - e.y, along = rx * dx + ry * dy, perp = abs(rx * dy - ry * dx);
        const held = along > 0 && along < tr.t && perp < 0.9;
        dd.burn = held ? min(1.5, (dd.burn || 0) + dt * 1.6) : max(0, (dd.burn || 0) - dt * 2.5);
        const k = min(1, dd.burn);
        const ex = e.x + dx * tr.t, ey = e.y + dy * tr.t;
        g.line(e.x, e.y, e.z + 1.6, ex, ey, 0.5, [0.5 + 0.5 * k, 0.05 + 0.3 * k, 0.1 + 0.2 * k], 0.05, { w: k > 0.6 ? 2 : 1, flicker: k < 0.6 });
        g.dynLights.push({ x: (e.x + ex) / 2, y: (e.y + ey) / 2, r: 1, g: 0.2, b: 0.25, rad: 5, i: 0.4 + k });
        if (k > 0.6) {
          dd.tick = (dd.tick || 0) - dt;
          if (dd.tick <= 0) {
            g.hurtPlayer(6, e.x, e.y, e);
            g.loseLucidity(2, 'gaze');
            dd.tick = 0.3;
          }
        }
        if (dd.t <= 0) {
          dd.mode = 'shut';
          dd.t = 5 - phase * 0.5;
          g.sound('groan', e.x, e.y);
        }
      }
    },
    light: (e) => [1, 0.25, 0.3, 9, e.data.mode === 'stare' ? 1.2 : 0.6],
  });
})();
