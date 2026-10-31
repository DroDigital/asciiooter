'use strict';
// Models: every creature, boss, pickup, prop and held weapon as a signed-distance model.
// A model writes into `o`:
//   o.d  signed distance in world units (negative inside)
//   o.m  material index into the def's `mats`
//   o.e  emissive strength for emissive materials (default 1)
//   o.k  albedo multiplier for surface detail (default 1)
// Coordinates: X across (world units, 0 at the centre line), Y down from the top of the sprite.
// The renderer derives normals from the distance field and lights the result, so smooth
// unions and tapered limbs read as volume.
(function () {
  const G = window.G;
  const E = G.Ent;
  const sqrt = Math.sqrt, min = Math.min, max = Math.max, abs = Math.abs, sin = Math.sin, cos = Math.cos;
  const clamp = G.clamp, hex = G.hex;
  const Mo = (G.Models = {});

  // ---------------------------------------------------------------- SDF toolkit
  const circ = (x, y, r) => sqrt(x * x + y * y) - r;
  const ell = (x, y, a, b) => {
    const k0 = sqrt((x / a) * (x / a) + (y / b) * (y / b));
    return (k0 - 1) * min(a, b);
  };
  const tcap = (px, py, ax, ay, bx, by, ra, rb) => {
    const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
    const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay + 1e-9), 0, 1);
    const dx = pax - bax * h, dy = pay - bay * h;
    return sqrt(dx * dx + dy * dy) - (ra + (rb - ra) * h);
  };
  const box = (x, y, w, h, r) => {
    const rr = r || 0;
    const dx = abs(x) - w + rr, dy = abs(y) - h + rr;
    return min(max(dx, dy), 0) + sqrt(max(dx, 0) ** 2 + max(dy, 0) ** 2) - rr;
  };
  const smin = (a, b, k) => {
    const h = max(k - abs(a - b), 0) / k;
    return min(a, b) - h * h * k * 0.25;
  };
  const fract = (x) => x - Math.floor(x);
  const H = G.hash2;
  // Two-bone limb hanging from (ax, ay). Angles are measured from straight down, positive toward +X.
  const LIMB = { kx: 0, ky: 0, ex: 0, ey: 0 };
  function limb(px, py, ax, ay, a1, l1, a2, l2, r0, r1, r2) {
    const bx = ax + sin(a1) * l1, by = ay + cos(a1) * l1;
    const cx = bx + sin(a1 + a2) * l2, cy = by + cos(a1 + a2) * l2;
    LIMB.kx = bx;
    LIMB.ky = by;
    LIMB.ex = cx;
    LIMB.ey = cy;
    return min(tcap(px, py, ax, ay, bx, by, r0, r1), tcap(px, py, bx, by, cx, cy, r1, r2));
  }
  Mo.sdf = { circ, ell, tcap, box, smin, limb, LIMB };

  // Materials: c colour, s specular strength, n shininess, e emissive colour, ss subsurface (wraps light),
  // rf refraction (shows the scene behind, displaced).
  const mat = (c, s, n, ss) => ({ c: typeof c === 'string' ? hex(c) : c, s: s || 0.05, n: n || 8, ss: ss || 0 });
  const emit = (c) => ({ c: typeof c === 'string' ? hex(c) : c, e: typeof c === 'string' ? hex(c) : c, s: 0, n: 1 });
  Mo.mat = mat;
  Mo.emit = emit;

  const face = (e) => cos(e.rel || 0);
  const side = (e) => sin(e.rel || 0);
  const atkK = (e, wind) => (e.state === 'windup' ? min(1, e.st / wind) : e.state === 'recover' ? max(0, 1 - e.st / 0.18) : 0);

  // ---------------------------------------------------------------- creatures
  const M = {};

  M.wretch = {
    w: 1.3, h: 1.05, thick: 0.1,
    mats: [mat('#cdb6a0', 0.08, 10, 0.4), mat('#46362c', 0.02), emit('#ff6a3d'), mat('#120404'), mat('#efe4cc', 0.3, 20), mat('#2b1d18')],
    model(X, Y, e, t, o) {
      const f = face(e), s = side(e);
      const ph = e.walk || 0;
      const atk = atkK(e, 0.45);
      const br = sin(t * 2.3 + e.id) * 0.008;
      const hx = s * 0.1;
      // a gaunt hunched torso: narrow hips, heavy shoulders pushed forward
      let d = tcap(X, Y, 0, 0.6, hx * 0.8, 0.36, 0.075, 0.13 + br);
      d = smin(d, ell(X - hx * 0.6, Y - 0.38, 0.17, 0.07), 0.04);
      const head = ell(X - hx * 1.2, Y - 0.24 + atk * 0.02, 0.075, 0.09);
      d = smin(d, head, 0.035);
      let claw = 9, arms = 9;
      for (let k = -1; k <= 1; k += 2) {
        const swing = sin(ph + (k > 0 ? 0 : Math.PI)) * 0.25 * abs(s);
        const a1 = k * (0.42 + atk * 1.75) + swing;
        const a2 = -k * (0.3 - atk * 0.25);
        arms = min(arms, limb(X, Y, k * 0.16 + hx * 0.6, 0.37, a1, 0.3, a2, 0.34, 0.042, 0.03, 0.022));
        const ex = LIMB.ex, ey = LIMB.ey, dir = a1 + a2;
        for (let c = -1; c <= 1; c++) {
          const ca = dir + c * 0.32;
          claw = min(claw, tcap(X, Y, ex, ey, ex + sin(ca) * 0.11, ey + cos(ca) * 0.11, 0.012, 0.002));
        }
      }
      d = smin(d, arms, 0.02);
      for (let k = -1; k <= 1; k += 2) {
        const sw = sin(ph + (k > 0 ? Math.PI : 0));
        const a1 = k * 0.16 + sw * 0.4 * s;
        const a2 = -k * 0.3 - max(0, sw) * 0.5 * (s >= 0 ? 1 : -1) * abs(s);
        d = smin(d, limb(X, Y, k * 0.06, 0.6, a1, 0.21, a2, 0.24, 0.05, 0.034, 0.026), 0.02);
      }
      d = min(d, claw);
      o.d = d;
      if (d > 0) return;
      if (claw <= d + 1e-4) {
        o.m = 4;
        return;
      }
      const rag = 0.7 + 0.03 * sin(X * 47 + e.id) + 0.02 * sin(X * 91);
      if (Y > 0.5 && Y < rag && abs(X - hx * 0.3) < 0.13) {
        o.m = 1;
        o.k = 0.7 + 0.3 * fract(X * 13 + Y * 3);
        return;
      }
      if (f > -0.15) {
        const ex = hx * 1.2 + s * 0.03;
        if (circ(X - ex - 0.03, Y - 0.23, 0.018) < 0 || circ(X - ex + 0.03, Y - 0.23, 0.018) < 0) {
          o.m = 2;
          o.e = 1.2 + atk * 1.4;
          return;
        }
        if (ell(X - ex, Y - 0.29, 0.035, 0.007 + atk * 0.03) < 0) {
          o.m = 3;
          return;
        }
      }
      if (f > 0 && Y > 0.38 && Y < 0.52 && abs(X - hx * 0.5) < 0.07 && fract(Y * 24) < 0.32) {
        o.m = 4;
        o.k = 0.8;
        return;
      }
      if (arms <= d + 0.003) o.k = 0.85;
      else o.k = 0.85 + 0.15 * sin(Y * 30 + X * 9);
    },
    blood: '#4a0d0a',
  };

  M.moth = {
    w: 0.95, h: 0.55, thick: 0.05,
    mats: [mat('#8c7457', 0.05, 6, 0.5), mat('#d8c7a2', 0.05, 6, 0.6), emit('#ffd36a'), mat('#4a3b2b'), emit('#ff8a2a')],
    model(X, Y, e, t, o) {
      const fl = 0.25 + 0.75 * abs(sin(t * 22 + e.id));
      const body = ell(X, Y - 0.3, 0.04, 0.15);
      const a = 0.2 * fl, cx = 0.04 + a;
      let wing = 9;
      for (let k = -1; k <= 1; k += 2) {
        const wx = X - k * cx, wy = Y - 0.25;
        const up = ell(wx, wy + 0.03, a, 0.13), lo = ell(wx * 1.2, wy - 0.12, a * 0.8, 0.08);
        wing = min(wing, smin(up, lo, 0.04));
      }
      const ant = min(tcap(X, Y, 0.01, 0.16, 0.09, 0.02, 0.008, 0.004), tcap(X, Y, -0.01, 0.16, -0.09, 0.02, 0.008, 0.004));
      const d = min(smin(body, wing, 0.02), ant);
      o.d = d;
      if (d > 0) return;
      if (wing < body && wing < ant) {
        const wx = abs(X) - cx, wy = Y - 0.22;
        if (circ(wx, wy, 0.05 * fl + 0.012) < 0) {
          o.m = circ(wx, wy, 0.022 * fl + 0.006) < 0 ? 4 : 2;
          o.e = 1.4;
          return;
        }
        o.m = 1;
        o.k = abs(sin((Math.atan2(wy, wx) + X) * 9)) < 0.12 ? 0.5 : 0.85 + 0.15 * sin(Y * 60);
        return;
      }
      o.k = 0.75 + 0.25 * fract(Y * 25);
    },
    blood: '#c9a44a', bloodEmit: 0.4,
  };

  M.watcher = {
    w: 1.25, h: 2.2, thick: 0.1,
    mats: [mat('#5f5b55', 0.03), mat('#c9bfae', 0.1, 10, 0.5), mat('#efe9dc', 0.5, 30), emit('#ff2a2a'), mat('#050202', 0.8, 40), emit('#b01818')],
    model(X, Y, e, t, o) {
      const s = side(e), sway = e.data && e.data.gaze ? 0 : sin(t * 1.3 + e.id) * 0.03;
      const hw = Y > 0.85 ? 0.07 + (Y - 0.85) * 0.17 : 0;
      let d = Y > 0.85 && Y < 2.18 ? abs(X - sway * (Y - 0.85)) - hw : 9;
      d = smin(d, tcap(X, Y, 0, 0.62, 0, 1.0, 0.05, 0.1), 0.06);
      for (let k = -1; k <= 1; k += 2) {
        const arm = limb(X, Y, k * 0.11, 0.86, k * 0.12 + sway, 0.45, -k * 0.05, 0.5, 0.03, 0.022, 0.016);
        d = smin(d, arm, 0.03);
        for (let c = 0; c < 3; c++) d = min(d, tcap(X, Y, LIMB.ex, LIMB.ey, LIMB.ex + k * (c - 1) * 0.03, LIMB.ey + 0.16, 0.008, 0.003));
      }
      const ec = circ(X - s * 0.05, Y - 0.36, 0.3);
      d = smin(d, ec, 0.05);
      o.d = d;
      if (d > 0) return;
      if (ec < 0.004) {
        const ex = X - s * 0.05, ey = Y - 0.36;
        const blink = fract(t * 0.13 + e.id * 0.31) < 0.025 && !(e.data && e.data.gaze);
        if (blink && abs(ey) > 0.03) {
          o.m = 0;
          return;
        }
        const px = (e.data ? e.data.px || 0 : 0) * 0.09 + s * 0.06;
        const r = sqrt((ex - px) * (ex - px) + ey * ey);
        if (r < 0.065) {
          o.m = 4;
          return;
        }
        if (r < 0.17) {
          o.m = 3;
          o.e = (e.data && e.data.gaze ? 1.8 : 1.0) * (0.75 + 0.25 * sin(Math.atan2(ey, ex - px) * 22));
          return;
        }
        o.m = 2;
        const vein = abs(sin(Math.atan2(ey, ex) * 11 + r * 25)) < 0.07 && r > 0.21;
        if (vein) {
          o.m = 5;
          o.e = 0.35;
        }
        return;
      }
      if (Y > 0.85) {
        o.k = 0.7 + 0.3 * abs(sin((X - sway * (Y - 0.85)) * 38));
        return;
      }
      o.m = 1;
    },
    blood: '#0b0b0b',
  };

  M.hollow = {
    w: 0.95, h: 1.15, thick: 0.1,
    mats: [emit('#bfe4ff'), Object.assign(mat('#ffffff'), { rf: 1 }), emit('#6fa8ff')],
    model(X, Y, e, t, o) {
      const s = side(e), ph = e.walk || 0;
      let d = ell(X - s * 0.04, Y - 0.15, 0.09, 0.11);
      d = smin(d, tcap(X, Y, 0, 0.62, s * 0.03, 0.3, 0.1, 0.13), 0.06);
      for (let k = -1; k <= 1; k += 2) {
        d = smin(d, limb(X, Y, k * 0.13, 0.32, k * 0.25 + sin(ph) * 0.15, 0.25, -k * 0.2, 0.25, 0.04, 0.03, 0.02), 0.03);
        const sw = sin(ph + (k > 0 ? Math.PI : 0));
        d = smin(d, limb(X, Y, k * 0.06, 0.62, k * 0.06 + sw * 0.3 * s, 0.24, -max(0, sw) * 0.5, 0.26, 0.055, 0.04, 0.03), 0.03);
      }
      if (e.vis) {
        const w = 0.022 + 0.008 * sin(Y * 40 + t * 9);
        o.d = abs(d) - w;
        if (o.d > 0) return;
        o.m = 0;
        o.e = 1.2 + 0.5 * sin(t * 7 + Y * 12);
        if (abs(d) < w * 0.4) o.m = 2;
        return;
      }
      o.d = d;
      if (d > 0) return;
      o.m = 1;
      o.e = sin(Y * 30 + t * 6) * 2.2;
    },
    blood: '#9fd0ff', bloodEmit: 0.8,
  };

  M.drowned = {
    w: 1.1, h: 1.1, thick: 0.13,
    mats: [mat('#7aa596', 0.55, 30, 0.5), mat('#1a2a26', 0.3, 20), emit('#d0ff9a'), mat('#0b1310', 0.2)],
    model(X, Y, e, t, o) {
      if (e.z + (1 - Y / e.h) * e.h < 0.02) {
        o.d = 1;
        return;
      }
      const s = side(e), f = face(e), ph = e.walk || 0;
      const atk = atkK(e, 0.35);
      let d = ell(X, Y - 0.46, 0.2, 0.25);
      const head = circ(X - s * 0.05, Y - 0.17, 0.1);
      d = smin(d, head, 0.07);
      for (let k = -1; k <= 1; k += 2) {
        d = smin(d, limb(X, Y, k * 0.17, 0.36, k * (0.35 + atk * 1.6) + sin(ph + k) * 0.1, 0.26, -k * 0.3, 0.27, 0.06, 0.045, 0.035), 0.05);
        d = smin(d, limb(X, Y, k * 0.08, 0.66, k * 0.1, 0.2, 0, 0.22, 0.07, 0.05, 0.04), 0.04);
      }
      let hair = 9;
      for (let k = -3; k <= 3; k++) {
        const hx = k * 0.03 + s * 0.05;
        hair = min(hair, tcap(X, Y, hx, 0.09, hx * 1.6 + sin(t * 1.5 + k) * 0.015, 0.36 + abs(k) * 0.03, 0.014, 0.004));
      }
      d = min(d, hair);
      o.d = d;
      if (d > 0) return;
      if (hair <= d + 1e-4) {
        o.m = 1;
        return;
      }
      if (f > -0.1 && (circ(X - s * 0.05 - 0.035, Y - 0.16, 0.02) < 0 || circ(X - s * 0.05 + 0.035, Y - 0.16, 0.02) < 0)) {
        o.m = 2;
        o.e = 1.3 + atk;
        return;
      }
      if (f > 0 && ell(X - s * 0.05, Y - 0.23, 0.04, 0.01 + atk * 0.025) < 0) {
        o.m = 3;
        return;
      }
      o.k = 0.8 + 0.2 * sin(X * 23 + Y * 17 + t);
    },
    blood: '#1d3a2a',
  };

  M.choir = {
    w: 1.4, h: 1.25, thick: 0.1,
    mats: [mat('#e4d4f2', 0.2, 16, 0.6), mat('#7a4a6a', 0.1), emit('#ff4fd8'), mat('#1a0612'), emit('#ffd0f6')],
    model(X, Y, e, t, o) {
      const inh = e.state === 'inhale' ? min(1, e.st / 0.75) : 0;
      const sing = e.state === 'sing' || inh > 0;
      let d = 9, best = -1;
      const n = 5;
      const hc = [];
      for (let k = 0; k < n; k++) {
        const a = t * 0.8 + (k * G.TAU) / n + e.id;
        const cx = cos(a) * (0.38 - inh * 0.14), cy = 0.42 + sin(a) * 0.15;
        const dk = circ(X - cx, Y - cy, 0.135 + 0.01 * sin(t * 3 + k));
        hc.push(cx, cy);
        if (dk < d) {
          d = dk;
          best = k;
        }
        d = smin(d, tcap(X, Y, cx, cy + 0.08, 0, 0.72, 0.05, 0.07), 0.08);
      }
      d = smin(d, tcap(X, Y, 0, 0.7, 0, 0.9, 0.09, 0.05), 0.05);
      let tend = 9;
      for (let k = -2; k <= 2; k++) tend = min(tend, tcap(X, Y, k * 0.04, 0.85, k * 0.1 + sin(t * 2 + k * 1.7) * 0.06, 1.2, 0.025, 0.004));
      d = min(d, tend);
      const halo = inh > 0 ? abs(circ(X, Y - 0.45, 0.62 - inh * 0.3)) - 0.012 : 9;
      if (halo < d) {
        o.d = halo;
        if (halo <= 0) {
          o.m = 4;
          o.e = 0.8 + inh;
        }
        return;
      }
      o.d = d;
      if (d > 0) return;
      if (tend <= d + 1e-4) {
        o.m = 1;
        return;
      }
      const cx = hc[best * 2], cy = hc[best * 2 + 1];
      const lx = X - cx, ly = Y - cy;
      if (sqrt(lx * lx + ly * ly) < 0.14) {
        if (ell(lx, ly - 0.05, 0.045, 0.05 + inh * 0.03) < 0) {
          o.m = sing ? 2 : 3;
          o.e = 1.4 + inh;
          return;
        }
        if (abs(ly + 0.025) < 0.008 && abs(abs(lx) - 0.045) < 0.03) {
          o.m = 3;
          return;
        }
        return;
      }
      o.m = 1;
      o.k = 0.8 + 0.2 * sin(Y * 40);
    },
    blood: '#ff4fd8', bloodEmit: 0.6,
  };

  function readerSdf(X, Y, h, ph, s, lantern) {
    const k = h / 1.1;
    let d = ell(X - s * 0.02 * k, Y - 0.14 * k, 0.1 * k, 0.12 * k);
    const yy = Y / k;
    const coatW = (0.1 + (yy - 0.25) * 0.23) * k;
    const hem = 0.86 * k + sin(X * 30 + ph) * 0.01;
    if (Y > 0.22 * k && Y < hem) d = smin(d, abs(X) - coatW, 0.05);
    for (let j = -1; j <= 1; j += 2) {
      const sw = sin(ph + (j > 0 ? Math.PI : 0));
      d = smin(d, limb(X, Y, j * 0.05 * k, 0.78 * k, sw * 0.25 * s, 0.11 * k, -max(0, sw) * 0.4, 0.1 * k, 0.04 * k, 0.034 * k, 0.03 * k), 0.02);
    }
    d = smin(d, limb(X, Y, -0.14 * k, 0.32 * k, -0.45 - (lantern ? 0.25 : 0), 0.17 * k, 0.5, 0.14 * k, 0.04 * k, 0.034 * k, 0.03 * k), 0.03);
    const hx = LIMB.ex, hy = LIMB.ey;
    d = smin(d, limb(X, Y, 0.14 * k, 0.32 * k, 0.5, 0.17 * k, -0.9, 0.14 * k, 0.04 * k, 0.034 * k, 0.03 * k), 0.03);
    readerSdf.hand = [hx, hy, LIMB.ex, LIMB.ey];
    return d;
  }

  M.echo = {
    w: 1.15, h: 1.15, thick: 0.1,
    mats: [mat('#7ff6ff', 0.6, 30, 0.3), emit('#7ff6ff'), emit('#ffffff')],
    model(X, Y, e, t, o) {
      const s = side(e);
      const d0 = readerSdf(X, Y, 1.15, e.walk || 0, s, false);
      if (d0 < 0) {
        o.d = d0;
        o.k = 0.65 + 0.35 * (0.5 + 0.5 * sin(Y * 90 - t * 25));
        if (d0 > -0.018) {
          o.m = 2;
          o.e = 0.9;
        }
        return;
      }
      const off = sin(t * 2.3 + e.id) * 0.18;
      const d1 = readerSdf(X - off, Y, 1.15, (e.walk || 0) + 1, s, false);
      if (d1 < 0 && G.hash2(Math.floor(Y * 70), Math.floor(t * 30), e.id) > 0.3) {
        o.d = d1;
        o.m = 1;
        o.e = 0.28;
        return;
      }
      o.d = min(d0, d1 + 0.02);
    },
    blood: '#7ff6ff', bloodEmit: 0.7,
  };

  M.lurker = {
    w: 1.8, h: 0.9, thick: 0.08,
    mats: [mat('#6d6276', 0.25, 20), mat('#2a2230', 0.1), emit('#ffef5a'), mat('#c9b04a', 0.3, 20), mat('#120c14', 0.6, 40)],
    model(X, Y, e, t, o) {
      const ph = (e.walk || 0) * 1.6;
      const abd = ell(X, Y - 0.5, 0.2, 0.14);
      const ceph = circ(X, Y - 0.37, 0.1);
      let d = smin(abd, ceph, 0.04);
      let legs = 9;
      for (let k = 0; k < 4; k++)
        for (let s = -1; s <= 1; s += 2) {
          const p = ph + k * 1.3 + (s > 0 ? Math.PI : 0);
          const hipX = s * 0.08, hipY = 0.42 + k * 0.02;
          const kneeX = s * (0.28 + k * 0.12), kneeY = 0.06 + k * 0.05 + sin(p) * 0.04;
          const footX = s * (0.42 + k * 0.17) + cos(p) * 0.03, footY = 0.88 - max(0, sin(p)) * 0.05;
          const midX = (kneeX + footX) * 0.5 + s * 0.05, midY = (kneeY + footY) * 0.45;
          legs = min(legs, tcap(X, Y, hipX, hipY, kneeX, kneeY, 0.026, 0.02), tcap(X, Y, kneeX, kneeY, midX, midY, 0.02, 0.015), tcap(X, Y, midX, midY, footX, footY, 0.015, 0.006));
        }
      const mand = min(tcap(X, Y, 0.03, 0.43, 0.05, 0.52, 0.015, 0.004), tcap(X, Y, -0.03, 0.43, -0.05, 0.52, 0.015, 0.004));
      d = min(d, legs, mand);
      o.d = d;
      if (d > 0) return;
      if (legs <= d + 1e-4) {
        o.m = 1;
        o.k = fract((X + Y) * 14) < 0.15 ? 0.6 : 1;
        return;
      }
      if (mand <= d + 1e-4) {
        o.m = 4;
        return;
      }
      if (ceph < 0) {
        for (let k = 0; k < 8; k++) {
          const ex = ((k % 4) - 1.5) * 0.035, ey = 0.335 + (k > 3 ? 0.03 : 0);
          if (circ(X - ex, Y - ey, k > 3 ? 0.011 : 0.016) < 0) {
            o.m = 2;
            o.e = 1.6;
            return;
          }
        }
        return;
      }
      if (abs(sin(X * 26)) < 0.25 && Y > 0.45) {
        o.m = 3;
        return;
      }
      o.k = 0.8 + 0.2 * sin(Y * 50);
    },
    blood: '#e0d040', bloodEmit: 0.5,
  };

  M.maw = {
    w: 1.9, h: 1.8, thick: 0.25,
    mats: [mat('#b0857a', 0.15, 10, 0.5), mat('#ffe9d0', 0.5, 30), emit('#ff3b2f'), mat('#2a0606', 0.5, 20), mat('#d06070', 0.6, 30, 0.6), emit('#ffd34a'), mat('#5a3a34')],
    model(X, Y, e, t, o) {
      const om = (e.data && e.data.mouth) || 0;
      const br = sin(t * 1.7 + e.id) * 0.015;
      const body = circ(X, Y - 0.92, 0.8 + br);
      let d = body;
      for (let k = -1; k <= 1; k += 2) d = smin(d, tcap(X, Y, k * 0.38, 1.4, k * 0.48, 1.78, 0.11, 0.08), 0.08);
      o.d = d;
      if (d > 0) return;
      const mb = 0.04 + om * 0.34;
      const m = ell(X, Y - 1.02, 0.56, mb);
      if (m < 0) {
        const tooth = 0.075 * (0.35 + 0.65 * abs(sin(X * 36)));
        if (Y - (1.02 - mb) < tooth || 1.02 + mb - Y < tooth) {
          o.m = 1;
          return;
        }
        if (om > 0.25 && ell(X - sin(t * 3) * 0.05, Y - 1.02 - mb * 0.45, 0.18, mb * 0.4) < 0) {
          o.m = 4;
          return;
        }
        o.m = om > 0.25 ? 2 : 3;
        o.e = 0.6 + om * 0.9 + 0.2 * sin(t * 18);
        return;
      }
      for (let k = 0; k < 7; k++) {
        const ex = (k - 3) * 0.13, ey = 0.48 + abs(k - 3) * 0.045;
        const er = circ(X - ex, Y - ey, 0.045);
        if (er < 0) {
          if (fract(t * 0.21 + k * 0.37 + e.id * 0.1) < 0.05) {
            o.m = 6;
            return;
          }
          o.m = er < -0.022 ? 3 : 5;
          o.e = 1.4;
          return;
        }
      }
      o.k = 0.72 + 0.28 * sin(Y * 22 + sin(X * 7) * 2.2) * (0.6 + 0.4 * sin(X * 13));
      if (Y > 1.4) o.m = 6;
    },
    blood: '#6a0a0a',
  };

  M.redactor = {
    w: 1.6, h: 2.8, thick: 0.14,
    mats: [mat('#2b2626', 0.15, 12), mat('#c8c0b0', 0.1), mat('#050404', 0.7, 40), emit('#ff2020'), mat('#d9cfbf', 0.2, 12, 0.4), emit('#ff5a3a')],
    model(X, Y, e, t, o) {
      const s = side(e);
      const bob = sin(t * 1.5) * 0.03;
      const hw = 0.17 + max(0, Y - 0.62) * 0.21;
      let d = Y > 0.62 && Y < 2.78 ? abs(X + sin(Y * 3 + t) * 0.02) - hw : 9;
      d = smin(d, tcap(X, Y, 0, 0.62, 0, 0.9, 0.18, 0.22), 0.06);
      const head = box(X - s * 0.04, Y - 0.32 - bob, 0.17, 0.2, 0.03);
      d = min(d, head);
      const staff = tcap(X, Y, 0.55, 0.3, 0.55, 2.7, 0.04, 0.05);
      const nib = Y < 0.36 && Y > 0.08 ? abs(X - 0.55) - (Y - 0.08) * 0.25 : 9;
      d = min(d, staff, nib);
      const arm = limb(X, Y, 0.18, 0.72, -0.9, 0.3, -0.6, 0.25, 0.06, 0.05, 0.04);
      d = smin(d, arm, 0.04);
      d = smin(d, limb(X, Y, -0.18, 0.72, -0.2, 0.35, 0.3, 0.32, 0.06, 0.05, 0.04), 0.04);
      o.d = d;
      if (d > 0) return;
      if (head <= d + 1e-4) {
        o.m = abs(Y - 0.33 - bob) < 0.032 && abs(X - s * 0.04) < 0.13 ? 3 : 2;
        o.e = 1.6 + 0.4 * sin(t * 9);
        return;
      }
      if (nib <= d + 1e-4) {
        o.m = 5;
        o.e = 1.3;
        return;
      }
      if (staff <= d + 1e-4) {
        o.m = 4;
        return;
      }
      if (Y > 0.95 && abs(X) < hw * 0.8) {
        const f = fract(Y * 9 + 0.2);
        if (f < 0.32) {
          o.m = 2;
          return;
        }
        if (f > 0.55 && f < 0.6 && G.hash2(Math.floor(X * 30), Math.floor(Y * 9), 3) > 0.3) {
          o.m = 1;
          return;
        }
      }
      o.k = 0.7 + 0.3 * abs(sin(X * 21));
      if (Y < 0.95 && Y > 0.62 && abs(X) > 0.1) o.m = 4;
    },
    blood: '#050505',
  };

  M.seal = {
    w: 0.9, h: 2.1, thick: 0.12,
    mats: [mat('#1a1818', 0.5, 30), emit('#ff1d1d'), emit('#ff8a5a')],
    model(X, Y, e, t, o) {
      const hw = Y < 0.32 ? (Y / 0.32) * 0.21 : 0.21 + (Y - 0.32) * 0.07;
      const d = Y > 0 && Y < 2.08 ? abs(X) - hw : 9;
      o.d = d;
      if (d > 0) return;
      const dmg = 1 - e.hp / e.maxHp;
      const crack = abs(sin(X * 35 + Y * 9 + e.id) + sin(Y * 21 - X * 13)) < 0.12 * dmg + 0.01;
      if (crack && dmg > 0.15) {
        o.m = 2;
        o.e = 1.4 + dmg;
        return;
      }
      if (Y > 0.55 && Y < 1.6 && abs(X) < 0.13) {
        const b = G.hash2(Math.floor(X * 30 + 9), Math.floor(Y * 16), e.id);
        if (b > 0.56) {
          o.m = 1;
          o.e = 1.1 + 0.6 * sin(t * 4 + Y * 7);
          return;
        }
      }
      o.k = 0.7 + 0.3 * abs(sin(X * 40)) * (Y < 0.32 ? 1.2 : 1);
    },
  };

  M.heart = {
    w: 2.6, h: 2.6, thick: 0.6,
    mats: [mat('#2a0a0a', 0.6, 30, 0.5), emit('#ff2a2a'), emit('#ffe0b0'), mat('#050000', 0.9, 60), emit('#ff6a9a')],
    model(X, Y, e, t, o) {
      const cy = 1.3, py = Y - cy;
      const r = sqrt(X * X + py * py);
      const beat = sin(t * 3.2), pulse = 0.82 + 0.05 * beat * beat * beat;
      if (e.data && e.data.shield) {
        const sh = abs(r - 1.18) - 0.03;
        if (sh < 0 && r > pulse) {
          o.d = sh;
          o.m = 4;
          const a = Math.atan2(py, X);
          o.e = 0.6 + 0.5 * (abs(sin(a * 9 + t * 2)) > 0.9 ? 1 : 0) + 0.3 * sin(t * 4);
          return;
        }
      }
      const d = r - pulse;
      o.d = d;
      if (d > 0) return;
      if (r < 0.26) {
        o.m = abs(X) < 0.045 + 0.03 * beat && abs(py) < 0.21 ? 3 : 2;
        o.e = 2;
        return;
      }
      const a = Math.atan2(py, X);
      const vein = abs(sin(a * 7 + r * 11 - t * 1.5)) < 0.09;
      if (vein) {
        o.m = 1;
        o.e = 1 + 0.8 * max(0, beat);
        return;
      }
      const ring = 0.5 + 0.5 * sin(r * 30 - t * 5);
      if (ring > 0.8) {
        o.m = 1;
        o.e = 0.5;
        return;
      }
      o.k = 0.6 + 0.4 * ring;
    },
  };

  // The Reader: the player's own body, seen in third person and in mirror rooms.
  M.avatar = {
    w: 1.05, h: 1.15, thick: 0.1,
    mats: [mat('#5a4a3c', 0.05), mat('#2c241d', 0.05), emit('#ffcf73'), mat('#b48a4a', 0.6, 30), mat('#8a1f1f', 0.05), mat('#0a0806'), emit('#fff3c0'), emit('#ffffff')],
    model(X, Y, e, t, o) {
      const P = e.player;
      const f = face(e), s = side(e);
      const lit = P && P.lanternOn;
      let d = readerSdf(X, Y, 1.1, e.walk || 0, s, true);
      const hp = readerSdf.hand;
      const lx = hp[0] - 0.005, ly = hp[1] + 0.09;
      const lantern = box(X - lx, Y - ly, 0.05, 0.065, 0.015);
      const handle = abs(circ(X - lx, Y - ly + 0.06, 0.035)) - 0.007;
      const scarf = Y > 0.24 && Y < 0.55 ? abs(X - 0.1 - sin(Y * 12 - t * 6) * 0.03 * (Y - 0.24) * 4) - 0.035 * (1 - (Y - 0.24) * 1.5) : 9;
      let flash = 9;
      if (P && P.recoil > 0.25) {
        const fx = hp[2] + 0.04, fy = hp[3] - 0.05;
        flash = circ(X - fx, Y - fy, 0.03 + P.recoil * 0.08);
      }
      d = min(d, lantern, handle, scarf, flash);
      o.d = d;
      if (d > 0) return;
      if (flash <= d + 1e-4) {
        o.m = 7;
        o.e = 2;
        return;
      }
      if (lantern <= d + 1e-4 || handle <= d + 1e-4) {
        if (lantern < -0.012 && handle > 0) {
          o.m = lit ? 2 : 5;
          o.e = lit ? 1.4 + 0.25 * sin(t * 13) * sin(t * 7.3) : 1;
          if (lit && circ(X - lx, Y - ly - 0.01, 0.02) < 0) o.m = 6;
          return;
        }
        o.m = 3;
        return;
      }
      if (scarf <= d + 1e-4 && f < 0.5) {
        o.m = 4;
        return;
      }
      if (Y < 0.26) {
        o.m = 1;
        if (f > 0.3 && Y > 0.1 && Y < 0.2 && abs(X - s * 0.02) < 0.06) {
          o.m = 5;
          if (circ(abs(X - s * 0.02) - 0.03, Y - 0.15, 0.009) < 0) {
            o.m = 2;
            o.e = 0.8;
          }
        }
        return;
      }
      o.k = 0.75 + 0.25 * abs(sin(X * 30 + 0.5)) * (f < 0 && abs(X) < 0.01 ? 0.5 : 1);
      if (abs(X) < 0.008 && f < 0) o.k = 0.5;
    },
  };

  M.afterimage = {
    w: 1.05, h: 1.15, thick: 0.1,
    mats: [emit('#9aa8ff')],
    model(X, Y, e, t, o) {
      const d = readerSdf(X, Y, 1.1, 0, 0, true);
      o.d = abs(d) - 0.025 + (d < 0 && G.hash2(Math.floor(Y * 60), Math.floor(t * 40), 1) > 0.6 ? -0.2 : 0);
      o.e = 1.3;
    },
  };

  M.phantasm = {
    w: 1.4, h: 2.2, thick: 0.1,
    mats: [mat('#8a8a96', 0.05)],
    model(X, Y, e, t, o) {
      const m = G.Ent.defs[(e.data && e.data.mimic) || 'wretch'];
      m.model(X, Y, e, t, o);
      o.m = 0;
      o.e = 1;
      if (o.d < 0 && G.hash2(Math.floor(X * 25), Math.floor(Y * 25), Math.floor(t * 12)) > 0.85) o.d = 0.01;
    },
  };

  // ---------------------------------------------------------------- projectiles
  M.orb = {
    w: 0.4, h: 0.4, thick: 0.15,
    mats: [emit('#ffffff'), emit('#ffffff')],
    model(X, Y, e, t, o) {
      const cy = e.h * 0.5, py = Y - cy;
      const r = sqrt(X * X + py * py), R = e.h * 0.5;
      const a = Math.atan2(py, X);
      const spike = R * (0.75 + 0.25 * sin(a * 7 + t * 20 + e.id));
      o.d = r - spike;
      if (o.d > 0) return;
      o.m = r < R * 0.4 ? 1 : 0;
      o.e = r < R * 0.4 ? 2.4 : 1.2 + 0.4 * sin(t * 30);
    },
  };

  // ---------------------------------------------------------------- pickups, things, props
  M.salve = {
    w: 0.38, h: 0.42, thick: 0.08,
    mats: [Object.assign(mat('#e8e0d0', 0.8, 40), {}), emit('#ff3a3a'), mat('#8a5a34'), mat('#efe2c0')],
    model(X, Y, e, t, o) {
      const bottle = smin(circ(X, Y - 0.28, 0.12), box(X, Y - 0.12, 0.04, 0.05), 0.03);
      const cork = box(X, Y - 0.05, 0.035, 0.03, 0.01);
      const d = min(bottle, cork);
      o.d = d;
      if (d > 0) return;
      if (cork <= d + 1e-4) {
        o.m = 2;
        return;
      }
      const level = 0.24 + sin(t * 3) * 0.01 * sin(X * 20);
      if (Y > level && circ(X, Y - 0.28, 0.1) < 0) {
        o.m = 1;
        o.e = 0.9 + 0.3 * sin(t * 4);
        return;
      }
      if (abs(Y - 0.3) < 0.035 && abs(X) < 0.09) o.m = 3;
    },
  };
  M.verse = {
    w: 0.5, h: 0.32, thick: 0.08,
    mats: [mat('#efe2c0', 0.1, 8, 0.3), emit('#ff9d3d'), mat('#a07a50')],
    model(X, Y, e, t, o) {
      const scroll = tcap(X, Y, -0.17, 0.2, 0.17, 0.2, 0.08, 0.08);
      const ends = min(circ(X + 0.19, Y - 0.2, 0.05), circ(X - 0.19, Y - 0.2, 0.05));
      const d = min(scroll, ends);
      o.d = d;
      if (d > 0) return;
      if (abs(X) < 0.03) {
        o.m = 1;
        o.e = 1.1;
        return;
      }
      if (ends <= d + 1e-4) {
        o.m = 2;
        return;
      }
      o.k = 0.8 + 0.2 * abs(sin(Y * 90));
    },
  };
  M.letters = {
    w: 0.42, h: 0.34, thick: 0.06,
    mats: [mat('#3a3028', 0.1), emit('#9fe6ff')],
    model(X, Y, e, t, o) {
      const d = box(X, Y - 0.19, 0.16, 0.14, 0.02);
      o.d = d;
      if (d > 0) return;
      if (d < -0.025) {
        const gx = Math.floor((X + 0.16) * 18), gy = Math.floor((Y - 0.05) * 18);
        if (G.hash2(gx, gy, Math.floor(t * 3)) > 0.55 && fract((X + 0.16) * 18) > 0.25 && fract((Y - 0.05) * 18) > 0.25) {
          o.m = 1;
          o.e = 1.2;
        }
      }
    },
  };
  M.oil = {
    w: 0.4, h: 0.48, thick: 0.08,
    mats: [mat('#c8d0d8', 0.9, 50), emit('#ffcc3a'), mat('#5a4020')],
    model(X, Y, e, t, o) {
      const flask = smin(circ(X, Y - 0.32, 0.14), box(X, Y - 0.13, 0.035, 0.08), 0.04);
      const cap = box(X, Y - 0.04, 0.045, 0.025, 0.01);
      const d = min(flask, cap);
      o.d = d;
      if (d > 0) return;
      if (cap <= d + 1e-4) {
        o.m = 2;
        return;
      }
      const lv = 0.27 + sin(t * 2.5 + X * 9) * 0.012;
      if (Y > lv && circ(X, Y - 0.32, 0.12) < 0) {
        o.m = 1;
        o.e = 1.0 + 0.3 * sin(t * 3 + Y * 20);
      }
    },
  };
  M.ink = {
    w: 0.24, h: 0.3, thick: 0.08,
    mats: [mat('#2b20c8', 0.9, 60, 0.4), emit('#8f7bff')],
    model(X, Y, e, t, o) {
      const sq = 1 + sin(t * 4 + e.id) * 0.06;
      const d = smin(circ(X * sq, Y - 0.2, 0.075), tcap(X, Y, 0, 0.04, 0, 0.16, 0.004, 0.05), 0.03);
      o.d = d;
      if (d > 0) return;
      if (circ(X + 0.02, Y - 0.17, 0.018) < 0) {
        o.m = 1;
        o.e = 1.6;
      }
    },
  };
  M.weapon = {
    w: 0.8, h: 0.7, thick: 0.1,
    mats: [emit('#ffffff'), mat('#202020', 0.8, 40)],
    model(X, Y, e, t, o) {
      const a = t * 2, py = Y - 0.35;
      const rx = X / max(0.25, abs(cos(a)));
      const gem = abs(rx) + abs(py) - 0.26;
      const ring = abs(circ(X, py, 0.33)) - 0.008;
      const d = min(gem, ring);
      o.d = d;
      if (d > 0) return;
      if (ring <= d + 1e-4) {
        o.e = 0.6 + 0.4 * sin(Math.atan2(py, X) * 6 + t * 4);
        return;
      }
      if (gem > -0.035) {
        o.e = 1.8;
        return;
      }
      o.m = 1;
    },
  };
  M.relicdrop = Object.assign({}, M.weapon, { mats: [emit('#ffd76a'), mat('#3a2a10', 0.8, 40)] });
  M.brazier = {
    w: 0.8, h: 1.05, thick: 0.1,
    mats: [mat('#6d6152', 0.2, 10), emit('#fff3c0'), emit('#ffa53a'), emit('#ff4a1a'), mat('#2a201a')],
    model(X, Y, e, t, o) {
      const bowl = Y > 0.47 ? ell(X, Y - 0.5, 0.32, 0.11) : 9;
      const rim = box(X, Y - 0.47, 0.33, 0.02, 0.01);
      const stem = tcap(X, Y, 0, 0.58, 0, 0.98, 0.04, 0.07);
      const foot = box(X, Y - 0.99, 0.2, 0.03, 0.01);
      let d = min(bowl, rim, stem, foot);
      let fl = 9;
      if (e.lit) {
        for (let k = -2; k <= 2; k++) {
          const ph = t * (7 + k) + k * 1.7;
          const h = 0.28 + 0.1 * sin(ph) + (k === 0 ? 0.12 : 0);
          const cx = k * 0.06 + sin(t * 9 + k) * 0.02;
          fl = min(fl, tcap(X, Y, cx, 0.47, cx + sin(ph * 1.3) * 0.04, 0.47 - h, 0.07 - abs(k) * 0.012, 0.004));
        }
        d = min(d, fl);
      }
      o.d = d;
      if (d > 0) return;
      if (fl <= d + 1e-4) {
        const k = -fl / 0.06;
        o.m = k > 0.55 ? 1 : k > 0.2 ? 2 : 3;
        o.e = 1.5 + 0.3 * sin(t * 20 + Y * 30);
        return;
      }
      if (rim <= d + 1e-4) o.m = 4;
      o.k = 0.8 + 0.2 * sin(X * 30);
    },
  };
  M.lectern = {
    w: 0.9, h: 1.05, thick: 0.08,
    mats: [mat('#6b4a2c', 0.15, 12), emit('#fff2c9'), mat('#e8dcc0', 0.1), mat('#2a1a10')],
    model(X, Y, e, t, o) {
      const tilt = (X + 0.33) * 0.12;
      const book = box(X, Y - 0.27 + tilt * 0.3, 0.33, 0.05, 0.01);
      const flutter = e.read ? 0 : sin(t * 3) * 0.06;
      const page = tcap(X, Y, 0, 0.22, 0.25 * cos(flutter * 3), 0.22 - 0.12 * abs(sin(t * 1.3)) * (e.read ? 0 : 1), 0.008, 0.008);
      const post = tcap(X, Y, 0, 0.33, 0, 0.98, 0.05, 0.06);
      const base = box(X, Y - 0.99, 0.22, 0.03, 0.01);
      const d = min(book, post, base, e.read ? 9 : page);
      o.d = d;
      if (d > 0) return;
      if (book <= d + 1e-4 || page <= d + 1e-4) {
        if (Y < 0.28 || page <= d + 1e-4) {
          o.m = e.read ? 2 : 1;
          o.e = 0.7 + 0.2 * sin(t * 2);
          if (fract(X * 30) < 0.25 && abs(X) > 0.03) o.k = 0.6;
          return;
        }
        o.m = 3;
        return;
      }
      o.k = 0.7 + 0.3 * abs(sin(Y * 25));
    },
  };
  M.altar = {
    w: 1.0, h: 1.35, thick: 0.1,
    mats: [mat('#8c8270', 0.1, 8), emit('#ffd76a'), mat('#4a4438'), emit('#fff5d0')],
    model(X, Y, e, t, o) {
      const ped = min(box(X, Y - 1.0, 0.2, 0.31, 0.02), box(X, Y - 0.7, 0.27, 0.035, 0.01), box(X, Y - 1.3, 0.28, 0.04, 0.01));
      let gem = 9;
      if (!e.used) {
        const py = Y - 0.35 - sin(t * 2) * 0.04;
        const rx = X / max(0.2, abs(cos(t * 1.6)));
        gem = abs(rx) * 0.9 + abs(py) - 0.2;
      }
      const d = min(ped, gem);
      o.d = d;
      if (d > 0) return;
      if (gem <= d + 1e-4) {
        o.m = gem > -0.035 ? 3 : 1;
        o.e = 1.6;
        return;
      }
      if (fract(Y * 12) < 0.08) o.m = 2;
    },
  };
  M.exitwell = {
    w: 1.8, h: 1.8, thick: 0.3,
    mats: [mat('#3a3042', 0.3, 20), emit('#c58cff'), emit('#3a1060'), emit('#ffffff')],
    model(X, Y, e, t, o) {
      const py = Y - 0.95, r = sqrt(X * X + py * py);
      const d = r - 0.82;
      o.d = d;
      if (d > 0) return;
      const a = Math.atan2(py, X);
      if (r > 0.7) {
        o.m = 0;
        o.k = 0.7 + 0.3 * (fract(a * 4) < 0.1 ? 0.4 : 1);
        return;
      }
      const sw = sin(a * 5 - r * 14 + t * 3);
      if (r < 0.06) {
        o.m = 3;
        o.e = 2;
        return;
      }
      o.m = sw > 0.25 ? 1 : 2;
      o.e = sw > 0.25 ? 1.2 + (0.7 - r) : 0.5 + r;
    },
  };
  M.remnant = {
    w: 0.75, h: 0.95, thick: 0.1,
    mats: [mat('#8d8d8d', 0.1), emit('#9ab3ff'), mat('#4a5a3a', 0.05), mat('#3a3a3a')],
    model(X, Y, e, t, o) {
      const d = smin(box(X, Y - 0.58, 0.23, 0.35, 0.02), circ(X, Y - 0.25, 0.23), 0.02);
      o.d = d;
      if (d > 0) return;
      const glyph = (abs(X) < 0.025 && Y > 0.25 && Y < 0.62) || (abs(Y - 0.36) < 0.02 && abs(X) < 0.1);
      if (glyph) {
        o.m = 1;
        o.e = e.claimed ? 0.2 : 1.1 + 0.3 * sin(t * 2);
        return;
      }
      if (G.noise2(X * 12, Y * 12, 3) > 0.62 + (Y - 0.4) * 0.3) o.m = 2;
      if (fract(Y * 30) < 0.06 && Y > 0.7) o.m = 3;
    },
  };
  M.prop = {
    w: 0.85, h: 0.9, thick: 0.06,
    mats: [mat('#8a5a33', 0.1), mat('#d8c8a8', 0.2, 10, 0.4), emit('#ffcf73'), mat('#d8cfba', 0.2, 12), mat('#4fa58f', 0.3, 20), emit('#7fffe0'), mat('#9b7ae0', 0.9, 60), emit('#e9d6ff'), mat('#100808')],
    model(X, Y, e, t, o) {
      const k = e.kind2, H = e.h;
      if (k === 'candles') {
        let d = 9, fl = 9;
        for (let i = 0; i < 3; i++) {
          const cx = (i - 1) * 0.12 + (i === 1 ? 0 : 0.01), top = 0.15 + ((i * 7) % 3) * 0.06;
          d = min(d, box(X - cx, Y - (top + H) / 2, 0.025, (H - top) / 2, 0.006));
          fl = min(fl, ell(X - cx + sin(t * 11 + i) * 0.008, Y - top + 0.045, 0.018, 0.04 + 0.008 * sin(t * 15 + i)));
        }
        d = min(d, fl);
        o.d = d;
        if (d > 0) return;
        if (fl <= d + 1e-4) {
          o.m = 2;
          o.e = 1.6;
          return;
        }
        o.m = 1;
        o.k = 0.85 + 0.15 * sin(Y * 60);
        return;
      }
      if (k === 'bones') {
        const skull = circ(X + 0.1, Y - (H - 0.15), 0.1);
        const d = min(skull, tcap(X, Y, -0.05, H - 0.04, 0.3, H - 0.1, 0.03, 0.03), tcap(X, Y, -0.28, H - 0.02, 0.1, H - 0.06, 0.025, 0.02));
        o.d = d;
        if (d > 0) return;
        o.m = 3;
        if (skull < 0 && (circ(X + 0.135, Y - (H - 0.16), 0.024) < 0 || circ(X + 0.065, Y - (H - 0.16), 0.024) < 0)) o.m = 8;
        return;
      }
      if (k === 'coral') {
        let d = tcap(X, Y, 0, H, 0, 0.3, 0.035, 0.02);
        d = min(d, tcap(X, Y, 0, 0.6, -0.22, 0.22, 0.025, 0.012), tcap(X, Y, 0, 0.5, 0.24, 0.12, 0.025, 0.012), tcap(X, Y, -0.1, 0.42, -0.3, 0.48, 0.02, 0.01));
        const tips = min(circ(X + 0.22, Y - 0.22, 0.03), circ(X - 0.24, Y - 0.12, 0.03), circ(X, Y - 0.3, 0.03), circ(X + 0.3, Y - 0.48, 0.025));
        d = min(d, tips);
        o.d = d;
        if (d > 0) return;
        o.m = tips <= d + 1e-4 ? 5 : 4;
        o.e = 1 + 0.4 * sin(t * 2 + X * 9);
        return;
      }
      if (k === 'crystals') {
        let d = 9;
        for (let i = 0; i < 3; i++) {
          const cx = (i - 1) * 0.14, top = 0.08 + abs(i - 1) * 0.25;
          if (Y > top) d = min(d, abs(X - cx + (Y - top) * (i - 1) * 0.15) - ((Y - top) / (H - top)) * 0.075);
        }
        o.d = d;
        if (d > 0) return;
        o.m = d > -0.012 ? 7 : 6;
        o.e = 0.9 + 0.3 * sin(t * 1.5 + Y * 8);
        return;
      }
      let d = 9, best = 0;
      for (let i = 0; i < 4; i++) {
        const di = box(X - sin(i * 2.3) * 0.05, Y - (H - 0.06 - i * 0.11), 0.24 - i * 0.025, 0.05, 0.008);
        if (di < d) {
          d = di;
          best = i;
        }
      }
      o.d = d;
      if (d > 0) return;
      const sx = X - sin(best * 2.3) * 0.05;
      if (abs(sx) > 0.2 - best * 0.025) {
        o.m = 1;
        o.k = fract(Y * 80) < 0.4 ? 0.7 : 1;
        return;
      }
      o.k = 0.6 + 0.4 * G.hash2(best, e.id, 1);
    },
  };

  // ---------------------------------------------------------------- weapons in hand
  // Viewmodel space: the grip pivot is (0,0), Y negative is up the screen; one unit is about
  // half the screen height. `p` is the player, `c` the charge/heat amount.
  const V = {};
  const vmats = (body, accent, glow) => [mat(body, 0.35, 20), mat('#b8893a', 0.9, 50), mat('#2a1d14', 0.05, 6), emit(glow), mat(accent, 0.6, 30), emit('#fff6d8'), mat('#0b0806', 0.5, 30), mat('#d8c8a8', 0.1, 8, 0.4)];
  function hand(X, Y, o, best) {
    const palm = box(X + 0.01, Y + 0.1, 0.12, 0.1, 0.05);
    let fing = 9;
    for (let i = 0; i < 4; i++) fing = min(fing, tcap(X, Y, -0.11 + i * 0.03, -0.05 - i * 0.012, 0.11, -0.08 - i * 0.03, 0.024, 0.02));
    const thumb = tcap(X, Y, 0.1, 0.0, 0.03, -0.2, 0.026, 0.02);
    const d = smin(palm, min(fing, thumb), 0.02);
    if (d < best) {
      o.d = d;
      o.m = 2;
      o.k = 0.75 + 0.25 * abs(sin(X * 40 + Y * 10));
      return d;
    }
    return best;
  }
  function flash(X, Y, o, best, tipX, tipY, r, seed, col) {
    if (r <= 0.02) return best;
    const dx = X - tipX, dy = Y - tipY;
    const rr = sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
    const rays = 0.55 + 0.45 * abs(sin(a * 4 + seed)) * abs(sin(a * 7 + seed * 2.3));
    const d = rr - r * rays;
    if (d < best) {
      o.d = d;
      o.m = rr < r * 0.35 ? 5 : col;
      o.e = 2.2 - rr / r;
      return d;
    }
    return best;
  }
  V.quill = {
    mats: vmats('#6a4a30', '#c8d0d8', '#3a2cff'), box: [-0.3, 0.3, -1.25, 0.25], tip: [0, -1.02],
    model(X, Y, p, c, t, o) {
      let best = 9;
      const body = tcap(X, Y, 0, -0.2, 0, -0.78, 0.085, 0.052);
      if (body < best) {
        best = body;
        o.d = body;
        o.m = 0;
        o.k = 0.8 + 0.2 * abs(sin(Y * 60));
        for (const b of [-0.34, -0.6]) if (abs(Y - b) < 0.022) o.m = 1;
      }
      const vial = ell(X - 0.075, Y + 0.48, 0.035, 0.1);
      if (vial < best) {
        best = vial;
        o.d = vial;
        const lvl = -0.5 + sin(t * 2) * 0.01 + (p.recoil || 0) * 0.02;
        o.m = Y > lvl ? 3 : 4;
        o.e = 0.9;
      }
      const nibW = Y < -0.78 && Y > -1.03 ? ((Y + 1.03) / 0.25) * 0.05 : -1;
      const nib = nibW > 0 ? abs(X) - nibW : 9;
      if (nib < best) {
        best = nib;
        o.d = nib;
        o.m = abs(X) < 0.004 ? 6 : 4;
      }
      best = hand(X, Y, o, best);
      best = flash(X, Y, o, best, 0, -1.08, (p.recoil || 0) * 0.32, p.letterIdx || 1, 3);
      void c;
    },
  };
  V.psalter = {
    mats: vmats('#5a2a1a', '#c8a050', '#ffb04a'), box: [-0.4, 0.4, -1.3, 0.25], tip: [0, -1.02],
    model(X, Y, p, c, t, o) {
      let best = 9;
      const kick = (p.recoil || 0) * 0.04;
      const book = box(X, Y + 0.42, 0.21, 0.27, 0.03);
      if (book < best) {
        best = book;
        o.d = book;
        o.m = 0;
        o.k = 0.75 + 0.25 * G.noise2(X * 30, Y * 30, 2);
        if (abs(book) < 0.025 || abs(abs(X) - 0.17) < 0.006) o.m = 1;
        if (X > 0.17) {
          o.m = 7;
          o.k = fract(Y * 70) < 0.5 ? 0.8 : 1;
        }
        if (circ(X, Y + 0.42, 0.05) < 0) o.m = 1;
      }
      for (let k = -1; k <= 1; k += 2) {
        const br = tcap(X, Y, k * 0.075, -0.62 + kick, k * 0.05, -1.0 + kick, 0.055, 0.042);
        if (br < best) {
          best = br;
          o.d = br;
          o.m = 4;
          if (Y < -0.95 + kick) o.m = 6;
        }
      }
      best = hand(X, Y, o, best);
      best = flash(X, Y, o, best, 0, -1.1, (p.recoil || 0) * 0.5, p.letterIdx + t, 3);
      void c;
    },
  };
  V.litany = {
    mats: vmats('#2a3440', '#9aa8b8', '#9fe6ff'), box: [-0.35, 0.35, -1.25, 0.25], tip: [0, -1.04],
    model(X, Y, p, c, t, o) {
      let best = 9;
      const drum = box(X, Y + 0.45, 0.17, 0.22, 0.04);
      if (drum < best) {
        best = drum;
        o.d = drum;
        o.m = 0;
        if (drum < -0.03) {
          const sc = (p.letterIdx || 0) * 0.1;
          const gx = (X + 0.17) * 11, gy = (Y + 0.67) * 9 + sc;
          const fx = fract(gx), fy = fract(gy);
          if (fx > 0.12 && fy > 0.12) {
            o.m = G.hash2(Math.floor(gx), Math.floor(gy), 4) > 0.4 ? 3 : 6;
            o.e = 0.8 + 0.6 * (p.recoil || 0);
          }
        }
      }
      const barrel = tcap(X, Y, 0, -0.66, 0, -1.02, 0.045, 0.035);
      if (barrel < best) {
        best = barrel;
        o.d = barrel;
        o.m = 4;
      }
      for (const fy of [-0.75, -0.85, -0.95]) {
        const fin = box(X, Y - fy, 0.075, 0.012, 0.005);
        if (fin < best) {
          best = fin;
          o.d = fin;
          o.m = 1;
        }
      }
      best = hand(X, Y, o, best);
      best = flash(X, Y, o, best, 0, -1.07, (p.recoil || 0) * 0.35, p.letterIdx || 1, 3);
      void c;
    },
  };
  V.lance = {
    mats: vmats('#3a2c20', '#b8893a', '#ffcf73'), box: [-0.35, 0.35, -1.2, 0.25], tip: [0, -0.82],
    model(X, Y, p, c, t, o) {
      let best = 9;
      const beam = p.beaming ? 1 : 0;
      const pole = tcap(X, Y, 0, -0.08, 0, -0.62, 0.035, 0.03);
      if (pole < best) {
        best = pole;
        o.d = pole;
        o.m = 1;
      }
      const cage = ell(X, Y + 0.82, 0.14, 0.18);
      if (cage < best) {
        best = cage;
        o.d = cage;
        const bars = abs(fract(X * 10 + 0.5) - 0.5) < 0.09 || abs(Y + 0.82) > 0.155;
        if (bars) o.m = 1;
        else {
          const fh = 0.11 + beam * 0.04 + sin(t * 17) * 0.01;
          const fl = ell(X + sin(t * 9 + Y * 20) * 0.01, Y + 0.8 - fh * 0.3, 0.05 + beam * 0.03, fh);
          if (fl < 0) {
            o.m = fl < -0.03 ? 5 : 3;
            o.e = 1.6 + beam * 1.2;
          } else {
            o.m = 3;
            o.e = 0.25 + beam * 0.6 + (p.lanternOn ? 0.2 : 0);
          }
        }
      }
      const cap = min(box(X, Y + 1.02, 0.08, 0.025, 0.01), abs(circ(X, Y + 1.08, 0.04)) - 0.01);
      if (cap < best) {
        best = cap;
        o.d = cap;
        o.m = 1;
      }
      best = hand(X, Y, o, best);
      void c;
    },
  };
  V.word = {
    mats: vmats('#c8a890', '#8a4ac8', '#d58cff'), box: [-0.45, 0.45, -1.15, 0.25], tip: [0, -0.72],
    model(X, Y, p, c, t, o) {
      let best = 9;
      const ready = p.cd <= 0 ? 1 : 0.3;
      let d = ell(X, Y + 0.2, 0.17, 0.12);
      for (let i = 0; i < 4; i++) {
        const fx = -0.12 + i * 0.08, curl = sin(t * 1.5 + i) * 0.02;
        d = smin(d, tcap(X, Y, fx, -0.25, fx * 1.4 + curl, -0.5 - (i === 1 || i === 2 ? 0.05 : 0), 0.03, 0.022), 0.03);
      }
      d = smin(d, tcap(X, Y, 0.16, -0.18, 0.28, -0.33, 0.032, 0.024), 0.03);
      if (d < best) {
        best = d;
        o.d = d;
        o.m = 7;
        if (abs(sin(X * 40 + sin(Y * 30) * 1.5)) < 0.12 && ell(X, Y + 0.2, 0.15, 0.1) < 0) {
          o.m = 3;
          o.e = 0.6 * ready + 0.2;
        }
      }
      const sx = 0, sy = -0.72 + sin(t * 2) * 0.02;
      const flare = 1 + (p.recoil || 0) * 1.8;
      const r = sqrt((X - sx) ** 2 + (Y - sy) ** 2) / flare;
      const a = Math.atan2(Y - sy, X - sx) + t * 1.5;
      const ring = abs(r - 0.11) - 0.01;
      const rune = r < 0.1 ? abs(sin(a * 3)) * r - 0.006 : 9;
      const sig = min(ring, rune, abs(r - 0.16 - 0.01 * sin(a * 12)) - 0.004);
      if (sig < best) {
        best = sig;
        o.d = sig;
        o.m = 3;
        o.e = (1.2 + (p.recoil || 0) * 2) * ready + 0.2;
      }
      void c;
    },
  };
  V.palimpsest = {
    mats: vmats('#2a1a1a', '#8a8070', '#ff4a3a'), box: [-0.4, 0.4, -1.3, 0.25], tip: [0, -1.1],
    model(X, Y, p, c, t, o) {
      let best = 9;
      const jit = c > 0.9 ? sin(t * 80) * 0.004 : 0;
      for (let k = -1; k <= 1; k += 2) {
        const rail = tcap(X + jit, Y, k * 0.07, -0.15, k * 0.04, -1.08, 0.028, 0.02);
        if (rail < best) {
          best = rail;
          o.d = rail;
          o.m = 4;
        }
      }
      for (let i = 0; i < 9; i++) {
        const py = -0.25 - i * 0.09;
        const w = 0.07 - i * 0.003;
        const pg = box(X, Y - py, w, 0.015, 0.004);
        if (pg < best) {
          best = pg;
          o.d = pg;
          o.m = 7;
          if (c > i / 9) {
            o.m = 3;
            o.e = 0.8 + c;
          }
        }
      }
      if (c > 0.05) {
        for (let i = 0; i < 5; i++) {
          const a = t * 6 + i * 1.26, yy = -0.3 - ((t * 0.8 + i * 0.2) % 1) * 0.75;
          const orb = circ(X - cos(a) * 0.11, Y - yy, 0.012 + c * 0.012);
          if (orb < best) {
            best = orb;
            o.d = orb;
            o.m = 3;
            o.e = 2;
          }
        }
        const core = abs(X) - 0.006 - c * 0.01;
        if (Y < -0.2 && Y > -1.08 && core < best) {
          best = core;
          o.d = core;
          o.m = 5;
          o.e = c * 1.5;
        }
      }
      best = hand(X, Y, o, best);
      best = flash(X, Y, o, best, 0, -1.14, (p.recoil || 0) * 0.45, t * 3, 3);
    },
  };
  Mo.vm = V;

  // Light spilled by glowing parts: [r, g, b, radius, intensity].
  const LIGHT = {
    wretch: (e) => (e.state === 'windup' ? [1, 0.4, 0.2, 2, 0.5] : null),
    moth: () => [1, 0.8, 0.3, 2, 0.35],
    watcher: (e) => (e.data.gaze ? [1, 0.1, 0.08, 4, 1.0] : [0.8, 0.1, 0.1, 2.5, 0.4]),
    hollow: (e) => (e.vis ? [0.6, 0.8, 1, 2.5, 0.5] : null),
    drowned: (e) => ((e.data.surf || 0) > 0.5 ? [0.6, 1, 0.5, 1.8, 0.3] : null),
    choir: (e) => [1, 0.3, 0.85, 3, e.state === 'inhale' ? 1.0 : 0.35],
    echo: () => [0.5, 1, 1, 2.5, 0.35],
    lurker: () => [1, 0.95, 0.3, 1.6, 0.3],
    maw: (e) => ((e.data.mouth || 0) > 0.3 ? [1, 0.2, 0.1, 3.5, e.data.mouth] : null),
    redactor: () => [1, 0.1, 0.1, 4, 0.7],
    seal: () => [1, 0.1, 0.1, 3, 0.6],
    heart: (e, g) => [1, 0.15, 0.1, 9, 1.0 + 0.3 * Math.sin(g.time * 3.2)],
    weapon: () => [1, 1, 1, 2, 0.45],
    altar: (e) => (e.used ? null : [1, 0.85, 0.4, 3, 0.6]),
  };
  // Small continuous effects: embers, swirls, drips.
  const FX = {
    brazier(e, g, dt) {
      if (e.lit && Math.random() < dt * 14)
        g.part({ x: e.x + G.rand.range(-0.15, 0.15), y: e.y + G.rand.range(-0.15, 0.15), z: 0.75, vx: G.rand.range(-0.2, 0.2), vy: G.rand.range(-0.2, 0.2), vz: G.rand.range(0.6, 1.4), drag: 0.6, life: G.rand.range(0.6, 1.4), g: G.Glyphs.ch(G.rand.chance(0.5) ? '.' : '*'), ramp: g.FIRE, add: true, glow: 0.9 });
      if (e.lit && Math.random() < dt * 2) g.smoke(e.x, e.y, 1.0, 1, 0.25, [0.3, 0.27, 0.25], 0.7);
    },
    exitwell(e, g, dt) {
      if (Math.random() < dt * 24) {
        const a = G.rand.range(0, G.TAU), r = G.rand.range(0.3, 0.9);
        g.part({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, z: G.rand.range(0, 1.5), vx: -Math.sin(a) * 1.2 - Math.cos(a) * 0.4, vy: Math.cos(a) * 1.2 - Math.sin(a) * 0.4, vz: -0.3, life: 0.8, g: G.Glyphs.id('sa:' + G.rand.int(0, 95)), r: 0.75, gr: 0.5, b: 1, add: true, glow: 0.7 });
      }
    },
    choir(e, g, dt) {
      if (e.state === 'inhale' && Math.random() < dt * 40) {
        const a = G.rand.range(0, G.TAU), r = G.rand.range(1, 1.8);
        g.part({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, z: e.z + 0.5 + G.rand.range(-0.4, 0.4), vx: -Math.cos(a) * r * 2, vy: -Math.sin(a) * r * 2, life: 0.45, g: G.Glyphs.id('sym:dot'), r: 1, gr: 0.4, b: 0.9, add: true, glow: 0.8, streak: 0.04 });
      }
    },
    drowned(e, g, dt) {
      if ((e.data.surf || 0) > 0.6 && Math.random() < dt * 8) g.part({ x: e.x + G.rand.range(-0.2, 0.2), y: e.y + G.rand.range(-0.2, 0.2), z: e.z + e.h * 0.8, grav: 8, life: 0.8, g: G.Glyphs.ch("'"), r: 0.5, gr: 0.9, b: 0.9, lit: true });
      if (e.data.mode === 'rise' && Math.random() < dt * 10) g.ring(e.x, e.y, 0.02, 0.1, 0.9, 0.7, [0.4, 0.85, 0.9], { water: true });
    },
    heart(e, g, dt) {
      if (Math.random() < dt * 20) {
        const a = G.rand.range(0, G.TAU);
        g.part({ x: e.x + Math.cos(a) * 1.4, y: e.y + Math.sin(a) * 1.4, z: e.z + G.rand.range(0, 2.4), vx: -Math.cos(a) * 1.2, vy: -Math.sin(a) * 1.2, life: 1, g: G.Glyphs.id('sb:' + G.rand.int(0, 95)), r: 1, gr: 0.2, b: 0.15, add: true, glow: 0.8 });
      }
    },
    seal(e, g, dt) {
      if (e.hp < e.maxHp * 0.6 && Math.random() < dt * 6) g.sparks(e.x, e.y, G.rand.range(0.3, 1.8), 1, 1.2, 0, 0, [1, 0.3, 0.2]);
    },
    watcher(e, g, dt) {
      if (e.data.gaze && Math.random() < dt * 6) {
        const P = g.player;
        const t = G.rand.next();
        g.part({ x: e.x + (P.x - e.x) * t, y: e.y + (P.y - e.y) * t, z: 1.8 + (0.5 - 1.8) * t, life: 0.25, g: G.Glyphs.id('sym:dot'), r: 1, gr: 0.1, b: 0.1, add: true, glow: 0.6 });
      }
    },
  };

  // ---------------------------------------------------------------- attach to definitions
  Mo.attach = function () {
    for (const k in M) {
      const d = E.defs[k];
      if (!d) continue;
      d.model = M[k].model;
      d.mats = M[k].mats;
      d.thick = M[k].thick;
      if (M[k].w) d.w = M[k].w;
      if (M[k].h && k !== 'prop' && k !== 'phantasm') d.h = M[k].h;
      if (M[k].blood) {
        d.blood = hex(M[k].blood);
        d.bloodEmit = M[k].bloodEmit || 0;
      }
    }
    for (const k in LIGHT) if (E.defs[k]) E.defs[k].light = LIGHT[k];
    for (const k in FX) if (E.defs[k]) E.defs[k].fx = FX[k];
    E.defs.redactor.minLight = 0.25;
  };
})();
