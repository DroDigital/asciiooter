'use strict';
// The wider bestiary: twelve more creatures, each with its own silhouette and moveset, plus the
// hazards and things they use (mines, thrown debris, spore pods) and explosive oil casks.
(function () {
  const G = window.G;
  const E = G.Ent, Ph = () => G.Phys;
  const { wake, wander, seek, keepRange, melee } = E.ai;
  const { circ, ell, tcap, box, smin, limb, LIMB } = G.Models.sdf;
  const mat = G.Models.mat, emit = G.Models.emit;
  const hex = G.hex;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt;
  const fract = (x) => x - Math.floor(x);
  const rnd = (a, b) => G.rand.range(a, b);
  const face = (e) => cos(e.rel || 0), side = (e) => sin(e.rel || 0);
  const wind = (e, w) => (e.state === 'windup' ? min(1, e.st / w) : 0);
  const def = (name, d) => {
    d.type = name;
    d.cel = d.kind === 'enemy';
    E.defs[name] = d;
    return d;
  };
  // Fire a lobbed projectile that lands on (tx, ty).
  function lob(g, e, tx, ty, z0, flight, o) {
    const T = flight, grav = 9;
    const vz = (0.5 * grav * T * T - z0 + 0.05) / T;
    g.proj(Object.assign({ x: e.x, y: e.y, z: z0, vx: (tx - e.x) / T, vy: (ty - e.y) / T, vz, grav, team: 'enemy', life: T + 1, src: e }, o));
  }
  function freeNear(g, x, y, r0, r1) {
    for (let t = 0; t < 30; t++) {
      const a = rnd(0, G.TAU), r = rnd(r0, r1);
      const nx = x + cos(a) * r, ny = y + sin(a) * r;
      if (!g.level.solid(Math.floor(nx), Math.floor(ny))) return [nx, ny];
    }
    return null;
  }

  // ---------------------------------------------------------------- TOME SWARM: books that flock and bite
  def('tome', {
    kind: 'enemy', hp: 14, speed: 4.4, r: 0.22, h: 0.55, w: 0.85, z: 0.6, ownZ: true, fly: true, mass: 0.4, set: 'sigilA', ink: 1, glow: 1,
    col: hex('#8a2a22'), emit: hex('#ffd36a'), blood: hex('#efe2c0'), thick: 0.05,
    mats: [mat('#8a2219', 0.25, 12), mat('#efe2c0', 0.05, 6, 0.4), emit('#ffd36a'), mat('#2a0a08'), mat('#d8b050', 0.9, 40), mat('#fff8e8', 0.4, 20)],
    model(X, Y, e, t, o) {
      const fl = abs(sin(t * 15 + e.id * 1.7));
      const open = 0.35 + 0.9 * fl;
      const cy = 0.32, hw = 0.38;
      const lx = -hw * cos(open * 0.6), ly = -hw * sin(open * 0.6) * 0.8;
      const cL = tcap(X, Y, 0, cy, lx, cy + ly, 0.045, 0.04), cR = tcap(X, Y, 0, cy, -lx, cy + ly, 0.045, 0.04);
      const pages = ell(X, Y - cy - 0.02 + fl * 0.04, abs(lx) * 0.85 + 0.03, 0.06 + fl * 0.05);
      const d = min(cL, cR, pages);
      o.d = d;
      if (d > 0) return;
      if (pages <= d + 1e-4) {
        const edge = Y - cy + 0.02 - fl * 0.04;
        if (edge > 0.02 && fract(X * 22) < 0.5) {
          o.m = 5;
          return;
        }
        o.m = 1;
        o.k = fract(Y * 60) < 0.3 ? 0.7 : 1;
        return;
      }
      if (circ(X, Y - cy, 0.045) < 0) {
        o.m = 2;
        o.e = 1.4;
        return;
      }
      const end = min(circ(X - lx, Y - cy - ly, 0.06), circ(X + lx, Y - cy - ly, 0.06));
      if (end < 0) o.m = 4;
    },
    update(e, g, dt) {
      e.z = 0.55 + sin(g.time * 3 + e.id) * 0.22;
      if (!wake(e, g)) return wander(e, g, dt);
      const P = g.player;
      e.cd -= dt;
      if (e.flee > 0) {
        e.flee -= dt;
        const d = g.distP(e);
        e.vx = ((e.x - P.x) / d) * 3;
        e.vy = ((e.y - P.y) / d) * 3;
        return;
      }
      seek(e, g, e.def.speed);
      // flocking: separation, alignment, cohesion
      let n = 0, cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0;
      for (const f of g.ents) {
        if (f === e || !f.alive || f.type !== 'tome') continue;
        const dx = f.x - e.x, dy = f.y - e.y, d = Math.hypot(dx, dy);
        if (d > 2.4) continue;
        n++;
        cx += f.x;
        cy += f.y;
        ax += f.vx;
        ay += f.vy;
        if (d < 0.65 && d > 0.001) {
          sx -= (dx / d) * (0.65 - d) * 9;
          sy -= (dy / d) * (0.65 - d) * 9;
        }
      }
      if (n) {
        e.vx += (cx / n - e.x) * 0.9 + (ax / n - e.vx) * 0.25 + sx;
        e.vy += (cy / n - e.y) * 0.9 + (ay / n - e.vy) * 0.25 + sy;
      }
      e.vx += sin(g.time * 5 + e.id) * 1.2;
      e.vy += cos(g.time * 4.3 + e.id) * 1.2;
      const sp = Math.hypot(e.vx, e.vy), mx = e.def.speed * 1.3;
      if (sp > mx) {
        e.vx *= mx / sp;
        e.vy *= mx / sp;
      }
      if (g.distP(e) < 0.65 && e.cd <= 0) {
        g.hurtPlayer(5, e.x, e.y, e);
        g.sound('swipe', e.x, e.y, { vol: 0.5 });
        e.cd = 0.9;
        e.flee = 0.45;
      }
      if (Math.random() < dt * 1.5) g.sound('flap', e.x, e.y, { vol: 0.5 });
    },
    onDeath(e, g) {
      for (let i = 0; i < 14; i++)
        g.part({ x: e.x, y: e.y, z: e.z + 0.2, vx: rnd(-2.5, 2.5), vy: rnd(-2.5, 2.5), vz: rnd(0.5, 2.5), grav: 2.2, drag: 2.4, flutter: 9, life: rnd(2, 4), g: G.Glyphs.ch(G.rand.pick(['=', '-', '~', '_'])), r: 0.95, gr: 0.9, b: 0.8, lit: true, col: true, rest: 0.1, fric: 0.3 });
    },
    light: () => [1, 0.8, 0.4, 1.6, 0.3],
    group: [5, 7],
  });

  // ---------------------------------------------------------------- SCRIVENER: lays mines, fires ink darts, blinks away
  def('scrivener', {
    kind: 'enemy', hp: 95, speed: 2.3, r: 0.35, h: 1.85, w: 1.7, z: 0.2, ownZ: true, fly: true, mass: 1.5, set: 'sigilB', ink: 8, glow: 1.2,
    col: hex('#1c1a2a'), emit: hex('#7fd0ff'), blood: hex('#2a20c8'), bloodEmit: 0.3, thick: 0.12,
    mats: [mat('#22203a', 0.25, 14), mat('#e8dcc0', 0.45, 24), emit('#7fd0ff'), mat('#d8d0c0', 0.1, 8), emit('#4a3cff'), mat('#c8a050', 0.9, 40), mat('#8a7a6a', 0.1, 8, 0.4)],
    model(X, Y, e, t, o) {
      const s = side(e), f = face(e);
      const hx = s * 0.08;
      const hemY = 1.7 + sin(X * 14 + t * 3) * 0.06;
      let d = Y > 0.5 && Y < hemY ? abs(X + sin(Y * 4 + t * 1.5) * 0.03) - (0.16 + (Y - 0.5) * 0.22) : 9;
      d = smin(d, tcap(X, Y, 0, 0.45, hx, 0.62, 0.11, 0.17), 0.05);
      const head = ell(X - hx, Y - 0.3, 0.12, 0.14);
      const beakTip = hx + s * 0.32, beakY = 0.43 + (1 - abs(s)) * 0.08;
      const beak = tcap(X, Y, hx + s * 0.05, 0.34, beakTip, beakY, 0.06, 0.006);
      d = min(d, smin(head, beak, 0.03));
      let quills = 9, arms = 9;
      for (let k = -1; k <= 1; k += 2)
        for (let r = 0; r < 2; r++) {
          const wr = sin(t * 6 + k + r * 2) * 0.25;
          const a = limb(X, Y, k * 0.2 + hx * 0.5, 0.7 + r * 0.2, k * (0.9 + r * 0.3) + wr, 0.24, -k * (0.9 + wr), 0.22, 0.035, 0.028, 0.022);
          arms = min(arms, a);
          quills = min(quills, tcap(X, Y, LIMB.ex, LIMB.ey, LIMB.ex + k * 0.08, LIMB.ey - 0.22, 0.008, 0.02));
        }
      d = min(smin(d, arms, 0.02), quills);
      o.d = d;
      if (d > 0) return;
      if (quills <= d + 1e-4) {
        o.m = Y > 0 && fract(Y * 30) < 0.5 ? 3 : 4;
        o.e = 1;
        return;
      }
      if (beak <= d + 1e-4 || head <= d + 1e-4) {
        o.m = 1;
        if (f > -0.2 && (circ(X - hx - 0.05, Y - 0.29, 0.03) < 0 || circ(X - hx + 0.05, Y - 0.29, 0.03) < 0)) {
          o.m = 2;
          o.e = 1.5;
        }
        return;
      }
      if (arms <= d + 1e-4) {
        o.m = 6;
        return;
      }
      if (abs(X) < 0.04 && Y > 0.55) o.m = 5;
      else o.k = 0.75 + 0.25 * abs(sin(X * 30));
    },
    update(e, g, dt) {
      e.z = 0.2 + sin(g.time * 1.6 + e.id) * 0.08;
      if (!wake(e, g)) return;
      const P = g.player, d = g.distP(e), dd = e.data;
      ['dart', 'mine', 'blink'].forEach((k) => (dd[k] = (dd[k] === undefined ? rnd(1, 3) : dd[k]) - dt));
      keepRange(e, g, e.def.speed, 4.5, 9);
      if (dd.burst > 0) {
        dd.bt -= dt;
        if (dd.bt <= 0) {
          dd.burst--;
          dd.bt = 0.13;
          const a = Math.atan2(P.y - e.y, P.x - e.x) + rnd(-0.06, 0.06);
          g.proj({ x: e.x, y: e.y, z: 1.1, vx: cos(a) * 12, vy: sin(a) * 12, dmg: 7, team: 'enemy', life: 2.5, col: [0.35, 0.3, 1], r: 0.13, src: e });
          g.sound('quill', e.x, e.y, { vol: 0.6 });
        }
      }
      if (dd.dart <= 0 && d < 14 && g.losP(e)) {
        dd.burst = 3;
        dd.bt = 0;
        dd.dart = 2.6;
      }
      if (dd.mine <= 0 && d < 12) {
        for (let i = 0; i < 2; i++) {
          const p = freeNear(g, P.x + P.vx * 0.6, P.y + P.vy * 0.6, 1, 3);
          if (p) g.spawn('mine', p[0], p[1], { state: 'chase', src: e });
        }
        g.sound('note', e.x, e.y);
        dd.mine = 7;
      }
      if (dd.blink <= 0 && d < 3) {
        const p = freeNear(g, e.x, e.y, 5, 8);
        if (p) {
          g.splatter(e.x, e.y, 1, 12, [0.15, 0.12, 0.6], 3, 0, 0, 0.3);
          g.smoke(e.x, e.y, 0.8, 6, 0.4, [0.1, 0.08, 0.3], 0.3);
          e.x = p[0];
          e.y = p[1];
          g.splatter(e.x, e.y, 1, 12, [0.15, 0.12, 0.6], 3, 0, 0, 0.3);
          g.sound('flutter', e.x, e.y);
          dd.blink = 5;
        }
      }
    },
    light: () => [0.5, 0.8, 1, 2.5, 0.4],
  });

  // A written mine: a glowing sigil on the floor that arms when you come close.
  def('mine', {
    kind: 'hazard', hp: 1, r: 0.3, h: 0.1, w: 0.1, hidden: true,
    update(e, g, dt) {
      const P = g.player;
      e.data.life = (e.data.life === undefined ? 16 : e.data.life) - dt;
      const d = g.distP(e);
      if (e.data.arm === undefined && d < 1.3) {
        e.data.arm = 0.5;
        g.sound('beep', e.x, e.y);
      }
      if (e.data.arm !== undefined) {
        e.data.arm -= dt;
        if (e.data.arm <= 0) {
          e.alive = false;
          g.explode(e.x, e.y, 1.8, 30, { team: 'enemy', pdmg: 18, small: true, col: [0.45, 0.6, 1], src: e.src });
        }
      }
      if (e.data.life <= 0) e.alive = false;
      void P;
    },
    fx(e, g) {
      const armed = e.data.arm !== undefined;
      const k = armed ? 0.6 + 0.4 * sin(g.time * 40) : 0.5 + 0.2 * sin(g.time * 4);
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * G.TAU + g.time * 1.5;
        g.part({ x: e.x + cos(a) * 0.45, y: e.y + sin(a) * 0.45, z: 0.03, life: 0.04, g: G.Glyphs.id('sb:' + ((i * 13 + e.id) % 96)), r: 0.4 * k, gr: 0.6 * k, b: 1 * k, glow: 0.8, fade: false, add: true });
      }
      g.part({ x: e.x, y: e.y, z: 0.03, life: 0.04, g: G.Glyphs.id('sym:star'), r: armed ? 1 : 0.5, gr: armed ? 0.4 : 0.7, b: 1, glow: 1, fade: false, add: true });
    },
  });

  // ---------------------------------------------------------------- INK GOLEM: armoured, slams, throws debris
  def('inkhulk', {
    kind: 'enemy', hp: 520, speed: 1.3, r: 0.75, h: 2.6, w: 2.6, mass: 9, heavy: true, set: 'sigilA', ink: 26, glow: 1.2,
    col: hex('#14121c'), emit: hex('#ff8a2a'), blood: hex('#0a0814'), thick: 0.3,
    mats: [mat('#17141f', 0.8, 32, 0.2), mat('#6a4a30', 0.15, 8), emit('#ff8a2a'), mat('#d8ccb0', 0.05, 6), mat('#2a2050', 0.9, 50), mat('#c8a050', 0.9, 40)],
    model(X, Y, e, t, o) {
      const s = side(e), f = face(e);
      const slam = e.state === 'windup' && e.data.move === 'slam' ? wind(e, 0.85) : 0;
      const thr = e.state === 'windup' && e.data.move === 'throw' ? wind(e, 0.6) : 0;
      const br = sin(t * 1.4 + e.id) * 0.02;
      let d = ell(X, Y - 1.2, 0.62 + br, 0.72);
      const head = circ(X - s * 0.12, Y - 0.5 + slam * 0.05, 0.2);
      d = smin(d, head, 0.12);
      let arms = 9;
      for (let k = -1; k <= 1; k += 2) {
        const up = slam + (k > 0 ? thr * 1.2 : 0);
        const a1 = k * (0.35 + up * 2.2), a2 = -k * (0.25 - up * 0.2);
        arms = min(arms, limb(X, Y, k * 0.58, 0.85, a1, 0.62, a2, 0.6, 0.2, 0.17, 0.15));
        arms = min(arms, circ(X - LIMB.ex, Y - LIMB.ey, 0.22));
        d = min(d, tcap(X, Y, LIMB.kx, LIMB.ky, LIMB.kx + k * 0.02, LIMB.ky + 0.25 + sin(t * 2 + k) * 0.05, 0.03, 0.01));
      }
      d = smin(d, arms, 0.12);
      for (let k = -1; k <= 1; k += 2) d = smin(d, tcap(X, Y, k * 0.3, 1.75, k * 0.38, 2.55, 0.2, 0.18), 0.08);
      o.d = d;
      if (d > 0) return;
      const plates = e.data.plates === undefined ? 3 : e.data.plates;
      if (plates > 0 && box(X, Y - 1.15, 0.38, 0.32, 0.06) < 0 && f > -0.2) {
        o.m = abs(box(X, Y - 1.15, 0.38, 0.32, 0.06)) < 0.04 ? 5 : 1;
        if (fract((Y - 0.83) * 9) < 0.08) o.m = 3;
        return;
      }
      for (let k = -1; k <= 1; k += 2) {
        if (plates > (k < 0 ? 1 : 2) && circ(X - k * 0.55, Y - 0.85, 0.24) < 0) {
          o.m = 1;
          if (circ(X - k * 0.55, Y - 0.85, 0.06) < 0) o.m = 5;
          return;
        }
      }
      if (head <= d + 0.02 && f > -0.3) {
        if (abs(Y - 0.48) < 0.035 && abs(abs(X - s * 0.12) - 0.08) < 0.05) {
          o.m = 2;
          o.e = 1.4 + slam;
          return;
        }
      }
      o.m = abs(sin(X * 7 + Y * 4 + t)) < 0.06 ? 4 : 0;
      o.k = 0.8 + 0.2 * sin(Y * 11 + sin(X * 5) * 3);
    },
    hurt(e, g, d) {
      const plates = e.data.plates === undefined ? 3 : e.data.plates;
      return plates > 0 ? d * 0.55 : d * 1.2;
    },
    update(e, g, dt) {
      if (!wake(e, g)) return;
      const P = g.player, d = g.distP(e), dd = e.data;
      if (dd.plates === undefined) dd.plates = 3;
      const need = Math.ceil((e.hp / e.maxHp) * 4) - 1;
      if (need < dd.plates) {
        dd.plates--;
        const col = hex('#6a4a30');
        for (let i = 0; i < 40; i++)
          g.part({ x: e.x, y: e.y, z: rnd(0.8, 1.6), vx: rnd(-4, 4), vy: rnd(-4, 4), vz: rnd(1, 4), grav: 11, col: true, rest: 0.3, fric: 0.5, life: rnd(3, 5), g: G.Glyphs.ch(G.rand.pick(['#', '=', '[', ']'])), r: col[0] * 1.5, gr: col[1] * 1.5, b: col[2] * 1.5, lit: true, tumble: true, av: rnd(-12, 12) });
        g.sound('crumble', e.x, e.y);
        g.shake(4);
        g.msg(dd.plates ? 'ITS ARMOUR CRACKS' : 'ITS ARMOUR FALLS AWAY', [1, 0.7, 0.4], 1.6);
      }
      e.cd -= dt;
      dd.throwCd = (dd.throwCd === undefined ? 3 : dd.throwCd) - dt;
      if (e.state === 'windup') {
        e.vx = e.vy = 0;
        e.st += dt;
        if (dd.move === 'slam' && e.st >= 0.85) {
          Ph().shock(g, e.x, e.y, 4.6, 7.5, 20, [1, 0.6, 0.3], { src: e });
          Ph().impulse(g, e.x, e.y, 0.2, 3.5, 6);
          g.decal(e.x, e.y, 0, 1.2, [0.03, 0.02, 0.04], 0.8);
          g.shake(10);
          g.wave(e.x, e.y, 0.9);
          g.sound('boom', e.x, e.y);
          for (let i = 0; i < 30; i++) {
            const a = rnd(0, G.TAU);
            g.part({ x: e.x + cos(a) * 0.8, y: e.y + sin(a) * 0.8, z: 0.05, vx: cos(a) * rnd(2, 5), vy: sin(a) * rnd(2, 5), vz: rnd(1, 4), grav: 11, col: true, rest: 0.3, fric: 0.5, life: rnd(1.5, 3), g: G.Glyphs.ch(G.rand.pick(['#', '%', '.', ','])), r: 0.35, gr: 0.3, b: 0.28, lit: true });
          }
          e.state = 'chase';
          e.cd = 2.6;
        } else if (dd.move === 'throw' && e.st >= 0.6) {
          const lead = 0.35;
          lob(g, e, P.x + P.vx * lead, P.y + P.vy * lead, 2.2, max(0.6, d / 9), { dmg: 18, land: 'chunk', model: 'debris', col: [0.3, 0.25, 0.3], r: 0.3 });
          g.sound('whoosh', e.x, e.y);
          e.state = 'chase';
          dd.throwCd = 4.5;
        }
        return;
      }
      seek(e, g, e.def.speed);
      if (d < 2.5 && e.cd <= 0) {
        e.state = 'windup';
        e.st = 0;
        dd.move = 'slam';
        g.sound('roar', e.x, e.y);
      } else if (d > 4 && d < 13 && dd.throwCd <= 0 && g.losP(e)) {
        e.state = 'windup';
        e.st = 0;
        dd.move = 'throw';
      }
    },
    light: () => [1, 0.5, 0.2, 2.5, 0.5],
  });
  // A torn-off chunk of the world, thrown.
  def('debris', {
    kind: 'proj', r: 0.3, h: 0.6, w: 0.6, set: 'blocks', glow: 0.5, thick: 0.15,
    mats: [mat('#4a3e48', 0.3, 12), mat('#6a4a30', 0.15, 8), emit('#ff8a2a')],
    model(X, Y, e, t, o) {
      const py = Y - 0.3, a = (e.spin || 0) + e.id;
      const rx = X * cos(a) - py * sin(a), ry = X * sin(a) + py * cos(a);
      const d = box(rx, ry, 0.2 + 0.04 * sin(a * 3), 0.17, 0.05) + 0.02 * sin(rx * 30) * sin(ry * 27);
      o.d = d;
      if (d > 0) return;
      o.m = abs(rx) < 0.05 ? 2 : fract(ry * 6) < 0.25 ? 1 : 0;
      o.e = 1;
    },
  });

  // ---------------------------------------------------------------- CANDLEWICK WRAITH: orbits, dives, burns
  def('wraith', {
    kind: 'enemy', hp: 62, speed: 5, r: 0.3, h: 1.55, w: 1.2, z: 0.35, ownZ: true, fly: true, mass: 0.6, set: 'sigilB', ink: 6, glow: 1.4,
    col: hex('#e8dcc0'), emit: hex('#ffb040'), blood: hex('#ff8a2a'), bloodEmit: 0.8, thick: 0.1,
    mats: [mat('#eadfc6', 0.35, 20, 0.7), mat('#2a1a10', 0.1), emit('#ffb040'), emit('#fff3c0'), emit('#ff5a1a'), mat('#c8b890', 0.2, 10, 0.5)],
    model(X, Y, e, t, o) {
      const s = side(e);
      const dive = e.state === 'dive' ? 1 : 0;
      const flick = sin(t * 17 + Y * 20) * 0.03;
      const fh = 0.42 + 0.06 * sin(t * 11) + dive * 0.15;
      const flame = ell(X - s * 0.04 + flick, Y - 0.3, 0.13 + dive * 0.05, fh * 0.6);
      const core = ell(X - s * 0.04 + flick * 0.5, Y - 0.36, 0.06, fh * 0.32);
      let body = tcap(X, Y, 0, 0.55, 0, 1.1, 0.17, 0.13);
      for (let k = 0; k < 5; k++) body = smin(body, tcap(X, Y, (k - 2) * 0.06, 0.6, (k - 2) * 0.07 + sin(t * 3 + k) * 0.04, 0.72 + ((k * 7) % 5) * 0.06, 0.03, 0.012), 0.02);
      let wisp = 9;
      for (let k = -2; k <= 2; k++) wisp = min(wisp, tcap(X, Y, k * 0.06, 1.05, k * 0.14 + sin(t * 4 + k * 1.3) * 0.12 - s * 0.2, 1.5, 0.05, 0.004));
      let arms = 9;
      for (let k = -1; k <= 1; k += 2) arms = min(arms, tcap(X, Y, k * 0.14, 0.7, k * (0.45 + sin(t * 3 + k) * 0.08), 1.0 + dive * -0.25, 0.035, 0.006));
      const d = min(flame, body, wisp, arms);
      o.d = d;
      if (d > 0) return;
      if (core < 0) {
        o.m = 3;
        o.e = 2;
        return;
      }
      if (flame <= d + 1e-4) {
        o.m = 2;
        o.e = 1.4 + dive;
        return;
      }
      if (wisp <= d + 1e-4 || arms <= d + 1e-4) {
        o.m = 4;
        o.e = 0.6 + 0.4 * sin(t * 9 + Y * 10);
        return;
      }
      if (abs(Y - 0.66) < 0.03 && abs(abs(X) - 0.06) < 0.03) {
        o.m = 1;
        return;
      }
      o.m = Y > 0.9 ? 5 : 0;
    },
    update(e, g, dt) {
      e.z = 0.35 + sin(g.time * 2.4 + e.id) * 0.12;
      if (!wake(e, g)) return;
      const P = g.player, d = g.distP(e), dd = e.data;
      dd.dive = (dd.dive === undefined ? rnd(2, 4) : dd.dive) - dt;
      if (e.state === 'dive') {
        e.st += dt;
        e.vx = dd.dx * 11;
        e.vy = dd.dy * 11;
        dd.trail = (dd.trail || 0) - dt;
        if (dd.trail <= 0) {
          g.hazards.push({ x: e.x, y: e.y, r: 0.55, t: 2.4, type: 'fire', dmg: 10, src: e });
          dd.trail = 0.11;
        }
        if (d < 0.7 && !dd.hit) {
          dd.hit = true;
          g.hurtPlayer(12, e.x, e.y, e);
        }
        if (e.st > 0.75 || e.blocked) {
          e.state = 'chase';
          dd.dive = 3.6;
        }
        return;
      }
      // circle the Reader
      const a = Math.atan2(e.y - P.y, e.x - P.x) + dt * 1.3;
      const want = 4.2;
      const tx = P.x + cos(a) * want, ty = P.y + sin(a) * want;
      if (g.losP(e)) {
        const dx = tx - e.x, dy = ty - e.y, dl = Math.hypot(dx, dy) || 1;
        e.vx = (dx / dl) * e.def.speed;
        e.vy = (dy / dl) * e.def.speed;
      } else seek(e, g, e.def.speed);
      if (dd.dive <= 0 && d < 9 && g.losP(e)) {
        e.state = 'dive';
        e.st = 0;
        dd.hit = false;
        const lx = P.x + P.vx * 0.25 - e.x, ly = P.y + P.vy * 0.25 - e.y, l = Math.hypot(lx, ly) || 1;
        dd.dx = lx / l;
        dd.dy = ly / l;
        g.sound('shriek', e.x, e.y);
      }
    },
    fx(e, g, dt) {
      if (Math.random() < dt * 25) g.part({ x: e.x + rnd(-0.1, 0.1), y: e.y + rnd(-0.1, 0.1), z: e.z + e.h - 0.2, vz: rnd(0.6, 1.5), drag: 1, life: rnd(0.3, 0.6), g: G.Glyphs.ch(G.rand.pick(['*', "'", '.'])), ramp: g.FIRE, add: true, glow: 1 });
    },
    onDeath(e, g) {
      g.explode(e.x, e.y, 2.3, 40, { fire: true, player: true, pdmg: 14, all: true });
    },
    light: (e) => [1, 0.6, 0.25, 4, e.state === 'dive' ? 1.2 : 0.8],
  });

  // ---------------------------------------------------------------- TENDRIL BLOOM: rooted, whips, lobs spores
  def('bloom', {
    kind: 'enemy', hp: 170, speed: 0, r: 0.6, h: 1.8, w: 2.4, mass: 99, heavy: true, set: 'sigilA', ink: 10, glow: 1.2,
    col: hex('#3a5a2a'), emit: hex('#c8ff5a'), blood: hex('#5a8a2a'), bloodEmit: 0.3, thick: 0.15,
    mats: [mat('#3d5e2c', 0.25, 12, 0.5), mat('#8a2a62', 0.35, 18, 0.6), emit('#c8ff5a'), mat('#efe6c0', 0.5, 24), mat('#4a6a3a', 0.25, 12, 0.4), emit('#ff5ad0'), mat('#1a0a12')],
    model(X, Y, e, t, o) {
      const whip = e.state === 'windup' ? wind(e, 0.35) : e.state === 'recover' ? 1 - min(1, e.st / 0.3) : 0;
      const spit = e.data.spit > 0 ? e.data.spit : 0;
      const open = 0.5 + 0.4 * sin(t * 1.3) + whip * 0.3;
      let d = ell(X, Y - 1.55, 0.5, 0.25);
      d = smin(d, tcap(X, Y, 0, 1.45, sin(t * 0.9) * 0.05, 0.85, 0.13, 0.09), 0.1);
      const hy = 0.72;
      let petals = 9;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * G.TAU + t * 0.2;
        const px = cos(a) * (0.22 + open * 0.14), py = sin(a) * (0.15 + open * 0.08);
        petals = min(petals, ell(X - px, Y - hy - py, 0.17, 0.11));
      }
      const head = circ(X, Y - hy, 0.2 + spit * 0.05);
      d = smin(d, min(petals, head), 0.05);
      let tend = 9;
      for (let k = 0; k < 4; k++) {
        const sx = (k - 1.5) * 0.3, sgn = k < 2 ? -1 : 1;
        let px = sx, py = 1.5;
        for (let j = 0; j < 5; j++) {
          const ang = sgn * (0.6 + j * 0.25) + sin(t * 2.5 + k * 1.7 + j * 0.8) * 0.35 + whip * sgn * (1.2 - j * 0.1);
          const nx = px + sin(ang) * 0.16, ny = py - cos(ang) * 0.13;
          tend = min(tend, tcap(X, Y, px, py, nx, ny, 0.05 - j * 0.008, 0.042 - j * 0.008));
          px = nx;
          py = ny;
        }
      }
      d = min(d, tend);
      o.d = d;
      if (d > 0) return;
      if (tend <= d + 1e-4) {
        o.m = 4;
        if (fract(Y * 14 + X * 3) < 0.15) {
          o.m = 5;
          o.e = 0.8;
        }
        return;
      }
      if (head <= d + 0.01) {
        const r = sqrt(X * X + (Y - hy) * (Y - hy));
        if (r < 0.09 + spit * 0.04) {
          o.m = 2;
          o.e = 1.4 + spit;
          return;
        }
        if (r < 0.17) {
          o.m = fract(Math.atan2(Y - hy, X) * 2) < 0.5 ? 3 : 6;
          return;
        }
      }
      if (petals <= d + 0.01) {
        o.m = 1;
        o.k = 0.75 + 0.25 * sin(Math.atan2(Y - hy, X) * 10);
        return;
      }
      if (abs(sin(Y * 30)) < 0.15 && Y > 1.3) {
        o.m = 5;
        o.e = 0.5;
      }
    },
    update(e, g, dt) {
      e.vx = e.vy = 0;
      if (!wake(e, g)) return;
      const P = g.player, d = g.distP(e), dd = e.data;
      e.face = Math.atan2(P.y - e.y, P.x - e.x);
      e.cd -= dt;
      dd.spore = (dd.spore === undefined ? 2 : dd.spore) - dt;
      dd.spit = max(0, (dd.spit || 0) - dt * 2);
      if (e.state === 'windup') {
        e.st += dt;
        if (e.st >= 0.35) {
          if (d < 3.1) {
            g.hurtPlayer(14, e.x, e.y, e);
            g.knock(((P.x - e.x) / d) * 8, ((P.y - e.y) / d) * 8);
          }
          g.sound('swipe', e.x, e.y);
          e.state = 'recover';
          e.st = 0;
          e.cd = 1.3;
        }
        return;
      }
      if (e.state === 'recover') {
        e.st += dt;
        if (e.st > 0.3) e.state = 'chase';
        return;
      }
      if (d < 2.9 && e.cd <= 0) {
        e.state = 'windup';
        e.st = 0;
      } else if (dd.spore <= 0 && d < 13 && g.losP(e)) {
        lob(g, e, P.x + rnd(-0.6, 0.6), P.y + rnd(-0.6, 0.6), 1.0, max(0.7, d / 7), { dmg: 0, land: 'gas', model: 'spore', col: [0.7, 1, 0.4], r: 0.2 });
        dd.spit = 1;
        dd.spore = 3.4;
        g.sound('bubble', e.x, e.y, { vol: 2 });
      }
    },
    light: () => [0.7, 1, 0.3, 2.5, 0.45],
  });
  def('spore', {
    kind: 'proj', r: 0.2, h: 0.4, w: 0.4, set: 'braille', glow: 1.2, thick: 0.1,
    mats: [mat('#5a8a2a', 0.4, 20, 0.6), emit('#c8ff5a')],
    model(X, Y, e, t, o) {
      const py = Y - 0.2, r = sqrt(X * X + py * py);
      o.d = r - 0.14 - 0.02 * sin(Math.atan2(py, X) * 6 + t * 8);
      if (o.d > 0) return;
      o.m = r < 0.08 ? 1 : 0;
      o.e = 1.3;
    },
  });

  // ---------------------------------------------------------------- MARGIN HOUND: pack, flank, pounce
  def('hound', {
    kind: 'enemy', hp: 48, speed: 5.4, r: 0.32, h: 1.0, w: 1.8, mass: 0.9, set: 'sigilB', ink: 3, glow: 1,
    col: hex('#5a4a52'), emit: hex('#ff3a2a'), blood: hex('#3a0a0a'), thick: 0.1, group: [2, 4],
    mats: [mat('#4f4248', 0.2, 12), mat('#e8e0d0', 0.4, 20), emit('#ff3a2a'), mat('#140404'), mat('#2a2026', 0.1)],
    model(X, Y, e, t, o) {
      const s = side(e), f = face(e);
      const dir = s >= 0 ? 1 : -1, sa = abs(s);
      const crouch = e.state === 'windup' ? wind(e, 0.3) : 0;
      const leap = e.state === 'leap' ? 1 : 0;
      const L = 0.12 + 0.42 * sa;
      const by = 0.5 + crouch * 0.12;
      let d = tcap(X, Y, -dir * L, by + 0.02, dir * L, by - 0.04, 0.15, 0.2);
      const hx = dir * (L + 0.2 * sa) + (1 - sa) * 0, hy = by - 0.18 - leap * 0.05;
      const neck = tcap(X, Y, dir * L * 0.8, by - 0.08, hx, hy, 0.1, 0.07);
      const skull = ell(X - hx - dir * 0.08 * sa, Y - hy, 0.1 + 0.08 * sa, 0.085);
      d = smin(d, smin(neck, skull, 0.04), 0.05);
      const ph = e.walk || 0;
      for (let k = 0; k < 4; k++) {
        const front = k < 2;
        const lx = (front ? dir * L : -dir * L) * 0.9 + (k % 2 ? 0.07 : -0.07) * (1 - sa) * 1.6;
        const p = ph + (k === 0 || k === 3 ? 0 : Math.PI);
        const sw = sin(p) * 0.45 * sa * (leap ? 0 : 1) + (leap ? (front ? dir * 0.9 : -dir * 0.9) : 0);
        d = smin(d, limb(X, Y, lx, by + 0.05, sw * dir, 0.22, (front ? -0.4 : 0.5) * dir * sa - crouch * 0.6 * dir, 0.25, 0.055, 0.04, 0.028), 0.03);
      }
      const tail = tcap(X, Y, -dir * L, by - 0.02, -dir * (L + 0.3 * sa + 0.05), by - 0.25 + sin(t * 6) * 0.05, 0.035, 0.008);
      d = min(d, tail);
      o.d = d;
      if (d > 0) return;
      if (skull <= d + 0.01) {
        const ex = hx + dir * 0.06 * sa;
        if (f > -0.3 && (circ(X - ex - 0.035 * (1 - sa), Y - hy + 0.02, 0.022) < 0 || circ(X - ex + 0.035 * (1 - sa), Y - hy + 0.02, 0.022) < 0)) {
          o.m = 2;
          o.e = 1.5 + crouch;
          return;
        }
        if (Y > hy + 0.02 && abs(X - hx - dir * 0.1 * sa) < 0.08) {
          o.m = fract(X * 40) < 0.5 ? 1 : 3;
          return;
        }
        o.m = 1;
        o.k = 0.85;
        return;
      }
      if (abs(Y - (by - 0.05)) < 0.12 && abs(X) < L && fract(X * 14) < 0.35) {
        o.m = 1;
        return;
      }
      if (Y < by - 0.12 && abs(X) < L) {
        o.m = 4;
        return;
      }
      o.k = 0.8 + 0.2 * sin(Y * 40);
    },
    update(e, g, dt) {
      if (!wake(e, g)) return wander(e, g, dt);
      const P = g.player, d = g.distP(e), dd = e.data;
      dd.pounce = (dd.pounce === undefined ? rnd(1, 3) : dd.pounce) - dt;
      if (e.state === 'leap') {
        if (d < 0.8 && !dd.hit) {
          dd.hit = true;
          g.hurtPlayer(12, e.x, e.y, e);
        }
        if (e.z <= 0.01 && e.vz <= 0 && e.st > 0.1) {
          e.state = 'recover';
          e.st = 0;
        }
        e.st += dt;
        return;
      }
      if (e.state === 'recover') {
        e.vx *= 0.85;
        e.vy *= 0.85;
        e.st += dt;
        if (e.st > 0.45) e.state = 'chase';
        return;
      }
      if (e.state === 'windup') {
        e.vx = e.vy = 0;
        e.st += dt;
        if (e.st >= 0.3) {
          const tx = P.x + P.vx * 0.35 - e.x, ty = P.y + P.vy * 0.35 - e.y, l = Math.hypot(tx, ty) || 1;
          e.vx = (tx / l) * 8.5;
          e.vy = (ty / l) * 8.5;
          e.vz = 3.6;
          e.z = 0.02;
          e.state = 'leap';
          e.st = 0;
          dd.hit = false;
          dd.pounce = rnd(2.4, 3.4);
          g.sound('howl', e.x, e.y);
        }
        return;
      }
      // flank: orbit at a distance, the pack spreading around the Reader
      const a = Math.atan2(e.y - P.y, e.x - P.x) + (e.id % 2 ? 1 : -1) * dt * 1.6;
      if (g.losP(e) && d < 7) {
        const tx = P.x + cos(a) * 3.2, ty = P.y + sin(a) * 3.2, dx = tx - e.x, dy = ty - e.y, l = Math.hypot(dx, dy) || 1;
        e.vx = (dx / l) * e.def.speed;
        e.vy = (dy / l) * e.def.speed;
      } else seek(e, g, e.def.speed);
      if (dd.pounce <= 0 && d < 5.5 && g.losP(e)) {
        e.state = 'windup';
        e.st = 0;
        g.sound('groan', e.x, e.y);
      }
    },
    onLand(e, g) {
      g.smoke(e.x, e.y, 0.05, 3, 0.2, null, 0.2);
    },
    light: () => [1, 0.2, 0.15, 1.6, 0.3],
  });

  // ---------------------------------------------------------------- CIPHER: rotating shield, aimed beam
  def('cipher', {
    kind: 'enemy', hp: 135, speed: 2.4, r: 0.45, h: 1.8, w: 1.9, z: 0.6, ownZ: true, fly: true, mass: 2, set: 'box', ink: 9, glow: 1.5,
    col: hex('#2a2a3a'), emit: hex('#5af0ff'), blood: hex('#5af0ff'), bloodEmit: 0.6, thick: 0.25,
    mats: [mat('#262636', 0.95, 64), mat('#8a8ad8', 0.95, 64), emit('#5af0ff'), mat('#c8c8d8', 0.95, 50), emit('#ff3a5a'), emit('#ffffff')],
    model(X, Y, e, t, o) {
      const cy = 0.9, py = Y - cy;
      const spin = t * 1.4 + e.id;
      const aim = e.state === 'aim' ? min(1, e.st) : e.state === 'fire' ? 1 : 0;
      const a = 0.32, b = 0.52;
      const sx = X * cos(spin * 0.5) * 1.0;
      const core = (abs(sx) / a + abs(py) / b - 1) * 0.28;
      let d = core;
      const r1 = abs(ell(X, py, 0.75, 0.75 * abs(sin(spin)) + 0.08)) - 0.025;
      const r2 = abs(ell(X, py, 0.75 * abs(cos(spin * 0.7)) + 0.08, 0.75)) - 0.025;
      const rings = min(r1, r2);
      // the shield plate: in front of the core when the gap faces away
      const gr = e.data.gapRel || 0;
      const sh = box(X + sin(gr + Math.PI) * 0.55, py, 0.22 * abs(cos(gr + Math.PI)) + 0.03, 0.62, 0.05);
      const front = cos(gr) < 0;
      d = min(d, rings, sh);
      o.d = d;
      if (d > 0) return;
      if (sh <= d + 1e-4 && (front || core > 0)) {
        o.m = 3;
        o.k = 0.8 + 0.2 * (fract(py * 8 + X * 3) < 0.5 ? 1 : 0.6);
        if (abs(sh) < 0.02) o.m = 1;
        return;
      }
      if (core <= d + 1e-4 || core < 0) {
        if (abs(py) < 0.035 + aim * 0.05 && abs(sx) < 0.18) {
          o.m = aim > 0.95 ? 5 : 4;
          o.e = 1.5 + aim;
          return;
        }
        o.m = (sx > 0) !== (py > 0) ? 1 : 0;
        return;
      }
      if (fract(Math.atan2(py, X) * 3 + t) < 0.7) {
        o.m = 2;
        o.e = 1.1;
      } else o.d = 0.01;
    },
    hurt(e, g, d, o) {
      if (o && o.blast) return d;
      const att = Math.atan2(-(o && o.dirY) || 0, -(o && o.dirX) || 1);
      if (abs(G.angleDiff(e.data.gapAng || 0, att)) > 0.8) {
        g.sparks(e.x, e.y, e.z + 0.9, 4, 3, 0, 0, [0.7, 0.9, 1]);
        if (g.frame % 4 === 0) g.sound('ping', e.x, e.y);
        return d * 0.15;
      }
      return d * 1.35;
    },
    update(e, g, dt) {
      e.z = 0.6 + sin(g.time * 1.2 + e.id) * 0.1;
      const dd = e.data;
      dd.gapAng = (dd.gapAng || 0) + dt * 1.1;
      const P = g.player;
      dd.gapRel = G.angleDiff(Math.atan2(P.y - e.y, P.x - e.x), dd.gapAng);
      if (!wake(e, g)) return;
      const d = g.distP(e);
      e.cd -= dt;
      if (e.state === 'aim' || e.state === 'fire') {
        e.vx = e.vy = 0;
        e.st += dt;
        const want = Math.atan2(P.y - e.y, P.x - e.x);
        dd.ba += G.clamp(G.angleDiff(dd.ba, want), -dt * (e.state === 'aim' ? 2.5 : 0.9), dt * (e.state === 'aim' ? 2.5 : 0.9));
        const tr = g.trace(e.x, e.y, cos(dd.ba), sin(dd.ba), 30, true, false);
        const ex = e.x + cos(dd.ba) * tr.t, ey = e.y + sin(dd.ba) * tr.t;
        if (e.state === 'aim') {
          g.line(e.x, e.y, e.z + 0.9, ex, ey, 0.5, [1, 0.15, 0.2], 0.05, { flicker: true });
          if (e.st >= 1.0) {
            e.state = 'fire';
            e.st = 0;
            g.sound('palimpsest', e.x, e.y, { vol: 0.7 });
          }
        } else {
          g.line(e.x, e.y, e.z + 0.9, ex, ey, 0.5, [0.8, 1, 1], 0.05, { w: 2 });
          g.line(e.x, e.y, e.z + 0.9, ex, ey, 0.5, [0.2, 0.9, 1], 0.05, { w: 1, glyph: G.Glyphs.ch('=') });
          g.dynLights.push({ x: (e.x + ex) / 2, y: (e.y + ey) / 2, r: 0.4, g: 0.9, b: 1, rad: 4, i: 1 });
          if (Math.random() < 0.6) g.sparks(ex, ey, 0.5, 2, 3, 0, 0, [0.6, 1, 1]);
          if (Math.random() < 0.15) G.Phys.damageWall(g, Math.floor(ex + cos(dd.ba) * 0.05), Math.floor(ey + sin(dd.ba) * 0.05), 6, ex, ey, 0.5, cos(dd.ba), sin(dd.ba));
          const rx = P.x - e.x, ry = P.y - e.y, along = rx * cos(dd.ba) + ry * sin(dd.ba);
          const perp = abs(rx * sin(dd.ba) - ry * cos(dd.ba));
          dd.tick = (dd.tick || 0) - dt;
          if (along > 0 && along < tr.t && perp < 0.4 && dd.tick <= 0) {
            g.hurtPlayer(7, e.x, e.y, e);
            dd.tick = 0.12;
          }
          if (e.st >= 0.75) {
            e.state = 'chase';
            e.cd = 3;
          }
        }
        return;
      }
      keepRange(e, g, e.def.speed, 6, 10);
      if (e.cd <= 0 && d < 14 && g.losP(e)) {
        e.state = 'aim';
        e.st = 0;
        dd.ba = Math.atan2(P.y - e.y, P.x - e.x) + rnd(-0.4, 0.4);
        g.sound('palimpsestCharge', e.x, e.y);
      }
    },
    light: (e) => [0.4, 0.9, 1, 3, e.state === 'fire' ? 1.2 : 0.5],
  });

  // ---------------------------------------------------------------- BELL-RINGER: toll rings, hastens allies
  def('bellringer', {
    kind: 'enemy', hp: 115, speed: 1.6, r: 0.4, h: 2.15, w: 1.9, mass: 2.5, set: 'sigilA', ink: 9, glow: 1,
    col: hex('#3a2a3a'), emit: hex('#ffef9a'), blood: hex('#2a0a1a'), thick: 0.12,
    mats: [mat('#3a2a3e', 0.1, 8), mat('#c8b8a8', 0.1, 10, 0.5), mat('#c08a3a', 0.95, 48), mat('#1a1008'), emit('#ffef9a'), mat('#5a3a20', 0.2, 10)],
    model(X, Y, e, t, o) {
      const s = side(e);
      const ring = e.state === 'windup' ? wind(e, 0.6) : 0;
      const sw = e.data.swing || 0;
      const hw = Y > 0.55 ? 0.13 + (Y - 0.55) * 0.18 : 0;
      let d = Y > 0.55 && Y < 2.12 ? abs(X - sin(Y * 3 + t) * 0.02) - hw : 9;
      const hood = ell(X - s * 0.06, Y - 0.38, 0.15, 0.2);
      d = smin(d, hood, 0.05);
      const arm = limb(X, Y, 0.15, 0.7, -2.3 + ring * 0.4, 0.28, 0.5, 0.25, 0.04, 0.035, 0.03);
      d = smin(d, arm, 0.03);
      const px = 0.62, py = 0.15;
      const pole = tcap(X, Y, 0.0, 0.62, px, py, 0.03, 0.025);
      const ba = sw * 0.9 - ring * 0.8;
      const bx = px + sin(ba) * 0.45, by = py + cos(ba) * 0.45;
      const rope = tcap(X, Y, px, py, bx, by - 0.12, 0.01, 0.01);
      const lx = X - bx, ly = Y - by;
      const bw = 0.12 + max(0, ly + 0.12) * 0.55;
      const bell = ly > -0.15 && ly < 0.28 ? abs(lx) - bw : 9;
      d = min(d, pole, rope, bell);
      o.d = d;
      if (d > 0) return;
      if (bell <= d + 1e-4) {
        o.m = ly > 0.24 ? 3 : 2;
        if (abs(ly - 0.1) < 0.02) o.m = 4;
        return;
      }
      if (pole <= d + 1e-4 || rope <= d + 1e-4) {
        o.m = 5;
        return;
      }
      if (hood <= d + 0.01) {
        const fx = X - s * 0.08;
        if (abs(fx) < 0.09 && Y > 0.33 && Y < 0.5) {
          o.m = 3;
          if (Y < 0.42 && abs(abs(fx) - 0.04) < 0.02) {
            o.m = 4;
            o.e = 1.3 + ring;
          }
          return;
        }
      }
      if (arm <= d + 0.003) o.m = 1;
      else o.k = 0.75 + 0.25 * abs(sin(X * 25));
    },
    update(e, g, dt) {
      e.data.swing = sin(g.time * 2.2 + e.id) * 0.3;
      if (!wake(e, g)) return;
      const d = g.distP(e);
      e.cd -= dt;
      if (e.state === 'windup') {
        e.vx = e.vy = 0;
        e.st += dt;
        if (e.st >= 0.6) {
          G.Phys.shock(g, e.x, e.y, 7, 6.5, 13, [1, 0.85, 0.4], { luc: 5, src: e });
          g.sound('bell', e.x, e.y);
          g.wave(e.x, e.y, 0.6);
          for (const f of g.ents) if (f.alive && f.kind === 'enemy' && f !== e && Math.hypot(f.x - e.x, f.y - e.y) < 7) f.buffT = 3.5;
          e.state = 'chase';
          e.cd = 4.6;
        }
        return;
      }
      keepRange(e, g, e.def.speed, 4, 7);
      if (e.cd <= 0 && d < 9) {
        e.state = 'windup';
        e.st = 0;
      }
    },
    light: () => [1, 0.85, 0.4, 2, 0.3],
  });

  // ---------------------------------------------------------------- BROODSAC and MITES
  def('broodsac', {
    kind: 'enemy', hp: 150, speed: 1.1, r: 0.55, h: 1.45, w: 1.7, mass: 3, set: 'sigilB', ink: 10, glow: 1.1,
    col: hex('#c8a090'), emit: hex('#ffe05a'), blood: hex('#c8c040'), bloodEmit: 0.4, thick: 0.35,
    mats: [mat('#cfa596', 0.75, 32, 0.9), emit('#8a1a2a'), emit('#ffe05a'), mat('#4a3a32', 0.2, 10), mat('#2a0a0a')],
    model(X, Y, e, t, o) {
      const pulse = 1 + 0.04 * sin(t * 4 + e.id) + (e.flash > 0 ? 0.05 : 0);
      const sac = ell(X, Y - 0.72, 0.62 * pulse, 0.56 * pulse);
      let d = sac;
      for (let k = 0; k < 6; k++) {
        const lx = (k - 2.5) * 0.18;
        d = smin(d, tcap(X, Y, lx, 1.15, lx * 1.25 + sin(t * 8 + k) * 0.03, 1.43, 0.05, 0.03), 0.03);
      }
      o.d = d;
      if (d > 0) return;
      if (sac < 0) {
        for (let k = 0; k < 9; k++) {
          const mx = sin(t * (0.7 + k * 0.13) + k * 2.1) * 0.38, my = 0.72 + cos(t * (0.9 + k * 0.11) + k) * 0.3;
          if (circ(X - mx, Y - my, 0.045) < 0) {
            o.m = 2;
            o.e = 0.9 + 0.4 * sin(t * 6 + k);
            return;
          }
        }
        if (abs(sin(X * 13 + sin(Y * 9) * 2 + t * 0.5)) < 0.07) {
          o.m = 1;
          o.e = 0.5;
          return;
        }
        if (face(e) > 0.3 && circ(X - side(e) * 0.2, Y - 0.85, 0.07 + 0.02 * sin(t * 3)) < 0) {
          o.m = 4;
          return;
        }
        o.k = 0.85 + 0.15 * sin(Y * 20);
        return;
      }
      o.m = 3;
    },
    update(e, g, dt) {
      if (!wake(e, g)) return;
      const dd = e.data;
      if (dd.next === undefined) dd.next = 0.75;
      keepRange(e, g, e.def.speed, 4, 8);
      if (e.hp / e.maxHp < dd.next) {
        dd.next -= 0.25;
        for (let i = 0; i < 2; i++) g.spawn('mite', e.x + rnd(-0.4, 0.4), e.y + rnd(-0.4, 0.4), { state: 'chase', summon: true });
        g.splatter(e.x, e.y, 0.8, 10, hex('#c8c040'), 3, 0, 0, 0.4);
        g.sound('splash', e.x, e.y);
      }
    },
    onDeath(e, g) {
      for (let i = 0; i < 6; i++) g.spawn('mite', e.x + rnd(-0.5, 0.5), e.y + rnd(-0.5, 0.5), { state: 'chase', summon: true });
      g.hazards.push({ x: e.x, y: e.y, r: 1.6, t: 4, type: 'gas', dmg: 4, luc: 3, col: [0.7, 0.75, 0.25] });
    },
    light: () => [1, 0.85, 0.3, 2, 0.3],
  });
  def('mite', {
    kind: 'enemy', hp: 8, speed: 5.8, r: 0.18, h: 0.34, w: 0.6, mass: 0.3, set: 'braille', ink: 0, glow: 1.3,
    col: hex('#3a2a1a'), emit: hex('#ffd04a'), blood: hex('#ffd04a'), bloodEmit: 0.6, thick: 0.06,
    mats: [mat('#3a2a1a', 0.7, 36), emit('#ffd04a'), mat('#1a120a')],
    model(X, Y, e, t, o) {
      const near = e.data.near || 0;
      const ab = ell(X, Y - 0.2, 0.13, 0.1 + 0.01 * sin(t * (8 + near * 20)));
      const hd = circ(X, Y - 0.1, 0.05);
      let legs = 9;
      for (let k = 0; k < 3; k++)
        for (let s = -1; s <= 1; s += 2) {
          const p = (e.walk || 0) * 2 + k * 2 + (s > 0 ? 1 : 0);
          legs = min(legs, tcap(X, Y, s * 0.08, 0.2, s * (0.2 + k * 0.03), 0.12 + sin(p) * 0.03, 0.012, 0.01), tcap(X, Y, s * (0.2 + k * 0.03), 0.12 + sin(p) * 0.03, s * (0.25 + k * 0.04), 0.33, 0.01, 0.006));
        }
      const d = min(smin(ab, hd, 0.02), legs);
      o.d = d;
      if (d > 0) return;
      if (legs <= d + 1e-4) o.m = 2;
      else if (ab < -0.025) {
        o.m = 1;
        o.e = 1 + near * (0.5 + 0.5 * sin(t * 30));
      }
    },
    update(e, g, dt) {
      if (!wake(e, g)) return;
      const d = g.distP(e);
      e.data.near = G.clamp(1 - d / 4, 0, 1);
      seek(e, g, e.def.speed);
      e.vx += -e.vy * sin(g.time * 9 + e.id) * 0.5;
      e.vy += e.vx * sin(g.time * 9 + e.id) * 0.5;
      if (Math.random() < dt * 2) g.sound('click', e.x, e.y, { vol: 0.4 });
      if (d < 0.75) {
        g.explode(e.x, e.y, 1.3, 14, { team: 'enemy', pdmg: 10, small: true, col: [1, 0.85, 0.3], src: e });
        g.killEnemy(e, { blast: true });
      }
    },
    light: (e) => [1, 0.8, 0.2, 1.2, 0.2 + (e.data.near || 0) * 0.5],
    group: [3, 5],
  });

  // ---------------------------------------------------------------- MIRROR KNIGHT: reflects frontal fire, charges
  def('knight', {
    kind: 'enemy', hp: 220, speed: 2.1, r: 0.42, h: 2.05, w: 1.9, mass: 5, heavy: true, set: 'box', ink: 14, glow: 1,
    col: hex('#8a8a98'), emit: hex('#5af0ff'), blood: hex('#2a2a40'), thick: 0.15,
    mats: [mat('#8a8a9a', 0.95, 48), mat('#1c1c26', 0.4, 20), Object.assign(mat('#d0dcff', 1, 64), { rf: 1 }), mat('#8a1a2a', 0.1, 8), emit('#5af0ff'), mat('#d8d0c0', 0.8, 40), mat('#c8a050', 0.95, 48)],
    model(X, Y, e, t, o) {
      const s = side(e), f = face(e);
      const ch = e.state === 'windup' ? wind(e, 0.7) : e.state === 'charge' ? 1 : 0;
      const ph = e.walk || 0;
      let d = box(X, Y - 0.95, 0.24, 0.32, 0.08);
      const helm = box(X - s * 0.04, Y - 0.42, 0.13, 0.15, 0.05);
      d = smin(d, helm, 0.04);
      const plume = tcap(X, Y, -s * 0.04, 0.28, -s * 0.25 + sin(t * 3) * 0.04, 0.2 + sin(t * 4) * 0.03, 0.05, 0.02);
      for (let k = -1; k <= 1; k += 2) {
        d = smin(d, circ(X - k * 0.28, Y - 0.7, 0.13), 0.04);
        const sw = sin(ph + (k > 0 ? Math.PI : 0)) * 0.3 * abs(s);
        d = smin(d, limb(X, Y, k * 0.12, 1.25, sw, 0.36, -abs(sw) * 0.5, 0.4, 0.08, 0.07, 0.065), 0.03);
      }
      let shield = 9;
      if (f > -0.4) {
        const sx = X + 0.3 * (s >= 0 ? 1 : -1) * (1 - abs(f)) - (ch ? 0.25 : 0);
        const ly = Y - 1.0;
        const w = 0.3 * (0.4 + 0.6 * abs(f));
        shield = ly < 0.25 ? box(sx, ly, w, 0.42, 0.05) : abs(sx) - w * max(0, 1 - (ly - 0.25) / 0.3);
        if (ly > 0.55) shield = 9;
      }
      const lx = 0.35 + (ch ? -0.2 : 0);
      const lance = ch ? circ(X - lx, Y - 0.95, 0.05 + ch * 0.12) : tcap(X, Y, lx, 1.2, lx + 0.15, 0.05, 0.04, 0.012);
      d = min(d, plume, shield, lance);
      o.d = d;
      if (d > 0) return;
      if (shield <= d + 1e-4) {
        o.m = abs(shield) < 0.03 ? 6 : 2;
        return;
      }
      if (lance <= d + 1e-4) {
        o.m = 5;
        return;
      }
      if (plume <= d + 1e-4) {
        o.m = 3;
        return;
      }
      if (helm <= d + 0.01 && f > -0.3 && abs(Y - 0.42) < 0.025 && abs(X - s * 0.04) < 0.09) {
        o.m = 4;
        o.e = 1.4 + ch;
        return;
      }
      o.m = fract(Y * 6) < 0.08 ? 1 : 0;
    },
    hurt(e, g, d, o) {
      if (!o || o.blast || o.tick || e.state === 'charge' || e.state === 'stunned') return d * (e.state === 'stunned' ? 1.6 : 1);
      const att = Math.atan2(-(o.dirY || 0), -(o.dirX || 1));
      if (abs(G.angleDiff(e.face, att)) < 1.15) {
        const P = g.player;
        g.line(e.x, e.y, 1.0, P.x, P.y, 0.5, [0.6, 0.9, 1], 0.12, { taper: true, head: true });
        g.sparks(e.x, e.y, 1.0, 5, 3, 0, 0, [0.7, 0.95, 1]);
        if (g.frame % 3 === 0) g.sound('ping', e.x, e.y);
        if (Math.random() < 0.5) g.hurtPlayer(d * 0.3, e.x, e.y, e);
        return 0;
      }
      return d * 1.25;
    },
    update(e, g, dt) {
      if (!wake(e, g)) return;
      const P = g.player, d = g.distP(e), dd = e.data;
      e.cd -= dt;
      if (e.state === 'windup') {
        e.vx = e.vy = 0;
        e.st += dt;
        if (e.st >= 0.7) {
          const a = Math.atan2(P.y - e.y, P.x - e.x);
          dd.cx = cos(a);
          dd.cy = sin(a);
          e.state = 'charge';
          e.st = 0;
          g.sound('roar', e.x, e.y, { vol: 0.6 });
        }
        return;
      }
      if (e.state === 'charge') {
        e.st += dt;
        e.vx = dd.cx * 8.5;
        e.vy = dd.cy * 8.5;
        if (d < 1.1) {
          g.hurtPlayer(22, e.x, e.y, e);
          g.knock(dd.cx * 10, dd.cy * 10);
          e.state = 'chase';
          e.cd = 3;
        } else if (e.blocked || e.st > 1.0) {
          e.state = e.blocked ? 'stunned' : 'chase';
          e.st = 0;
          if (e.blocked) {
            g.shake(5);
            g.sound('thud', e.x, e.y, { vol: 2 });
            G.Phys.damageWall(g, Math.floor(e.x + dd.cx * 0.8), Math.floor(e.y + dd.cy * 0.8), 60, e.x + dd.cx * 0.5, e.y + dd.cy * 0.5, 1, dd.cx, dd.cy);
          }
          e.cd = 3.2;
        }
        return;
      }
      if (e.state === 'stunned') {
        e.vx = e.vy = 0;
        e.st += dt;
        if (e.st > 1.3) e.state = 'chase';
        return;
      }
      seek(e, g, e.def.speed);
      if (e.cd <= 0 && d > 2.5 && d < 8 && g.losP(e)) {
        e.state = 'windup';
        e.st = 0;
      }
    },
    light: () => [0.4, 0.9, 1, 1.6, 0.3],
  });

  // ---------------------------------------------------------------- THE HANGED: waits above, drops, crawls
  def('hanged', {
    kind: 'enemy', hp: 58, speed: 4.4, r: 0.3, h: 1.2, w: 1.3, mass: 0.8, set: 'sigilA', ink: 4, glow: 1,
    col: hex('#9a9a8a'), emit: hex('#d0ff5a'), blood: hex('#2a2a1a'), thick: 0.1,
    mats: [mat('#9c9a8a', 0.05, 8, 0.5), mat('#34343c', 0.05), mat('#8a7a5a', 0.1), emit('#d0ff5a'), mat('#121212')],
    init(e, g) {
      e.data.hang = true;
      e.ownZ = true;
      e.z = g.level.st.ceilH - 1.25;
      e.state = 'hang';
    },
    model(X, Y, e, t, o) {
      const s = side(e), f = face(e);
      if (e.data.hang) {
        const sw = sin(t * 0.9 + e.id) * 0.04;
        let d = circ(X - sw * 0.5 + 0.03, Y - 0.2, 0.09);
        d = smin(d, tcap(X, Y, sw * 0.4, 0.3, sw, 0.72, 0.1, 0.12), 0.04);
        for (let k = -1; k <= 1; k += 2) {
          d = smin(d, tcap(X, Y, k * 0.12 + sw * 0.4, 0.34, k * 0.14 + sw, 0.8, 0.035, 0.03), 0.02);
          d = smin(d, tcap(X, Y, k * 0.05 + sw, 0.7, k * 0.06 + sw * 1.4, 1.18, 0.045, 0.035), 0.02);
        }
        const rope = Y < 0.18 ? abs(X - sw * 0.2) - 0.012 : 9;
        d = min(d, rope);
        o.d = d;
        if (d > 0) return;
        o.m = rope <= d + 1e-4 ? 2 : Y < 0.3 ? 0 : Y < 0.72 ? 1 : 0;
        if (Y > 0.15 && Y < 0.28 && abs(X - sw * 0.5) < 0.09 && f > 0) {
          o.m = 4;
          if (abs(Y - 0.2) < 0.015 && abs(abs(X - sw * 0.5) - 0.035) < 0.015) {
            o.m = 3;
            o.e = 1.2;
          }
        }
        return;
      }
      // crawling on all fours, head low and forward
      const dir = s >= 0 ? 1 : -1, sa = abs(s);
      const L = 0.1 + 0.3 * sa;
      let d = tcap(X, Y, -dir * L, 0.82, dir * L, 0.78, 0.13, 0.14);
      const hx = dir * (L + 0.12 * sa), hy = 0.68;
      const head = circ(X - hx, Y - hy, 0.1);
      d = smin(d, head, 0.04);
      for (let k = 0; k < 4; k++) {
        const front = k < 2;
        const lx = (front ? dir * L : -dir * L) + (k % 2 ? 0.1 : -0.1) * (1 - sa) * 1.5;
        const p = (e.walk || 0) + (k === 0 || k === 3 ? 0 : Math.PI);
        d = smin(d, limb(X, Y, lx, 0.8, (k % 2 ? 1 : -1) * 0.9 + sin(p) * 0.3, 0.22, (k % 2 ? -1 : 1) * 1.9, 0.26, 0.04, 0.032, 0.025), 0.02);
      }
      o.d = d;
      if (d > 0) return;
      if (head <= d + 0.01) {
        o.m = 4;
        if (f > -0.3 && (circ(X - hx - 0.035, Y - hy + 0.01, 0.018) < 0 || circ(X - hx + 0.035, Y - hy + 0.01, 0.018) < 0)) {
          o.m = 3;
          o.e = 1.4;
        }
        return;
      }
      o.m = Y < 0.85 ? 1 : 0;
    },
    update(e, g, dt) {
      const P = g.player, dd = e.data;
      if (dd.hang) {
        e.vx = e.vy = 0;
        e.z = g.level.st.ceilH - 1.25;
        if (Math.hypot(P.x - e.x, P.y - e.y) < 1.9 && g.losP(e)) {
          dd.hang = false;
          e.ownZ = false;
          e.vz = 0;
          e.state = 'chase';
          g.codexSee('hanged');
          g.sound('shriek', e.x, e.y);
          for (let i = 0; i < 8; i++) g.part({ x: e.x, y: e.y, z: g.level.st.ceilH - 0.05, vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), grav: 9, col: true, life: 2, g: G.Glyphs.ch(','), r: 0.6, gr: 0.5, b: 0.4, lit: true });
        }
        return;
      }
      if (e.z > 0.01) return;
      e.cd -= dt;
      if (melee(e, g, dt, 1.0, 0.3, 13, 0.8)) return;
      seek(e, g, e.def.speed);
    },
    fx(e, g) {
      if (e.data.hang) g.line(e.x, e.y, e.z + e.h - 0.02, e.x, e.y, g.level.st.ceilH, [0.35, 0.3, 0.22], 0.03, {});
    },
    light: (e) => (e.data.hang ? null : [0.8, 1, 0.3, 1.4, 0.25]),
  });

  // ---------------------------------------------------------------- OIL CASKS: shoot them
  def('cask', {
    kind: 'prop', hp: 26, r: 0.3, h: 0.85, w: 0.75, mass: 1.6, set: 'blocks', glow: 1.2, body: true, shootable: true, fuse: true,
    col: hex('#6a4a2a'), emit: hex('#ffcc3a'), thick: 0.2,
    mats: [mat('#6a4a2a', 0.2, 10), mat('#4a4a52', 0.9, 40), emit('#ffcc3a'), mat('#2a1a0a'), emit('#fff3c0')],
    model(X, Y, e, t, o) {
      const lit = e.data.fuse !== undefined;
      const wob = lit ? sin(t * 40) * 0.01 : 0;
      const bw = 0.25 + 0.04 * sin(((Y - 0.1) / 0.75) * Math.PI);
      const d = Y > 0.1 && Y < 0.85 ? abs(X + wob) - bw : 9;
      const top = ell(X, Y - 0.1, bw, 0.04);
      const dd = min(d, top);
      o.d = dd;
      if (dd > 0) return;
      if (top <= dd + 1e-4 && Y < 0.13) {
        o.m = lit ? 4 : 3;
        o.e = 1.5;
        return;
      }
      if (abs(Y - 0.25) < 0.03 || abs(Y - 0.7) < 0.03) {
        o.m = 1;
        return;
      }
      if (abs(Y - 0.47) < 0.07 && abs(X) < 0.12) {
        o.m = 2;
        o.e = lit ? 1.5 + sin(t * 30) * 0.5 : 0.7;
        return;
      }
      o.k = 0.75 + 0.25 * abs(sin(X * 40));
    },
    onHurt(e, g) {
      if (e.data.fuse === undefined && e.hp <= 0) {
        e.data.fuse = 0.45;
        g.sound('fuse', e.x, e.y);
      }
    },
    fx(e, g, dt) {
      if (e.data.fuse === undefined) return;
      e.data.fuse -= dt;
      g.sparks(e.x, e.y, 0.85, 1, 2);
      if (e.data.fuse <= 0) {
        e.alive = false;
        g.explode(e.x, e.y, 3, 110, { fire: true, player: true, pdmg: 32, all: true, force: 12 });
        G.Phys.shatter(g, e, 7, 0, 0, 80);
      }
    },
    light: (e) => [1, 0.75, 0.3, 1.5, e.data.fuse !== undefined ? 1 : 0.2],
  });

  // ---------------------------------------------------------------- loose props become physics bodies
  Object.assign(E.defs.prop, { body: true, shootable: true, hp: 18, mass: 0.6 });

  // ---------------------------------------------------------------- the old roster: cel-shaded too
  for (const k of ['wretch', 'moth', 'watcher', 'hollow', 'drowned', 'choir', 'echo', 'lurker', 'maw', 'phantasm', 'redactor', 'seal', 'heart']) if (E.defs[k]) E.defs[k].cel = true;
  for (const k of ['moth', 'choir', 'drowned', 'heart', 'seal']) if (E.defs[k]) E.defs[k].ownZ = true;
  E.defs.moth.fly = E.defs.choir.fly = true;
  E.defs.moth.mass = 0.4;
  E.defs.wretch.mass = 1;
  E.defs.maw.mass = 7;
  E.defs.lurker.mass = 1.2;
})();
