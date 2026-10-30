'use strict';
// Entities: creatures, bosses, pickups, props and the player's own body.
// A shape is a signed-distance silhouette sampled in world units (X across, Y down from the top).
// It returns 0 for empty, (0,1] for lit body, >1 for emissive parts. The renderer turns those
// samples into glyphs from the creature's own alphabet.
(function () {
  const G = window.G;
  const D = G.Data;
  const E = (G.Ent = { defs: {} });
  const sqrt = Math.sqrt, min = Math.min, max = Math.max, abs = Math.abs, sin = Math.sin, cos = Math.cos;

  // ---- SDF helpers ----
  const circ = (x, y, r) => sqrt(x * x + y * y) - r;
  const ell = (x, y, a, b) => (sqrt((x / a) * (x / a) + (y / b) * (y / b)) - 1) * min(a, b);
  const seg = (px, py, ax, ay, bx, by, r) => {
    const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
    const h = G.clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
    const dx = pax - bax * h, dy = pay - bay * h;
    return sqrt(dx * dx + dy * dy) - r;
  };
  const box = (x, y, w, h) => {
    const dx = abs(x) - w, dy = abs(y) - h;
    return min(max(dx, dy), 0) + sqrt(max(dx, 0) ** 2 + max(dy, 0) ** 2);
  };
  const shade = (d, k) => 0.5 + 0.5 * G.clamp(-d * (k || 10), 0, 1);
  E.sdf = { circ, ell, seg, box, shade };

  function humanoid(X, Y, h, swing, hood) {
    let d = hood ? ell(X, Y - 0.13 * h, 0.1 * h, 0.12 * h) : circ(X, Y - 0.12 * h, 0.085 * h);
    d = min(d, ell(X, Y - 0.38 * h, 0.13 * h, 0.19 * h));
    d = min(d, seg(X, Y, -0.06 * h, 0.55 * h, (-0.08 + swing) * h, 0.98 * h, 0.04 * h));
    d = min(d, seg(X, Y, 0.06 * h, 0.55 * h, (0.08 - swing) * h, 0.98 * h, 0.04 * h));
    d = min(d, seg(X, Y, -0.13 * h, 0.27 * h, (-0.2 - swing * 0.5) * h, 0.6 * h, 0.035 * h));
    d = min(d, seg(X, Y, 0.13 * h, 0.27 * h, (0.2 + swing * 0.5) * h, 0.6 * h, 0.035 * h));
    return d;
  }
  function reader(X, Y, h, swing) {
    // a hooded Reader in a long coat
    let d = ell(X, Y - 0.13 * h, 0.1 * h, 0.12 * h);
    const coat = abs(X) - (0.1 + (Y / h - 0.25) * 0.22) * h;
    d = min(d, max(coat, max(0.25 * h - Y, Y - 0.86 * h)));
    d = min(d, seg(X, Y, -0.05 * h, 0.8 * h, (-0.06 + swing) * h, 0.99 * h, 0.035 * h));
    d = min(d, seg(X, Y, 0.05 * h, 0.8 * h, (0.06 - swing) * h, 0.99 * h, 0.035 * h));
    d = min(d, seg(X, Y, -0.14 * h, 0.3 * h, -0.27 * h, 0.55 * h, 0.035 * h));
    d = min(d, seg(X, Y, 0.14 * h, 0.3 * h, 0.26 * h, 0.45 * h, 0.04 * h));
    return d;
  }

  // ---- shared AI ----
  function wake(e, g) {
    if (e.state !== 'idle') return true;
    const d = g.distP(e);
    if (d < 2.5 || (d < 10 && g.losP(e)) || e.alerted) {
      e.state = 'chase';
      e.st = 0;
      g.codexSee(e.type);
      if (e.def.wakeSound) g.sound(e.def.wakeSound, e.x, e.y);
      return true;
    }
    return false;
  }
  function wander(e, g, dt) {
    e.st -= dt;
    if (e.st <= 0) {
      e.st = G.rand.range(1.5, 4);
      const a = G.rand.range(0, G.TAU), s = G.rand.chance(0.5) ? e.def.speed * 0.3 : 0;
      e.vx = cos(a) * s;
      e.vy = sin(a) * s;
    }
  }
  function seek(e, g, speed) {
    const P = g.player, L = g.level;
    let tx = P.x, ty = P.y;
    if (!g.losP(e)) {
      const W = L.w, cx = Math.floor(e.x), cy = Math.floor(e.y);
      let best = L.flow[cy * W + cx], bx = cx, by = cy;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!L.inb(nx, ny)) continue;
          if (dx && dy && (L.solid(cx + dx, cy) || L.solid(cx, cy + dy))) continue;
          const v = L.flow[ny * W + nx];
          if (v < best) {
            best = v;
            bx = nx;
            by = ny;
          }
        }
      tx = bx + 0.5;
      ty = by + 0.5;
    }
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d > 0.01) {
      e.vx = (dx / d) * speed;
      e.vy = (dy / d) * speed;
    }
  }
  function keepRange(e, g, speed, lo, hi) {
    const P = g.player, d = g.distP(e);
    if (d > hi || !g.losP(e)) return seek(e, g, speed);
    const dx = (P.x - e.x) / d, dy = (P.y - e.y) / d;
    const side = sin(g.time * 0.7 + e.id) > 0 ? 1 : -1;
    const toward = d < lo ? -1 : d > (lo + hi) / 2 ? 0.4 : 0;
    e.vx = (dx * toward - dy * side * 0.7) * speed;
    e.vy = (dy * toward + dx * side * 0.7) * speed;
  }
  function melee(e, g, dt, range, windup, dmg, recover) {
    if (e.state === 'chase' && e.cd <= 0 && g.distP(e) < range) {
      e.state = 'windup';
      e.st = 0;
    }
    if (e.state === 'windup') {
      e.vx *= 0.85;
      e.vy *= 0.85;
      e.st += dt;
      if (e.st >= windup) {
        if (g.distP(e) < range + 0.4) g.hurtPlayer(dmg, e.x, e.y, e);
        g.sound('swipe', e.x, e.y);
        e.state = 'recover';
        e.st = 0;
        e.cd = recover;
      }
      return true;
    }
    if (e.state === 'recover') {
      e.st += dt;
      e.vx *= 0.8;
      e.vy *= 0.8;
      if (e.st > 0.35) e.state = 'chase';
      return true;
    }
    return false;
  }
  E.ai = { wake, wander, seek, keepRange, melee };

  const def = (name, d) => {
    d.type = name;
    E.defs[name] = d;
    return d;
  };
  const hex = G.hex;

  // ======================================================== creatures
  def('wretch', {
    kind: 'enemy', hp: 42, speed: 2.4, r: 0.3, h: 1.0, w: 0.95, col: hex('#d9c3a5'), emit: hex('#ff6a3d'), set: 'sigilA', ink: 3, wakeSound: 'groan',
    shape(u, v, e) {
      const X = u * 0.475, Y = v;
      const s = sin(e.walk) * 0.06;
      const atk = e.state === 'windup' ? min(1, e.st / 0.45) : 0;
      let d = circ(X - 0.06, Y - 0.2, 0.1);
      d = min(d, ell(X, Y - 0.45, 0.17, 0.2));
      d = min(d, seg(X, Y, -0.07, 0.6, -0.1 + s, 0.99, 0.045));
      d = min(d, seg(X, Y, 0.07, 0.6, 0.1 - s, 0.99, 0.045));
      const ay = 0.85 - atk * 0.75;
      d = min(d, seg(X, Y, -0.15, 0.33, -0.33 - s * 0.5, ay, 0.035));
      d = min(d, seg(X, Y, 0.15, 0.33, 0.35 + s * 0.5, ay, 0.035));
      if (d > 0) return 0;
      if (circ(X - 0.1, Y - 0.19, 0.026) < 0 || circ(X - 0.02, Y - 0.19, 0.026) < 0) return 1.6;
      return shade(d) * (0.75 + 0.25 * (1 - v));
    },
    update(e, g, dt) {
      if (!wake(e, g)) return wander(e, g, dt);
      e.cd -= dt;
      e.walk += dt * 7;
      if (melee(e, g, dt, 1.1, 0.45, 12, 0.9)) return;
      seek(e, g, e.def.speed);
      if (G.rand.next() < dt * 0.12) g.sound('groan', e.x, e.y);
    },
  });

  def('moth', {
    kind: 'enemy', hp: 13, speed: 4.6, r: 0.2, h: 0.45, w: 0.75, z: 0.55, col: hex('#c9b38a'), emit: hex('#ffd36a'), set: 'braille', ink: 1, glow: 1,
    shape(u, v, e, t) {
      const X = u * 0.375, Y = v * 0.45;
      const fl = 0.3 + 0.7 * abs(sin(t * 24 + e.id));
      const a = 0.17 * fl, cx = 0.035 + a;
      let d = ell(X, Y - 0.24, 0.035, 0.13);
      d = min(d, ell(X - cx, Y - 0.2, a, 0.15), ell(X + cx, Y - 0.2, a, 0.15));
      d = min(d, seg(X, Y, 0.0, 0.12, 0.08, 0.02, 0.012), seg(X, Y, 0.0, 0.12, -0.08, 0.02, 0.012));
      if (d > 0) return 0;
      if (circ(abs(X) - cx, Y - 0.2, 0.045 * fl + 0.01) < 0) return 1.8;
      return shade(d, 20) * 0.9;
    },
    update(e, g, dt) {
      const P = g.player;
      e.z = 0.5 + sin(g.time * 3 + e.id) * 0.15;
      e.cd -= dt;
      const d = g.distP(e);
      if (e.flee > 0) {
        e.flee -= dt;
        e.vx = ((e.x - P.x) / d) * 4;
        e.vy = ((e.y - P.y) / d) * 4;
        return;
      }
      if (P.lanternOn && d < 15 && (d < 4 || g.losP(e))) {
        if (e.state === 'idle') {
          e.state = 'chase';
          g.codexSee('moth');
        }
        seek(e, g, e.def.speed);
        const j = sin(g.time * 9 + e.id * 3) * 2.5;
        e.vx += -e.vy * j * 0.3;
        e.vy += e.vx * j * 0.3;
        if (d < 0.7 && e.cd <= 0) {
          P.oil = max(0, P.oil - 9);
          g.hurtPlayer(4, e.x, e.y, e);
          g.msg('A MOTH DRINKS YOUR OIL', [1, 0.8, 0.4]);
          e.cd = 1.4;
          e.flee = 0.9;
        }
        if (G.rand.next() < dt * 0.6) g.sound('flutter', e.x, e.y);
      } else {
        e.state = 'idle';
        wander(e, g, dt);
      }
    },
  });

  def('watcher', {
    kind: 'enemy', hp: 95, speed: 3.5, r: 0.32, h: 2.1, w: 0.95, col: hex('#9c9a8f'), emit: hex('#ff2a2a'), set: 'sigilB', ink: 6, glow: 1.2, crawl: false,
    shape(u, v, e) {
      const X = u * 0.475, Y = v * 2.1;
      let d = seg(X, Y, 0, 0.66, 0, 2.06, 0.05);
      const hw = 0.06 + (Y - 0.9) * 0.16;
      if (Y > 0.9) d = min(d, abs(X) - hw);
      d = min(d, seg(X, Y, -0.08, 0.8, -0.3, 1.7, 0.025), seg(X, Y, 0.08, 0.8, 0.3, 1.7, 0.025));
      const ec = circ(X, Y - 0.38, 0.3);
      d = min(d, ec);
      if (d > 0) return 0;
      if (ec < 0) {
        const px = e.data.px || 0;
        const ic = circ(X - px * 0.08, Y - 0.38, 0.17);
        if (circ(X - px * 0.1, Y - 0.38, 0.07) < 0) return 0.04;
        if (ic < 0) return e.data.gaze ? 2.0 : 1.4;
        return 0.95;
      }
      return shade(d) * 0.8;
    },
    update(e, g, dt) {
      if (!wake(e, g)) return;
      const P = g.player, d = g.distP(e);
      e.cd -= dt;
      e.data.px = G.clamp(-(e.camX || 0) * 2, -1, 1);
      const seen = e.seen && g.losP(e);
      e.data.gaze = seen ? 1 : 0;
      if (seen) {
        e.vx = e.vy = 0;
        if (!P.mods.gazeImmune && d < 16) {
          g.loseLucidity(4.2 * dt, 'gaze');
          g.gaze = max(g.gaze, 1 - d / 16);
        }
        return;
      }
      seek(e, g, e.def.speed);
      if (d < 1.25 && e.cd <= 0) {
        g.hurtPlayer(22, e.x, e.y, e);
        g.sound('shriek', e.x, e.y);
        e.cd = 1.1;
      }
    },
  });

  def('hollow', {
    kind: 'enemy', hp: 55, speed: 2.9, r: 0.3, h: 1.15, w: 0.85, col: hex('#cfe6ff'), emit: hex('#bfe0ff'), set: 'sigilB', ink: 4, glow: 1.4, minLight: 0.5,
    shape(u, v, e, t) {
      const X = u * 0.425, Y = v * 1.15;
      const d = humanoid(X, Y, 1.15, sin(e.walk) * 0.05, true);
      if (e.vis) {
        if (abs(d) < 0.028) return 1.55;
        return 0;
      }
      if (d < 0 && G.hash2(Math.floor(u * 18), Math.floor(v * 26), Math.floor(t * 14)) > 0.94) return 0.3;
      return 0;
    },
    update(e, g, dt) {
      const P = g.player, d = g.distP(e);
      const lit = (P.lanternOn && d < P.lampRadius() * 0.95) || g.lightAt(e.x, e.y) > 0.35;
      e.vis = !lit || P.luc < 25 ? 1 : 0;
      if (!wake(e, g)) return;
      e.cd -= dt;
      e.walk += dt * 6;
      if (e.state === 'lunge') {
        e.st += dt;
        if (d < 0.8) {
          g.hurtPlayer(15, e.x, e.y, e);
          e.state = 'chase';
          e.cd = 2.2;
        }
        if (e.st > 0.3) {
          e.state = 'chase';
          e.cd = 2.2;
        }
        return;
      }
      seek(e, g, e.def.speed);
      if (d < 3.2 && e.cd <= 0 && g.losP(e)) {
        e.state = 'lunge';
        e.st = 0;
        e.vx = ((P.x - e.x) / d) * 9;
        e.vy = ((P.y - e.y) / d) * 9;
        g.sound('flutter', e.x, e.y);
      }
    },
  });

  def('drowned', {
    kind: 'enemy', hp: 48, speed: 3.2, r: 0.3, h: 1.05, w: 0.9, col: hex('#7fb5a4'), emit: hex('#d0ff9a'), set: 'blocks', ink: 3,
    shape(u, v, e) {
      const X = u * 0.45, Y = v * 1.05;
      if (e.z + (1 - v) * e.h < 0.02) return 0;
      let d = humanoid(X, Y, 1.05, sin(e.walk) * 0.04, false);
      d = min(d, ell(X, Y - 0.42, 0.17, 0.22));
      for (let k = -2; k <= 2; k++) d = min(d, seg(X, Y, k * 0.04, 0.05, k * 0.06, 0.32 + abs(k) * 0.03, 0.012));
      if (d > 0) return 0;
      if (circ(abs(X) - 0.035, Y - 0.12, 0.02) < 0) return 1.7;
      return shade(d) * 0.85;
    },
    hurt(e, g, dmg) {
      if ((e.data.surf || 0) < 0.35) {
        g.burst(e.x, e.y, 0.05, 4, [0.4, 0.8, 0.9], '~', 1.5);
        return 0;
      }
      return dmg;
    },
    update(e, g, dt) {
      const L = g.level, P = g.player, d = g.distP(e);
      const dd = e.data;
      if (dd.surf === undefined) {
        dd.surf = 0;
        dd.mode = 'sub';
      }
      e.z = -(1 - dd.surf) * e.h * 0.95;
      const onWater = L.flags[Math.floor(e.y) * L.w + Math.floor(e.x)] & D.F.WATER;
      if (!wake(e, g)) return;
      e.cd -= dt;
      e.walk += dt * 4;
      if (dd.mode === 'sub') {
        seek(e, g, e.def.speed);
        if (G.rand.next() < dt * 4) g.part({ x: e.x + G.rand.range(-0.3, 0.3), y: e.y + G.rand.range(-0.3, 0.3), z: 0.02, g: G.Glyphs.id('sym:ring'), r: 0.5, gr: 0.9, b: 0.9, life: 0.6, glow: 0.3 });
        if (G.rand.next() < dt * 0.8) g.sound('bubble', e.x, e.y);
        if (d < 2.3 || !onWater) dd.mode = 'rise';
      } else if (dd.mode === 'rise') {
        e.vx = e.vy = 0;
        dd.surf = min(1, dd.surf + dt * 2.6);
        if (dd.surf >= 1) {
          dd.mode = 'up';
          dd.t = 2.6;
          g.sound('splash', e.x, e.y);
        }
      } else if (dd.mode === 'up') {
        dd.t -= dt;
        if (!melee(e, g, dt, 1.15, 0.35, 14, 0.8)) seek(e, g, 1.6);
        if (dd.t <= 0 && e.state !== 'windup' && onWater) dd.mode = 'sink';
      } else {
        e.vx = e.vy = 0;
        dd.surf = max(0, dd.surf - dt * 2);
        if (dd.surf <= 0) dd.mode = 'sub';
      }
    },
  });

  def('choir', {
    kind: 'enemy', hp: 75, speed: 1.8, r: 0.4, h: 1.0, w: 1.3, z: 0.45, col: hex('#e6d7ff'), emit: hex('#ff4fd8'), set: 'sigilA', ink: 6, glow: 1.3,
    shape(u, v, e, t) {
      const X = u * 0.65, Y = v;
      const n = 4, inhale = e.state === 'inhale' ? min(1, e.st / 0.75) : 0;
      let best = 1, hit = -1;
      for (let k = 0; k < n; k++) {
        const a = t * 0.9 + (k * G.TAU) / n + e.id;
        const cx = cos(a) * (0.38 - inhale * 0.15), cy = 0.5 + sin(a) * 0.17;
        const d = circ(X - cx, Y - cy, 0.14);
        if (d < best) {
          best = d;
          hit = k;
          if (d < 0) {
            if (ell(X - cx, Y - cy - 0.05, 0.05, 0.06 + inhale * 0.03) < 0) return inhale > 0 || e.state === 'sing' ? 1.9 : 0.05;
            return shade(d, 14);
          }
        }
      }
      if (inhale > 0 && abs(circ(X, Y - 0.5, 0.55 - inhale * 0.3)) < 0.02) return 1.4;
      void hit;
      return 0;
    },
    update(e, g, dt) {
      if (!wake(e, g)) return;
      const P = g.player, d = g.distP(e);
      e.z = 0.4 + sin(g.time * 1.3 + e.id) * 0.1;
      if (d < 6.5) {
        g.loseLucidity(1.4 * dt, 'song');
        g.choir = max(g.choir, 1 - d / 6.5);
      }
      e.cd -= dt;
      if (e.state === 'inhale') {
        e.vx *= 0.9;
        e.vy *= 0.9;
        e.st += dt;
        if (e.st >= 0.75) {
          const a = Math.atan2(P.y - e.y, P.x - e.x);
          for (let k = -1; k <= 1; k++) {
            const aa = a + k * 0.28;
            g.proj({ x: e.x, y: e.y, z: 0.6, vx: cos(aa) * 5.2, vy: sin(aa) * 5.2, dmg: 10, team: 'enemy', life: 4.5, homing: 1.3, col: [1, 0.35, 0.85], r: 0.2 });
          }
          g.sound('note', e.x, e.y);
          e.state = 'sing';
          e.st = 0;
          e.cd = G.rand.range(2.4, 3.2);
        }
        return;
      }
      if (e.state === 'sing') {
        e.st += dt;
        if (e.st > 0.4) e.state = 'chase';
      }
      keepRange(e, g, e.def.speed, 4.5, 8.5);
      if (e.cd <= 0 && d < 13 && g.losP(e)) {
        e.state = 'inhale';
        e.st = 0;
        g.sound('sing', e.x, e.y);
      }
    },
  });

  def('echo', {
    kind: 'enemy', hp: 62, speed: 2.8, r: 0.3, h: 1.15, w: 1.1, col: hex('#7ff6ff'), emit: hex('#ffffff'), set: 'box', ink: 6, glow: 1,
    shape(u, v, e, t) {
      const X = u * 0.55, Y = v * 1.15;
      const d0 = reader(X, Y, 1.15, sin(e.walk) * 0.05);
      if (d0 < 0) return abs(d0) < 0.02 ? 1.3 : shade(d0) * 0.8;
      const off = sin(t * 2.3 + e.id) * 0.17;
      if (reader(X - off, Y, 1.15, 0) < 0) return 0.28;
      return 0;
    },
    update(e, g, dt) {
      if (!wake(e, g)) return;
      const P = g.player;
      e.walk += dt * 5;
      keepRange(e, g, e.def.speed, 3.5, 7);
      const q = e.data.q || (e.data.q = []);
      for (let i = q.length - 1; i >= 0; i--) {
        q[i].t -= dt;
        if (q[i].t <= 0) {
          const a = Math.atan2(P.y - e.y, P.x - e.x) + G.rand.range(-0.05, 0.05);
          g.proj({ x: e.x, y: e.y, z: 0.6, vx: cos(a) * 13, vy: sin(a) * 13, dmg: q[i].dmg, team: 'enemy', life: 2.5, col: [0.5, 1, 1], r: 0.15 });
          g.sound('quill', e.x, e.y, { vol: 0.5 });
          q.splice(i, 1);
        }
      }
    },
    onShot(e, g, dmg) {
      if (e.state === 'idle' || g.distP(e) > 22 || !g.losP(e)) return;
      if (e.data.q && e.data.q.length > 24) return;
      (e.data.q || (e.data.q = [])).push({ t: 0.35, dmg: min(10, max(3, dmg * 0.5)) });
    },
  });

  def('lurker', {
    kind: 'enemy', hp: 52, speed: 4.3, r: 0.35, h: 0.85, w: 1.7, col: hex('#a79bb8'), emit: hex('#ffef5a'), set: 'sigilB', ink: 5, glow: 1,
    visible(e, s) {
      return abs(s.camX) > 0.48;
    },
    shape(u, v, e, t) {
      const X = u * 0.85, Y = v * 0.85;
      let d = ell(X, Y - 0.45, 0.17, 0.12);
      const hd = circ(X, Y - 0.33, 0.08);
      d = min(d, hd);
      for (let k = 0; k < 4; k++)
        for (let s = -1; s <= 1; s += 2) {
          const kx = s * (0.28 + k * 0.12), ky = 0.1 + k * 0.05 + sin(t * 9 + k + e.id) * 0.03;
          const fx = s * (0.42 + k * 0.14), fy = 0.98;
          d = min(d, seg(X, Y, s * 0.1, 0.45, kx, ky, 0.02), seg(X, Y, kx, ky, fx, fy, 0.018));
        }
      if (d > 0) return 0;
      if (hd < 0) {
        for (let k = 0; k < 6; k++) if (circ(X - ((k % 3) - 1) * 0.04, Y - 0.31 - (k > 2 ? 0.035 : 0), 0.016) < 0) return 1.9;
      }
      return shade(d, 16) * 0.85;
    },
    update(e, g, dt) {
      if (!wake(e, g)) return;
      const d = g.distP(e);
      e.cd -= dt;
      const frozen = e.onScreen && abs(e.camX || 0) < 0.48 && g.losP(e);
      e.data.frozen = frozen;
      if (frozen) {
        e.vx = e.vy = 0;
        return;
      }
      seek(e, g, e.def.speed);
      if (G.rand.next() < dt * 1.2) g.sound('click', e.x, e.y);
      if (d < 1.05 && e.cd <= 0) {
        g.hurtPlayer(16, e.x, e.y, e);
        g.loseLucidity(6, 'lurker');
        e.cd = 1.2;
      }
    },
  });

  def('maw', {
    kind: 'enemy', hp: 270, speed: 1.5, r: 0.65, h: 1.7, w: 1.8, col: hex('#b58a7a'), emit: hex('#ff3b2f'), set: 'sigilA', ink: 14, glow: 1.2, heavy: true, wakeSound: 'roar',
    shape(u, v, e, t) {
      const X = u * 0.9, Y = v * 1.7;
      const body = circ(X, Y - 0.9, 0.78);
      let d = min(body, seg(X, Y, -0.35, 1.4, -0.45, 1.69, 0.08), seg(X, Y, 0.35, 1.4, 0.45, 1.69, 0.08));
      if (d > 0) return 0;
      const o = e.data.mouth || 0;
      const mb = 0.04 + o * 0.32;
      const m = ell(X, Y - 1.0, 0.55, mb);
      if (m < 0) {
        const tooth = 0.07 * (0.4 + 0.6 * abs(sin(X * 38)));
        if (Y - (1.0 - mb) < tooth || 1.0 + mb - Y < tooth) return 0.95;
        return o > 0.2 ? 1.25 + 0.3 * sin(t * 20) : 0.05;
      }
      for (let k = 0; k < 7; k++) if (circ(X - (k - 3) * 0.12, Y - 0.45 - abs(k - 3) * 0.04, 0.035) < 0) return 1.8;
      return shade(d, 6) * (0.65 + 0.35 * sin(X * 9 + Y * 7 + t));
    },
    hurt(e, g, dmg) {
      return e.state === 'stunned' ? dmg * 2 : dmg;
    },
    update(e, g, dt) {
      if (!wake(e, g)) return;
      const P = g.player, d = g.distP(e), dd = e.data;
      e.cd -= dt;
      dd.mouth = G.lerp(dd.mouth || 0, e.state === 'roar' ? 1 : e.state === 'charge' ? 0.8 : e.state === 'windup' ? 0.6 : 0.1, min(1, dt * 8));
      if (e.state === 'roar') {
        e.vx = e.vy = 0;
        e.st += dt;
        if (e.st > 0.8) {
          e.state = 'charge';
          e.st = 0;
          const a = Math.atan2(P.y - e.y, P.x - e.x);
          dd.cx = cos(a);
          dd.cy = sin(a);
        }
        return;
      }
      if (e.state === 'charge') {
        e.st += dt;
        e.vx = dd.cx * 7.8;
        e.vy = dd.cy * 7.8;
        if (d < 1.2) {
          g.hurtPlayer(30, e.x, e.y, e);
          g.knock(dd.cx * 9, dd.cy * 9);
          e.state = 'chase';
          e.cd = 3;
        } else if (e.blocked || e.st > 1.4) {
          e.state = e.blocked ? 'stunned' : 'chase';
          e.st = 0;
          if (e.blocked) {
            g.shake(6);
            g.sound('thud', e.x, e.y, { vol: 2 });
            g.burst(e.x, e.y, 1, 10, [0.8, 0.6, 0.5], '*', 3);
          }
          e.cd = 3.5;
        }
        return;
      }
      if (e.state === 'stunned') {
        e.vx = e.vy = 0;
        e.st += dt;
        if (e.st > 1.7) e.state = 'chase';
        return;
      }
      if (melee(e, g, dt, 1.5, 0.5, 20, 1.2)) return;
      seek(e, g, e.def.speed);
      if (e.cd <= 0 && d > 3 && d < 10 && g.losP(e)) {
        e.state = 'roar';
        e.st = 0;
        g.sound('roar', e.x, e.y);
        g.shake(3);
      }
    },
  });

  def('phantasm', {
    kind: 'enemy', hp: 1, speed: 2.4, r: 0.3, h: 1.0, w: 1.0, col: hex('#9a9aa6'), emit: hex('#c0c0d0'), set: 'sigilA', ink: 0, flicker: 0.35, phantom: true,
    shape(u, v, e, t) {
      const m = E.defs[e.data.mimic || 'wretch'];
      return m.shape(u, v, e, t);
    },
    hurt(e, g) {
      g.dissolve(e);
      return 0;
    },
    update(e, g, dt) {
      const m = E.defs[e.data.mimic || 'wretch'];
      e.h = m.h;
      e.w = m.w;
      e.z = m.z || 0;
      e.walk += dt * 6;
      if (e.state === 'idle') e.state = 'chase';
      seek(e, g, e.def.speed);
      e.data.life = (e.data.life || 30) - dt;
      if (g.distP(e) < 0.7 || e.data.life <= 0) {
        if (g.distP(e) < 0.7) {
          g.loseLucidity(3, 'phantasm');
          g.msg('IT WAS NEVER THERE', [0.7, 0.7, 0.8]);
        }
        g.dissolve(e);
      }
    },
  });

  // ======================================================== bosses
  def('redactor', {
    kind: 'enemy', boss: true, hp: 2600, speed: 1.6, r: 0.75, h: 2.7, w: 1.5, col: hex('#3b3434'), emit: hex('#ff2020'), set: 'blocks', ink: 70, glow: 1.4, minLight: 0.4, heavy: true,
    shape(u, v, e, t) {
      const X = u * 0.75, Y = v * 2.7;
      const hw = 0.16 + max(0, Y - 0.6) * 0.2;
      let d = Y > 0.55 ? abs(X) - hw : 1;
      const head = box(X, Y - 0.32, 0.17, 0.22);
      d = min(d, head, seg(X, Y, 0.5, 0.35, 0.5, 2.6, 0.045), seg(X, Y, -0.2, 0.7, 0.48, 1.1, 0.04));
      if (d > 0) return 0;
      if (head < 0) {
        if (abs(Y - 0.33) < 0.035 && abs(X) < 0.13) return 1.9 + 0.2 * sin(t * 9);
        return 0.06;
      }
      if (abs(X - 0.5) < 0.05 && Y < 0.6 && Y > 0.3) return 1.6;
      return shade(d, 5) * (0.55 + 0.45 * G.hash2(Math.floor(X * 9), Math.floor(Y * 9), 3));
    },
    update(e, g, dt) {
      if (!wake(e, g)) return;
      g.bossRef = e;
      const P = g.player, dd = e.data, fr = e.hp / e.maxHp;
      const phase = fr < 0.33 ? 3 : fr < 0.66 ? 2 : 1;
      if (dd.phase !== phase) {
        dd.phase = phase;
        if (phase > 1) {
          g.msg(phase === 2 ? 'THE REDACTOR STRIKES YOU FROM THE RECORD' : 'THE REDACTOR BEGINS TO CENSOR EVERYTHING', [1, 0.3, 0.3]);
          g.shake(8);
        }
      }
      ['fan', 'bar', 'sum', 'blink'].forEach((k) => (dd[k] = (dd[k] === undefined ? G.rand.range(1, 3) : dd[k]) - dt));
      // drift to keep distance
      const d = g.distP(e);
      const want = 6;
      const k = d > want ? 1 : -0.6;
      e.vx = ((P.x - e.x) / d) * e.def.speed * k + cos(g.time * 0.5) * 0.6;
      e.vy = ((P.y - e.y) / d) * e.def.speed * k + sin(g.time * 0.5) * 0.6;
      if (dd.fan <= 0) {
        const a = Math.atan2(P.y - e.y, P.x - e.x), n = 5 + phase * 2;
        for (let i = 0; i < n; i++) {
          const aa = a + (i - (n - 1) / 2) * 0.13;
          g.proj({ x: e.x, y: e.y, z: 1.0, vx: cos(aa) * 8.5, vy: sin(aa) * 8.5, dmg: 11, team: 'enemy', life: 3, col: [1, 0.15, 0.1], r: 0.2 });
        }
        g.sound('redact', e.x, e.y);
        dd.fan = 3.4 - phase * 0.5;
      }
      if (dd.bar <= 0) {
        g.redact(2 + phase);
        dd.bar = 10 - phase * 1.5;
      }
      if (phase >= 2 && dd.sum <= 0) {
        for (let i = 0; i < 1 + phase; i++) {
          const a = G.rand.range(0, G.TAU), A = g.level.arena;
          g.spawn('wretch', A.cx + cos(a) * (A.r - 2), A.cy + sin(a) * (A.r - 2), { state: 'chase' });
        }
        dd.sum = 13;
      }
      if (dd.blink <= 0) {
        const A = g.level.arena;
        for (let tries = 0; tries < 20; tries++) {
          const a = G.rand.range(0, G.TAU), r = G.rand.range(3, A.r - 3);
          const nx = A.cx + cos(a) * r, ny = A.cy + sin(a) * r;
          if (!g.level.solid(Math.floor(nx), Math.floor(ny)) && Math.hypot(nx - P.x, ny - P.y) > 4) {
            g.burst(e.x, e.y, 1.3, 30, [0.1, 0.05, 0.05], 'sigil', 4);
            e.x = nx;
            e.y = ny;
            g.burst(e.x, e.y, 1.3, 30, [1, 0.2, 0.2], 'sigil', 4);
            break;
          }
        }
        dd.blink = 11 - phase;
      }
    },
  });

  def('seal', {
    kind: 'enemy', boss: true, sub: true, hp: 420, speed: 0, r: 0.45, h: 2.0, w: 0.9, col: hex('#1a1a1a'), emit: hex('#ff1d1d'), set: 'box', ink: 10, glow: 1.5, minLight: 0.2, heavy: true, codex: 'unwritten',
    shape(u, v, e, t) {
      const X = u * 0.45, Y = v * 2.0;
      const hw = Y < 0.3 ? (Y / 0.3) * 0.2 : 0.2 + (Y - 0.3) * 0.08;
      const d = abs(X) - hw;
      if (d > 0) return 0;
      if (Y > 0.6 && Y < 1.4 && abs(X) < 0.13) {
        const b = G.hash2(Math.floor(X * 30 + 9), Math.floor(Y * 18), e.id + Math.floor(t * 2));
        if (b > 0.55) return 1.6 + 0.3 * sin(t * 5 + Y * 8);
      }
      return shade(d, 12) * 0.9;
    },
    update(e, g) {
      e.state = 'chase';
    },
    onDeath(e, g) {
      g.sound('seal', e.x, e.y);
      g.shake(10);
      const left = g.ents.filter((x) => x.alive && x.type === 'seal' && x !== e).length;
      g.msg(left ? `A SEAL BREAKS. ${left} REMAIN.` : 'THE LAST SEAL BREAKS. THE HEART IS OPEN.', [1, 0.3, 0.3]);
      g.flash([1, 1, 1], 0.6);
    },
  });

  def('heart', {
    kind: 'enemy', boss: true, hp: 3800, speed: 0.9, r: 0.9, h: 2.4, w: 2.4, z: 0.4, col: hex('#120808'), emit: hex('#ff2a2a'), set: 'sigilB', ink: 0, glow: 1.6, minLight: 0.15, heavy: true, codex: 'unwritten',
    shape(u, v, e, t) {
      const X = u * 1.2, Y = v * 2.4 - 1.2;
      const r = sqrt(X * X + Y * Y);
      const pr = 0.78 + 0.06 * sin(t * 3);
      if (r > pr) {
        if (e.data.shield && abs(r - 1.08) < 0.035) return 1.4 + 0.3 * sin(Math.atan2(Y, X) * 6 + t * 3);
        return 0;
      }
      if (r < 0.24) {
        if (abs(X) < 0.05 && abs(Y) < 0.2) return 0.02;
        return 2.1;
      }
      const ring = 0.5 + 0.5 * sin(r * 30 - t * 5);
      return ring > 0.55 ? 1.15 + ring * 0.3 : 0.15 + ring * 0.4;
    },
    hurt(e, g, dmg) {
      if (e.data.shield) {
        g.burst(e.x, e.y, 1.6, 3, [1, 0.3, 0.3], '*', 2);
        if (!e.data.warned) {
          e.data.warned = true;
          g.msg('THE HEART IS SEALED. BREAK THE FOUR SEALS.', [1, 0.4, 0.4]);
        }
        return 0;
      }
      return dmg;
    },
    update(e, g, dt) {
      if (e.state === 'idle') {
        e.state = 'chase';
        g.codexSee('unwritten');
      }
      g.bossRef = e;
      const P = g.player, dd = e.data, A = g.level.arena;
      const seals = g.ents.filter((x) => x.alive && x.type === 'seal').length;
      dd.shield = seals > 0;
      const fr = e.hp / e.maxHp;
      const phase = seals > 0 ? 1 : fr > 0.35 ? 2 : 3;
      if (dd.phase !== phase) {
        dd.phase = phase;
        if (phase === 2) g.level.shiftActive = true;
        if (phase === 3) g.msg('THE PAGE IS EMPTYING. STRIKE THE HEART.', [1, 1, 1]);
      }
      g.fx.collapseTarget = phase === 3 ? 0.55 * (1 - fr / 0.35) + 0.15 : 0;
      ['rain', 'ring', 'sum'].forEach((k) => (dd[k] = (dd[k] === undefined ? 2 : dd[k]) - dt));
      if (dd.rain <= 0) {
        const n = phase === 1 ? 2 : 3;
        for (let i = 0; i < n; i++) g.omen(P.x + G.rand.range(-2.5, 2.5), P.y + G.rand.range(-2.5, 2.5), 1.0, 16);
        dd.rain = phase === 1 ? 1.5 : 2.2;
      }
      if (phase >= 2 && dd.ring <= 0) {
        const n = 14, off = g.time;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * G.TAU;
          g.proj({ x: e.x, y: e.y, z: 1.2, vx: cos(a) * 6, vy: sin(a) * 6, dmg: 12, team: 'enemy', life: 5, col: [1, 0.2, 0.2], r: 0.22 });
        }
        g.sound('note', e.x, e.y, { vol: 2 });
        dd.ring = phase === 3 ? 1.6 : 2.6;
      }
      if (phase >= 2 && dd.sum <= 0) {
        const types = ['lurker', 'echo', 'wretch', 'choir'];
        for (let i = 0; i < 2; i++) {
          const a = G.rand.range(0, G.TAU);
          g.spawn(G.rand.pick(types), A.cx + cos(a) * (A.r - 2), A.cy + sin(a) * (A.r - 2), { state: 'chase' });
        }
        dd.sum = 11;
      }
      if (phase === 3) {
        const d = g.distP(e);
        e.vx = ((P.x - e.x) / d) * 0.9;
        e.vy = ((P.y - e.y) / d) * 0.9;
      } else e.vx = e.vy = 0;
    },
  });

  // ======================================================== projectiles
  def('orb', {
    kind: 'proj', r: 0.15, h: 0.4, w: 0.4, col: [1, 1, 1], set: 'braille', glow: 1.5,
    shape(u, v) {
      const r = sqrt(u * u + (v * 2 - 1) * (v * 2 - 1));
      if (r > 1) return 0;
      return r < 0.45 ? 2.0 : 1.35;
    },
  });

  // ======================================================== the Reader (you)
  def('avatar', {
    kind: 'avatar', r: 0.2, h: 1.1, w: 0.95, col: hex('#7b6a58'), emit: hex('#ffcf73'), set: 'asciiBold', glow: 1.2, minLight: 0.45, crawl: false,
    shape(u, v, e, t) {
      const X = u * 0.475, Y = v * 1.1;
      const P = e.player;
      const d = reader(X, Y, 1.1, sin(e.walk) * 0.06);
      const lamp = circ(X + 0.3, Y - 0.62, 0.07);
      if (lamp < 0) return P && P.lanternOn ? 1.9 + 0.2 * sin(t * 13) : 0.4;
      if (seg(X, Y, -0.3, 0.55, -0.3, 0.6, 0.008) < 0) return 0.6;
      if (d > 0) return 0;
      if (P && P.recoil > 0.05 && circ(X - 0.3, Y - 0.42, 0.1) < 0) return 2.2;
      if (abs(X) < 0.06 && abs(Y - 0.14) < 0.03) return 0.05;
      return shade(d, 14) * (0.6 + 0.4 * (Y < 0.3 ? 0.6 : 1));
    },
  });

  // ======================================================== pickups and things
  function pickup(name, o) {
    return def(name, Object.assign({ kind: 'pickup', r: 0.3, set: 'asciiBold', glow: 1, crawl: false, minLight: 0.5 }, o));
  }
  pickup('salve', {
    h: 0.4, w: 0.36, col: hex('#e9d9c4'), emit: hex('#ff4747'),
    shape(u, v) {
      const X = u * 0.18, Y = v * 0.4;
      const d = min(box(X, Y - 0.26, 0.11, 0.12), box(X, Y - 0.1, 0.06, 0.04));
      if (d > 0) return 0;
      if ((abs(X) < 0.025 && abs(Y - 0.26) < 0.07) || (abs(Y - 0.26) < 0.025 && abs(X) < 0.07)) return 1.8;
      return shade(d, 30);
    },
    touch(e, g) {
      const P = g.player;
      if (P.hp >= P.maxHp) return false;
      P.hp = min(P.maxHp, P.hp + 30);
      g.msg('+30 VITAE', [1, 0.4, 0.4]);
      return true;
    },
  });
  pickup('verse', {
    h: 0.3, w: 0.5, col: hex('#efe2c0'), emit: hex('#ff9d3d'),
    shape(u, v) {
      const X = u * 0.25, Y = v * 0.3;
      const d = seg(X, Y, -0.17, 0.2, 0.17, 0.2, 0.08);
      if (d > 0) return 0;
      if (abs(X) < 0.03) return 1.6;
      return shade(d, 30);
    },
    touch(e, g) {
      return g.player.addAmmo('verse', 8, 'VERSES');
    },
  });
  pickup('letters', {
    h: 0.32, w: 0.4, col: hex('#9fd2ff'), emit: hex('#bff3ff'),
    shape(u, v, e, t) {
      const X = u * 0.2, Y = v * 0.32;
      const d = box(X, Y - 0.18, 0.15, 0.13);
      if (d > 0) return 0;
      return G.hash2(Math.floor(X * 40 + 9), Math.floor(Y * 30), Math.floor(t * 4)) > 0.6 ? 1.6 : 0.3;
    },
    touch(e, g) {
      return g.player.addAmmo('letters', 50, 'LETTERS');
    },
  });
  pickup('oil', {
    h: 0.45, w: 0.36, col: hex('#8a7a55'), emit: hex('#ffd24a'),
    shape(u, v) {
      const X = u * 0.18, Y = v * 0.45;
      const d = min(circ(X, Y - 0.3, 0.14), box(X, Y - 0.1, 0.04, 0.08));
      if (d > 0) return 0;
      if (circ(X, Y - 0.32, 0.09) < 0) return 1.7;
      return shade(d, 30);
    },
    touch(e, g) {
      return g.player.addAmmo('oil', 35, 'OIL');
    },
  });
  pickup('ink', {
    h: 0.28, w: 0.22, col: hex('#4a3cff'), emit: hex('#8f7bff'), glow: 1.4,
    shape(u, v) {
      const X = u * 0.11, Y = v * 0.28;
      const d = min(circ(X, Y - 0.19, 0.075), seg(X, Y, 0, 0.04, 0, 0.16, 0.035));
      return d > 0 ? 0 : 1.5;
    },
    touch(e, g) {
      g.gainInk(e.val || 2);
      return true;
    },
  });
  pickup('weapon', {
    h: 0.6, w: 0.7, col: hex('#ffffff'), emit: hex('#ffffff'), glow: 1.6,
    shape(u, v, e, t) {
      const X = u * 0.35, Y = v * 0.6 - 0.3;
      const a = t * 2;
      const rx = X * cos(a) * 1.4;
      const d = abs(rx) + abs(Y) - 0.26;
      if (d > 0) return 0;
      return d > -0.04 ? 1.9 : 0.25;
    },
    touch(e, g) {
      return g.player.giveWeapon(e.weapon);
    },
  });
  pickup('relicdrop', {
    h: 0.6, w: 0.7, col: hex('#ffd76a'), emit: hex('#ffd76a'), glow: 1.6,
    shape(u, v, e, t) {
      const X = u * 0.35, Y = v * 0.6 - 0.3;
      const d = abs(X * cos(t * 1.5) * 1.3) + abs(Y) - 0.24;
      return d > 0 ? 0 : d > -0.05 ? 1.9 : 0.5;
    },
    touch(e, g) {
      g.offerRelics(2);
      return true;
    },
  });

  function thing(name, o) {
    return def(name, Object.assign({ kind: 'thing', r: 0.35, set: 'ascii', glow: 1, crawl: false, solid: true }, o));
  }
  thing('brazier', {
    h: 1.0, w: 0.75, col: hex('#7d6e5c'), emit: hex('#ffa53a'), glow: 1.5,
    shape(u, v, e, t) {
      const X = u * 0.375, Y = v * 1.0;
      let d = min(ell(X, Y - 0.5, 0.3, 0.1), seg(X, Y, 0, 0.55, 0, 0.98, 0.04), seg(X, Y, -0.18, 0.99, 0.18, 0.99, 0.03));
      if (e.lit) {
        const fl = 0.42 + 0.06 * sin(t * 17 + Y * 20);
        const f = ell(X + sin(t * 9 + Y * 14) * 0.03, Y - 0.27, 0.13 * (Y / 0.45 + 0.2), fl * 0.5);
        if (f < 0 && Y < 0.48) return 1.6 + 0.4 * (1 - Y / 0.48);
      }
      if (d > 0) return 0;
      return shade(d, 20);
    },
    prompt(e) {
      return e.lit ? null : 'LIGHT THE BRAZIER';
    },
    interact(e, g) {
      if (e.lit) return;
      e.lit = true;
      g.level.lights.push({ x: e.x, y: e.y, rad: 7, i: 1.2, c: [1, 0.65, 0.3] });
      g.level.bake();
      g.sound('brazier', e.x, e.y);
      g.msg('THE FLAME STEADIES YOUR MIND', [1, 0.7, 0.3]);
      g.burst(e.x, e.y, 0.6, 20, [1, 0.6, 0.2], '*', 2.5);
    },
  });
  thing('lectern', {
    h: 1.0, w: 0.8, col: hex('#6b4a2c'), emit: hex('#fff2c9'), glow: 0.8,
    shape(u, v, e, t) {
      const X = u * 0.4, Y = v * 1.0;
      const book = box(X, Y - 0.3, 0.3, 0.05);
      const d = min(book, seg(X, Y, 0, 0.35, 0, 0.98, 0.05), seg(X, Y, -0.2, 0.99, 0.2, 0.99, 0.03));
      if (d > 0) return 0;
      if (book < 0) return e.read ? 0.5 : 1.3 + 0.2 * sin(t * 3);
      return shade(d, 20);
    },
    prompt(e) {
      return e.read ? null : 'READ THE OPEN BOOK';
    },
    interact(e, g) {
      if (!e.read) g.readLore(e);
    },
  });
  thing('altar', {
    h: 1.3, w: 0.9, col: hex('#8c8270'), emit: hex('#ffd76a'), glow: 1.6,
    shape(u, v, e, t) {
      const X = u * 0.45, Y = v * 1.3;
      const ped = box(X, Y - 1.0, 0.22, 0.3);
      const gem = abs(X * cos(t * 1.6) * 1.3) + abs(Y - 0.35 - sin(t * 2) * 0.04) - 0.2;
      if (!e.used && gem < 0) return gem > -0.04 ? 2.0 : 1.2;
      if (ped > 0) return 0;
      return shade(ped, 15);
    },
    prompt(e) {
      return e.used ? null : 'TAKE A RELIC FROM THE MARGIN';
    },
    interact(e, g) {
      if (e.used) return;
      e.used = true;
      g.offerRelics();
    },
  });
  thing('exitwell', {
    h: 1.7, w: 1.7, r: 0.6, col: hex('#3a2050'), emit: hex('#c58cff'), set: 'braille', glow: 1.7, solid: false,
    shape(u, v, e, t) {
      const X = u * 0.85, Y = v * 1.7 - 0.95;
      const r = sqrt(X * X + Y * Y);
      if (r > 0.8) return 0;
      const a = Math.atan2(Y, X);
      const sp = sin(a * 5 - r * 12 + t * 3);
      if (r > 0.55) return sp > -0.2 ? 1.8 : 0;
      return sp > 0.4 ? 1.2 : 0.05;
    },
    prompt(e, g) {
      return g.bossAlive() ? null : 'DESCEND';
    },
    interact(e, g) {
      g.descend();
    },
  });
  thing('remnant', {
    h: 0.9, w: 0.7, col: hex('#8d8d8d'), emit: hex('#9ab3ff'), glow: 1,
    shape(u, v, e, t) {
      const X = u * 0.35, Y = v * 0.9;
      const d = min(box(X, Y - 0.55, 0.22, 0.35), circ(X, Y - 0.22, 0.22));
      if (d > 0) return 0;
      if (abs(X) < 0.03 && Y > 0.25 && Y < 0.6) return e.claimed ? 0.3 : 1.6 + 0.2 * sin(t * 2);
      if (abs(Y - 0.36) < 0.025 && abs(X) < 0.11) return e.claimed ? 0.3 : 1.6;
      return shade(d, 15);
    },
    prompt(e) {
      return e.claimed ? 'READ THE EPITAPH' : 'READ THE EPITAPH OF A FALLEN READER';
    },
    interact(e, g) {
      g.readEpitaph(e);
    },
  });
  def('prop', {
    kind: 'prop', r: 0.25, h: 0.6, w: 0.8, col: hex('#8a7356'), emit: hex('#ffb347'), set: 'ascii', glow: 1, crawl: false,
    init(e) {
      const k = e.kind2;
      if (k === 'candles') { e.h = 0.45; e.col = G.hex('#d8c8a8'); }
      if (k === 'bones') { e.col = G.hex('#d8cfba'); e.h = 0.4; }
      if (k === 'coral') { e.col = G.hex('#4fa58f'); e.h = 0.9; e.emit = G.hex('#7fffe0'); }
      if (k === 'crystals') { e.col = G.hex('#9b7ae0'); e.h = 0.8; e.emit = G.hex('#d9b8ff'); }
      if (k === 'books') { e.col = G.hex('#8a5a33'); e.h = 0.5; }
    },
    shape(u, v, e, t) {
      const X = u * 0.4, Y = v * e.h;
      const k = e.kind2, H = e.h;
      if (k === 'candles') {
        for (let i = 0; i < 3; i++) {
          const cx = (i - 1) * 0.12, top = 0.15 + i * 0.06;
          if (box(X - cx, Y - (top + H) / 2, 0.025, (H - top) / 2) < 0) return 0.9;
          if (ell(X - cx + sin(t * 11 + i) * 0.01, Y - top + 0.05, 0.022, 0.045) < 0) return 1.9;
        }
        return 0;
      }
      if (k === 'bones') {
        const d = min(circ(X + 0.1, Y - 0.22, 0.1), seg(X, Y, -0.05, 0.36, 0.3, 0.3, 0.03), seg(X, Y, -0.25, 0.38, 0.1, 0.34, 0.025));
        if (d > 0) return 0;
        if (circ(X + 0.13, Y - 0.21, 0.025) < 0 || circ(X + 0.06, Y - 0.21, 0.025) < 0) return 0.08;
        return shade(d, 25);
      }
      if (k === 'coral') {
        let d = seg(X, Y, 0, H, 0, 0.3, 0.03);
        d = min(d, seg(X, Y, 0, 0.6, -0.2, 0.25, 0.025), seg(X, Y, 0, 0.5, 0.22, 0.15, 0.025), seg(X, Y, -0.1, 0.45, -0.3, 0.5, 0.02));
        if (d > 0) return 0;
        return Y < 0.3 ? 1.3 : shade(d, 30);
      }
      if (k === 'crystals') {
        let d = 1;
        for (let i = 0; i < 3; i++) {
          const cx = (i - 1) * 0.13, top = 0.1 + abs(i - 1) * 0.25;
          const hw = ((Y - top) / (H - top)) * 0.07;
          if (Y > top) d = min(d, abs(X - cx) - hw);
        }
        if (d > 0) return 0;
        return d > -0.015 ? 1.5 : 0.6;
      }
      // books
      let d = 1;
      for (let i = 0; i < 4; i++) d = min(d, box(X - sin(i * 2.3) * 0.04, Y - (H - 0.06 - i * 0.11), 0.22 - i * 0.02, 0.05));
      if (d > 0) return 0;
      return shade(d, 30) * (0.7 + 0.3 * G.hash2(Math.floor(Y * 9), 1, e.id));
    },
  });

  // Codex preview mapping for creatures that use another's codex entry.
  E.codexKey = (type) => (E.defs[type] && E.defs[type].codex) || type;
})();
