'use strict';
// Physics: particles that collide with the world and come to rest, bodies that can be shoved,
// walls that crack and collapse into rubble, creatures that come apart into their own letters,
// and lingering hazards (fire, gas, shockwaves).
(function () {
  const G = window.G;
  const D = G.Data, GL = G.Glyphs;
  const Ph = (G.Phys = {});
  const rnd = (a, b) => G.rand.range(a, b);
  const SPIN = ['-', '\\', '|', '/'];
  let SPIN_IDS = null;
  Ph.spinGlyph = (ang) => {
    if (!SPIN_IDS) SPIN_IDS = SPIN.map((c) => GL.ch(c));
    return SPIN_IDS[((Math.floor(ang / (Math.PI / 4)) % 4) + 4) % 4];
  };

  // ---------------------------------------------------------------- particles
  Ph.update = function (g, dt) {
    const L = g.level, ps = g.parts, Hc = L.st.ceilH;
    let j = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.sleep) {
        ps[j++] = p;
        continue;
      }
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.vz *= k;
      }
      p.vz -= (p.grav - p.buoy) * dt;
      if (p.flutter) {
        p.vx += Math.sin(g.time * 7 + i) * p.flutter * dt;
        p.vy += Math.cos(g.time * 6 + i * 1.3) * p.flutter * dt;
      }
      if (p.av) p.ang += p.av * dt;
      if (p.grow) p.size += p.grow * dt;
      if (p.col) {
        const pr = p.rad;
        let nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
        if (L.wall(Math.floor(nx), Math.floor(p.y))) {
          p.vx = -p.vx * p.rest;
          p.vy *= 0.85;
          p.av = -p.av;
          nx = p.x;
        }
        if (L.wall(Math.floor(nx), Math.floor(ny))) {
          p.vy = -p.vy * p.rest;
          p.vx *= 0.85;
          ny = p.y;
        }
        if (nz < pr) {
          nz = pr;
          if (p.splat && p.vz < -1.2) {
            g.decal(nx, ny, 0, rnd(0.04, 0.11) * (p.splat.k || 1), p.splat.c, 0.85, p.splat.em);
            if (p.splat.once) p.splat = null;
          }
          p.vz = -p.vz * p.rest;
          p.vx *= p.fric;
          p.vy *= p.fric;
          p.av *= p.fric;
          if (Math.abs(p.vz) < 0.6) {
            p.vz = 0;
            if (p.vx * p.vx + p.vy * p.vy < 0.04) {
              p.sleep = true;
              p.vx = p.vy = 0;
              p.av = 0;
            }
          }
        } else if (nz > Hc - 0.03) {
          nz = Hc - 0.03;
          p.vz = -Math.abs(p.vz) * p.rest;
        }
        p.x = nx;
        p.y = ny;
        p.z = nz;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.z < 0.02) {
          if (p.splat) {
            g.decal(p.x, p.y, 0, rnd(0.04, 0.12), p.splat.c, 0.85, p.splat.em);
            continue;
          }
          p.z = 0.02;
          p.vz = 0;
          p.vx *= 0.7;
          p.vy *= 0.7;
        }
      }
      ps[j++] = p;
    }
    ps.length = j;
  };

  // Push everything in a sphere: particles, props, creatures.
  Ph.impulse = function (g, x, y, z, rad, force) {
    for (const p of g.parts) {
      if (!p.col && !p.drag) continue;
      const dx = p.x - x, dy = p.y - y, dz = p.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > rad) continue;
      const k = (force * (1 - d / rad)) / (d + 0.25);
      p.vx += dx * k;
      p.vy += dy * k;
      p.vz += Math.abs(dz) * k * 0.5 + force * (1 - d / rad) * 0.6;
      p.av = (p.av || 0) + rnd(-20, 20);
      p.sleep = false;
    }
    for (const e of g.ents) {
      if (!e.alive || e.def.boss) continue;
      const body = e.def.body, enemy = e.kind === 'enemy';
      if (!body && !enemy) continue;
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
      if (d > rad || d < 0.001) continue;
      const mass = e.def.mass || (e.def.heavy ? 6 : 1);
      const k = (force * (1 - d / rad)) / mass;
      e.kx += (dx / d) * k * 1.4;
      e.ky += (dy / d) * k * 1.4;
      if (!e.def.fly && mass < 3) e.vz = Math.max(e.vz || 0, k * 0.7);
      if (body) e.sleep = false;
    }
  };

  // ---------------------------------------------------------------- creatures coming apart
  const SO = { d: 1, m: 0, e: 1, k: 1 };
  Ph.shatter = function (g, e, force, dirX, dirY, cap) {
    const def = e.def, cam = G.R.cam;
    if (!def.model) return;
    const rx = -cam.dirY, ry = cam.dirX;
    const area = e.w * e.h;
    const maxP = cap || 220;
    const step = Math.max(0.025, Math.sqrt((area * 0.3) / maxP));
    const nw = Math.ceil(e.w / step), nh = Math.ceil(e.h / step);
    const set = GL.sets[def.set || 'sigilA'] || GL.sets.sigilA;
    const pool = set.crawl ? set.buckets[3].concat(set.buckets[4], set.buckets[5]) : null;
    const cz = (e.z || 0) + e.h * 0.5;
    const t = g.time;
    let made = 0;
    for (let iy = 0; iy < nh; iy++)
      for (let ix = 0; ix < nw; ix++) {
        const X = -e.w / 2 + (ix + 0.5) * step, Y = (iy + 0.5) * step;
        SO.d = 1;
        SO.m = 0;
        SO.e = 1;
        SO.k = 1;
        def.model(X, Y, e, t, SO);
        if (SO.d >= 0) continue;
        if (made++ > maxP) return;
        const m = def.mats[SO.m] || def.mats[0];
        const c = m.e || m.c;
        const wx = e.x + rx * X, wy = e.y + ry * X, wz = (e.z || 0) + e.h - Y;
        const ox = X, oz = wz - cz;
        const len = Math.sqrt(ox * ox + oz * oz) + 0.05;
        const sp = force * rnd(0.45, 1.25);
        const g2 = pool ? pool[(Math.random() * pool.length) | 0] : set.lut[255] || GL.ch('#');
        g.part({
          x: wx, y: wy, z: Math.max(0.05, wz),
          vx: (rx * ox) / len * sp + (dirX || 0) * force * 0.7 + rnd(-0.8, 0.8),
          vy: (ry * ox) / len * sp + (dirY || 0) * force * 0.7 + rnd(-0.8, 0.8),
          vz: (oz / len) * sp + rnd(0.8, 3.2),
          grav: 11, col: true, rest: 0.32, fric: 0.62, rad: 0.03, av: rnd(-14, 14),
          life: rnd(2.2, 4.2), g: g2, r: c[0] * SO.k, gr: c[1] * SO.k, b: c[2] * SO.k,
          lit: !m.e, litMin: 0.35, glow: m.e ? 0.8 : 0, tumble: !m.e && Math.random() < 0.35,
          splat: Math.random() < 0.12 && def.blood ? { c: def.blood, em: def.bloodEmit || 0, once: true } : null,
        });
      }
    // a few heavy chunks
    const chunks = Math.min(8, 2 + Math.round(area * 2));
    const body = def.mats[0].c;
    for (let i = 0; i < chunks; i++) {
      g.part({
        x: e.x + rnd(-0.2, 0.2), y: e.y + rnd(-0.2, 0.2), z: cz,
        vx: rnd(-1, 1) * force * 0.6 + (dirX || 0) * force * 0.5, vy: rnd(-1, 1) * force * 0.6 + (dirY || 0) * force * 0.5, vz: rnd(1, 4),
        grav: 12, col: true, rest: 0.2, fric: 0.5, rad: 0.06, life: rnd(3, 5), size: rnd(0.08, 0.16), solid: true,
        g: GL.id('q:15'), r: body[0] * 0.8, gr: body[1] * 0.8, b: body[2] * 0.8, lit: true,
        splat: def.blood ? { c: def.blood, em: def.bloodEmit || 0, k: 1.6 } : null,
      });
    }
  };

  // ---------------------------------------------------------------- destruction
  const WALL_HP = { 1: 260, 2: 210, 3: 120, 4: 150, 5: 170, 6: 95, 7: 320, 8: 180, 9: 190, 10: 110 };
  Ph.initWalls = function (L) {
    const W = L.w, H = L.h;
    L.whp = new Float32Array(W * H);
    L.wmax = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const edge = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
        const hp = L.tiles[i] ? (edge ? Infinity : WALL_HP[L.tiles[i]] || 200) : 0;
        L.whp[i] = hp;
        L.wmax[i] = hp;
      }
  };

  function wallColor(L, i, k) {
    const st = L.st, c = st.wall[L.tiles[i]] || st.wall[st.mats[0]] || [0.5, 0.5, 0.5];
    const lt = [0, 0, 0];
    L.light((i % L.w) + 0.5, Math.floor(i / L.w) + 0.5, lt);
    const l = 0.35 + (lt[0] + lt[1] + lt[2]) / 3;
    return [c[0] * k * l, c[1] * k * l, c[2] * k * l];
  }
  function rubbleGlyph(L) {
    const set = GL.sets[L.st.wallSet] || GL.sets.ascii;
    const r = set.ramp;
    if (Math.random() < 0.5) return r[Math.max(1, r.length - 1 - ((Math.random() * 3) | 0))];
    return GL.ch(G.rand.pick(['#', '%', '&', '@', '8', '=', '"', '*', '+']));
  }

  Ph.damageWall = function (g, tx, ty, dmg, hx, hy, hz, dirX, dirY) {
    const L = g.level;
    if (!L.inb(tx, ty)) return;
    const i = ty * L.w + tx;
    if (!L.tiles[i] || !isFinite(L.whp[i])) return;
    L.whp[i] -= dmg;
    if (dmg > 4 && Math.random() < 0.8) {
      const c = wallColor(L, i, 0.9);
      const n = Math.min(10, 2 + Math.floor(dmg / 10));
      for (let k = 0; k < n; k++)
        g.part({
          x: hx - dirX * 0.06, y: hy - dirY * 0.06, z: hz, vx: -dirX * rnd(0.5, 3) + rnd(-1, 1), vy: -dirY * rnd(0.5, 3) + rnd(-1, 1), vz: rnd(0, 2.5),
          grav: 11, col: true, rest: 0.3, fric: 0.55, rad: 0.02, life: rnd(1, 2.5), g: rubbleGlyph(L), r: c[0], gr: c[1], b: c[2], av: rnd(-10, 10), tumble: true,
        });
    }
    if (L.whp[i] <= 0) Ph.breakWall(g, i, dirX || 0, dirY || 0);
  };

  Ph.breakWall = function (g, i, dirX, dirY) {
    const L = g.level, W = L.w;
    const tx = i % W, ty = Math.floor(i / W);
    const Hc = L.st.ceilH;
    const base = wallColor(L, i, 1);
    L.tiles[i] = 0;
    L.flags[i] &= ~D.F.SECRET;
    L.flags[i] |= D.F.SEEN;
    L.text[i] = null;
    L.whp[i] = 0;
    // rubble with real momentum
    const n = 110;
    for (let k = 0; k < n; k++) {
      const s = rnd(0.6, 1.25);
      g.part({
        x: tx + rnd(0.05, 0.95), y: ty + rnd(0.05, 0.95), z: rnd(0.05, Hc - 0.05),
        vx: dirX * rnd(1, 5) + rnd(-1.6, 1.6), vy: dirY * rnd(1, 5) + rnd(-1.6, 1.6), vz: rnd(-0.5, 2.5),
        grav: 11, col: true, rest: 0.25, fric: 0.55, rad: 0.03, life: rnd(4, 8), g: rubbleGlyph(L),
        r: base[0] * s, gr: base[1] * s, b: base[2] * s, av: rnd(-12, 12), tumble: Math.random() < 0.4,
      });
    }
    for (let k = 0; k < 10; k++) {
      g.part({
        x: tx + rnd(0.1, 0.9), y: ty + rnd(0.1, 0.9), z: rnd(0.3, Hc), vx: dirX * rnd(0.5, 3) + rnd(-1, 1), vy: dirY * rnd(0.5, 3) + rnd(-1, 1), vz: rnd(0, 2),
        grav: 12, col: true, rest: 0.15, fric: 0.4, rad: 0.08, life: rnd(6, 10), size: rnd(0.12, 0.22), solid: true, g: GL.id('q:15'),
        r: base[0] * 0.8, gr: base[1] * 0.8, b: base[2] * 0.8, lit: true,
      });
    }
    g.smoke(tx + 0.5, ty + 0.5, 0.4, 10, 0.55, [base[0] * 0.6 + 0.25, base[1] * 0.6 + 0.23, base[2] * 0.6 + 0.2], 0.5);
    g.decal(tx + 0.5, ty + 0.5, 0, 0.75, [base[0] * 0.35, base[1] * 0.35, base[2] * 0.35], 0.7, 0);
    g.sound('crumble', tx + 0.5, ty + 0.5);
    g.shake(5);
    g.wave(tx + 0.5, ty + 0.5, 0.35);
    L.bake();
    g.flowT = 0;
  };

  // ---------------------------------------------------------------- pushable bodies (props, casks)
  Ph.bodies = function (g, dt) {
    const L = g.level, P = g.player;
    for (const e of g.ents) {
      if (!e.alive || !e.def.body) continue;
      // the Reader kicks loose things around
      const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy), rr = e.r + 0.25;
      if (d < rr && d > 0.001) {
        const push = (rr - d) * 14 + Math.hypot(P.vx, P.vy) * 0.6;
        e.kx += (dx / d) * push * dt * 10;
        e.ky += (dy / d) * push * dt * 10;
        e.sleep = false;
      }
      if (e.sleep) continue;
      const z0 = e.z0 || 0;
      if (e.vz || e.z > z0 + 0.001) {
        e.vz = (e.vz || 0) - 12 * dt;
        e.z += e.vz * dt;
        if (e.z <= z0) {
          e.z = z0;
          if (e.vz < -2.5) {
            g.sound('thud', e.x, e.y, { vol: 0.4 });
            g.smoke(e.x, e.y, 0.05, 1, 0.15, null, 0.1);
          }
          e.vz = Math.abs(e.vz) > 2 ? -e.vz * 0.3 : 0;
        }
      }
      const ox = e.x, oy = e.y;
      const blocked = L.move(e, e.kx * dt, e.ky * dt, e.r, false);
      if (blocked) {
        if (Math.abs(e.x - ox) < Math.abs(e.kx * dt) * 0.5) e.kx = -e.kx * 0.4;
        if (Math.abs(e.y - oy) < Math.abs(e.ky * dt) * 0.5) e.ky = -e.ky * 0.4;
      }
      const fr = e.z <= z0 + 0.01 ? 5 : 0.5;
      e.kx *= Math.max(0, 1 - fr * dt);
      e.ky *= Math.max(0, 1 - fr * dt);
      e.spin = (e.spin || 0) + Math.hypot(e.kx, e.ky) * dt * 3;
      if (Math.abs(e.kx) + Math.abs(e.ky) < 0.02 && !e.vz && e.z <= z0 + 0.001) e.sleep = true;
    }
  };

  // ---------------------------------------------------------------- hazards and shockwaves
  Ph.hazards = function (g, dt) {
    const P = g.player;
    for (const h of g.hazards) {
      h.t -= dt;
      h.tick = (h.tick || 0) - dt;
      if (h.type === 'fire' && Math.random() < dt * 30 * h.r) {
        const a = rnd(0, G.TAU), r = Math.sqrt(Math.random()) * h.r;
        g.part({ x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r, z: 0.05, vz: rnd(0.8, 1.8), drag: 1, life: rnd(0.3, 0.7), g: GL.ch(G.rand.pick(['*', '^', "'", '.'])), ramp: g.FIRE, add: true, glow: 1 });
      } else if (h.type === 'gas' && Math.random() < dt * 12 * h.r) {
        const a = rnd(0, G.TAU), r = Math.sqrt(Math.random()) * h.r;
        g.part({ x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r, z: rnd(0.05, 0.6), vz: 0.1, drag: 0.8, life: rnd(1, 2), size: rnd(0.25, 0.45), grow: 0.2, g: -1, r: h.col[0], gr: h.col[1], b: h.col[2], add: true, glow: 0.2 });
      }
      if (h.tick > 0) continue;
      h.tick = 0.25;
      if (Math.hypot(P.x - h.x, P.y - h.y) < h.r + 0.2) {
        if (h.dmg) g.hurtPlayer(h.dmg * 0.25, h.x, h.y, h.src || null);
        if (h.luc) g.loseLucidity(h.luc * 0.25, 'gas');
      }
      if (h.burnsAll) for (const e of g.ents) if (e.alive && e.kind === 'enemy' && Math.hypot(e.x - h.x, e.y - h.y) < h.r) g.damageEnemy(e, h.dmg * 0.25, { tick: true });
    }
    g.hazards = g.hazards.filter((h) => h.t > 0);
    for (const s of g.shocks) {
      s.r += s.speed * dt;
      const d = Math.hypot(P.x - s.x, P.y - s.y);
      if (!s.hit && Math.abs(d - s.r) < s.band && P.inv <= 0) {
        s.hit = true;
        g.hurtPlayer(s.dmg, s.x, s.y, s.src || null);
        if (s.luc) g.loseLucidity(s.luc, 'bell');
        g.knock(((P.x - s.x) / (d || 1)) * 6, ((P.y - s.y) / (d || 1)) * 6);
      }
    }
    g.shocks = g.shocks.filter((s) => s.r < s.max);
  };
  Ph.shock = function (g, x, y, max, speed, dmg, col, o) {
    g.shocks.push(Object.assign({ x, y, r: 0.2, max, speed, band: 0.45, dmg, hit: false }, o || {}));
    g.ring(x, y, 0.04, 0.2, max, max / speed, col, { i: 1.3, glyph: GL.id('sym:wave') });
    g.ring(x, y, 0.5, 0.2, max, max / speed, col, { i: 0.7 });
  };
})();
