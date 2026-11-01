'use strict';
// The hand. One skeletal hand, rigged finger by finger, holds every weapon. What each weapon
// releases is energy with its own form and colour, drawn from the palm or the fingertips.
// Each frame:
//   animate  springs the fingers toward what the Reader is doing (walking, firing, charging,
//            switching, dashing, erasing, being hurt) and lays the rig out as capsules;
//   sample   answers, for every pixel, how far it is from the nearest bone or energy.
// The renderer draws the hand from those answers, then lights the air around the energy.
(function () {
  const G = window.G;
  const { sin, cos, atan2, sqrt, exp, PI, min, max, abs, floor } = Math;
  const clamp = G.clamp;
  const H = (G.Hand = { ready: false, wid: null, box: [0, 0, 0, 0], halos: [], mats: {}, model: null });
  const HS = 1.35; // the hand's scale, in model units

  // ---------------------------------------------------------------- materials
  // Every weapon fills the same slots with its own colours.
  //   0 bone, 1 bone in shadow, 2 cloth, 3 energy, 4 energy edge, 5 white-hot core, 6 void, 7 claw.
  const BONE = ['#dcd0b4', '#4e4438', '#2a1c2e', '#b8a88a', '#07030c'];
  const ENERGY = {
    quill: { a: '#ffd46b', b: '#fff2c8', core: '#ffffff', rgb: [1.0, 0.84, 0.42], rgb2: [1.0, 0.95, 0.78] },
    psalter: { a: '#ff9d3a', b: '#ff5c1e', core: '#fff1cc', rgb: [1.0, 0.6, 0.22], rgb2: [1.0, 0.36, 0.1] },
    litany: { a: '#8fe6ff', b: '#c8f6ff', core: '#ffffff', rgb: [0.56, 0.9, 1.0], rgb2: [0.8, 0.96, 1.0] },
    lance: { a: '#ffb347', b: '#ff7a1a', core: '#fff6d6', rgb: [1.0, 0.72, 0.28], rgb2: [1.0, 0.48, 0.1] },
    word: { a: '#b25cff', b: '#ff6ad5', core: '#eedcff', rgb: [0.7, 0.36, 1.0], rgb2: [1.0, 0.42, 0.84] },
    palimpsest: { a: '#6ef2ff', b: '#ff4a3a', core: '#ffffff', rgb: [0.42, 0.95, 1.0], rgb2: [1.0, 0.29, 0.23] },
  };
  for (const id in ENERGY) {
    const E = ENERGY[id], M = G.Models;
    H.mats[id] = [
      M.mat(BONE[0], 0.5, 30, 0.35),
      M.mat(BONE[1], 0.2, 10),
      M.mat(BONE[2], 0.2, 12),
      M.emit(E.a),
      M.emit(E.b),
      M.emit(E.core),
      M.mat(BONE[4], 0.9, 60),
      M.mat(BONE[3], 0.4, 20),
    ];
  }

  // ---------------------------------------------------------------- poses and springs
  // curl: thumb, index, middle, ring, little (radians of bend). spread: how far the fingers fan.
  const POSE = {
    quill: { curl: [0.35, 0.0, 1.05, 1.15, 1.2], spread: 0.6 },
    psalter: { curl: [0.05, 0.08, 0.1, 0.12, 0.18], spread: 1.9 },
    litany: { curl: [0.5, 0.25, 0.4, 0.55, 0.7], spread: 1.0 },
    lance: { curl: [1.1, 1.25, 1.3, 1.35, 1.35], spread: 0.25 },
    word: { curl: [0.55, 0.5, 0.55, 0.6, 0.7], spread: 1.45 },
    palimpsest: { curl: [0.85, 0.02, 1.1, 1.2, 1.25], spread: 0.45 },
  };
  // Velocity given to the springs when the hand acts: [thumb, index, middle, ring, little, spread].
  const KICK = {
    quill: [0.5, 5, 0, 0, 0, 0],
    psalter: [-2, -3, -3, -3, -3, 4],
    litany: [0, 4, 2.5, 0, 0, 0],
    lance: [-3, -4, -4, -4, -4, 0],
    word: [0.5, 1.5, 1.5, 1.5, 1.5, -2],
    palimpsest: [-2, 4, 0, 0, 0, 0],
  };
  const HURT = [3, -4, 4, -4, 4, 0];

  // ---------------------------------------------------------------- anatomy (base units, scaled by HS)
  // knuckle: where a finger meets the palm; lens: phalanx lengths; fan: resting splay; side: the
  // way a curl bends the finger, toward the middle of the palm; mc: where the metacarpal meets the wrist.
  const FINGER = [
    { kx: -0.105, ky: -0.34, lens: [0.12, 0.085, 0.06], fan: -0.12, side: 1, mc: [-0.07, -0.07] },
    { kx: -0.035, ky: -0.37, lens: [0.135, 0.095, 0.066], fan: 0.0, side: 1, mc: [-0.035, -0.07] },
    { kx: 0.03, ky: -0.36, lens: [0.125, 0.088, 0.062], fan: 0.1, side: -1, mc: [0.02, -0.07] },
    { kx: 0.093, ky: -0.32, lens: [0.095, 0.067, 0.052], fan: 0.22, side: -1, mc: [0.06, -0.06] },
  ];
  const FLEX = [0.55, 0.85, 0.6]; // how far each joint bends per unit of curl
  const FRAD = [[0.027, 0.022], [0.022, 0.018], [0.018, 0.011]];
  const THUMB = { cx: -0.13, cy: -0.12, mx: -0.165, my: -0.24, rest: -2.25, lens: [0.1, 0.08] };
  const TRAD = [[0.026, 0.02], [0.02, 0.011]];

  // ---------------------------------------------------------------- capsule store
  // Every bone and energy shape is a capsule (a point is a capsule of zero length):
  // ax, ay, bx, by, ra, rb, material, emission, and its bounding box with a margin.
  const MAXS = 110, SK = 12;
  const SEG = new Float32Array(MAXS * SK);
  let NS = 0;
  function cap(ax, ay, bx, by, ra, rb, mat, em) {
    if (NS >= MAXS) return;
    const o = NS * SK, m = max(ra, rb) + 0.03;
    SEG[o] = ax;
    SEG[o + 1] = ay;
    SEG[o + 2] = bx;
    SEG[o + 3] = by;
    SEG[o + 4] = ra;
    SEG[o + 5] = rb;
    SEG[o + 6] = mat;
    SEG[o + 7] = em;
    SEG[o + 8] = min(ax, bx) - m;
    SEG[o + 9] = min(ay, by) - m;
    SEG[o + 10] = max(ax, bx) + m;
    SEG[o + 11] = max(ay, by) + m;
    NS++;
  }

  // A uniform grid over the hand: each cell lists the capsules that can reach it, so a pixel only
  // tests its neighbours rather than every bone.
  const GN = 24;
  const GCNT = new Int32Array(GN * GN), GSTART = new Int32Array(GN * GN + 1);
  const GITEMS = new Int32Array(MAXS * GN * GN);
  let GX0 = 0, GY0 = 0, GSX = 1, GSY = 1;
  const EXT = []; // extra bounds for shapes that are not capsules (the orb's rings, the beam)
  function cellRange(b) {
    const x0 = clamp(floor((SEG[b + 8] - GX0) * GSX), 0, GN - 1), x1 = clamp(floor((SEG[b + 10] - GX0) * GSX), 0, GN - 1);
    const y0 = clamp(floor((SEG[b + 9] - GY0) * GSY), 0, GN - 1), y1 = clamp(floor((SEG[b + 11] - GY0) * GSY), 0, GN - 1);
    return [x0, x1, y0, y1];
  }
  function buildGrid() {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let s = 0; s < NS; s++) {
      const b = s * SK;
      x0 = min(x0, SEG[b + 8]);
      y0 = min(y0, SEG[b + 9]);
      x1 = max(x1, SEG[b + 10]);
      y1 = max(y1, SEG[b + 11]);
    }
    for (const e of EXT) {
      x0 = min(x0, e[0]);
      y0 = min(y0, e[1]);
      x1 = max(x1, e[2]);
      y1 = max(y1, e[3]);
    }
    if (x1 < x0) {
      x0 = y0 = -0.1;
      x1 = y1 = 0.1;
    }
    GX0 = x0;
    GY0 = y0;
    GSX = GN / max(1e-6, x1 - x0);
    GSY = GN / max(1e-6, y1 - y0);
    GCNT.fill(0);
    for (let s = 0; s < NS; s++) {
      const [a, b2, c, d] = cellRange(s * SK);
      for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b2; cx++) GCNT[cy * GN + cx]++;
    }
    let acc = 0;
    for (let c = 0; c < GN * GN; c++) {
      GSTART[c] = acc;
      acc += GCNT[c];
      GCNT[c] = 0;
    }
    GSTART[GN * GN] = acc;
    for (let s = 0; s < NS; s++) {
      const [a, b2, c, d] = cellRange(s * SK);
      for (let cy = c; cy <= d; cy++)
        for (let cx = a; cx <= b2; cx++) {
          const cell = cy * GN + cx;
          GITEMS[GSTART[cell] + GCNT[cell]++] = s;
        }
    }
    H.box = [x0, x1, y0, y1];
  }

  // ---------------------------------------------------------------- shapes too irregular for capsules
  // kind: 0 none, 1 the Unspoken Word's orb, 2 the lantern flame.
  const SP = { kind: 0, w: null, l: null };
  let SPM = 0, SPE = 0;
  function wordField(X, Y) {
    const W = SP.w, dx = X - W.x, dy = Y - W.y, rr = sqrt(dx * dx + dy * dy);
    let best = 9;
    if (rr > W.r * 2.7) return best;
    // the rim: a thin bright seam where the void meets the light
    const rim = abs(rr - W.r) - 0.011;
    if (rim < best) {
      best = rim;
      SPM = 3;
      SPE = W.rimE;
    }
    // six runes turning on the inner ring
    const ri = W.r * 0.56;
    if (abs(rr - ri) < 0.03 && sin((atan2(dy, dx) - W.spin) * 3) > 0.55) {
      const d = abs(rr - ri) - 0.007;
      if (d < best) {
        best = d;
        SPM = 4;
        SPE = 0.9 + 0.8 * W.ready;
      }
    }
    // eight motes on the outer ring
    const ro = W.r * 1.6;
    if (abs(rr - ro) < 0.03) {
      const step = PI / 4, k = Math.round((atan2(dy, dx) - W.spin2) / step), a = W.spin2 + k * step;
      const mx = X - (W.x + cos(a) * ro), my = Y - (W.y + sin(a) * ro);
      const d = sqrt(mx * mx + my * my) - 0.009;
      if (d < best) {
        best = d;
        SPM = 4;
        SPE = 1.0 + 0.6 * W.ready;
      }
    }
    // the release: after a shot a ring leaves the orb and fades as it grows
    if (W.rk > 0.04) {
      const rr2 = W.r * (1 + 1.4 * (1 - W.rk));
      const d = abs(rr - rr2) - 0.006 * (0.4 + W.rk);
      if (d < best) {
        best = d;
        SPM = 4;
        SPE = 1.4 * W.rk;
      }
    }
    return best;
  }
  function lanceField(X, Y) {
    const L = SP.l;
    if (abs(X) > L.a + 0.06 || Y < L.y - L.b - 0.06 || Y > L.y + L.b + 0.06) return 9;
    const wob = sin(L.t * 11 + Y * 16) * 0.012 * (1 + L.beam);
    const x = (X - wob) / L.a, y = (Y - L.y) / L.b;
    let best = (sqrt(x * x + y * y) - 1) * min(L.a, L.b);
    SPM = 3;
    SPE = L.e;
    // a hotter heart inside the flame
    const xx = (X - wob) / (L.a * 0.45), yy = (Y - L.y - L.b * 0.25) / (L.b * 0.6);
    const dc = (sqrt(xx * xx + yy * yy) - 1) * min(L.a * 0.45, L.b * 0.6);
    if (dc < best) {
      best = dc;
      SPM = 5;
      SPE = L.e * 1.3;
    }
    return best;
  }

  // ---------------------------------------------------------------- per-pixel answer
  function sample(X, Y, o) {
    let best = 9, bm = 0, be = 0, bk = 1;
    const gx = floor((X - GX0) * GSX), gy = floor((Y - GY0) * GSY);
    if (gx >= 0 && gy >= 0 && gx < GN && gy < GN) {
      const c = gy * GN + gx;
      for (let q = GSTART[c], qe = GSTART[c + 1]; q < qe; q++) {
        const b = GITEMS[q] * SK;
        const ax = SEG[b], ay = SEG[b + 1], bx = SEG[b + 2], by = SEG[b + 3];
        const pax = X - ax, pay = Y - ay, bax = bx - ax, bay = by - ay;
        const L2 = bax * bax + bay * bay;
        const h = L2 > 1e-12 ? clamp((pax * bax + pay * bay) / L2, 0, 1) : 0;
        const ex = pax - bax * h, ey = pay - bay * h;
        const d = sqrt(ex * ex + ey * ey) - (SEG[b + 4] + (SEG[b + 5] - SEG[b + 4]) * h);
        if (d < best) {
          best = d;
          bm = SEG[b + 6];
          be = SEG[b + 7];
          // the knuckles and joints of the bone read as seams
          bk = bm === 0 && (h < 0.08 || h > 0.92) ? 0.55 : 1;
        }
      }
    }
    if (SP.kind) {
      const sd = SP.kind === 1 ? wordField(X, Y) : lanceField(X, Y);
      if (sd < best) {
        best = sd;
        bm = SPM;
        be = SPE;
        bk = 1;
      }
    }
    o.d = best;
    o.m = bm;
    o.e = be > 0 ? be : 1;
    o.k = bk;
  }
  H.model = function (X, Y, p, c, t, o) {
    sample(X, Y, o);
  };

  // ---------------------------------------------------------------- the rig
  const JF = [new Float32Array(8), new Float32Array(8), new Float32Array(8), new Float32Array(8)];
  const JT = new Float32Array(8);
  // Joints of one finger, from the knuckle: o[0..1] knuckle, then one point per phalanx end.
  function solveFinger(f, curl, spread) {
    const F = FINGER[f], o = JF[f];
    let a = -PI / 2 + F.fan * spread, x = F.kx * HS, y = F.ky * HS;
    o[0] = x;
    o[1] = y;
    for (let j = 0; j < 3; j++) {
      a += F.side * curl * FLEX[j];
      x += cos(a) * F.lens[j] * HS;
      y += sin(a) * F.lens[j] * HS;
      o[2 + j * 2] = x;
      o[3 + j * 2] = y;
    }
  }
  function solveThumb(curl) {
    let a = THUMB.rest, x = THUMB.mx * HS, y = THUMB.my * HS;
    JT[0] = THUMB.cx * HS;
    JT[1] = THUMB.cy * HS;
    JT[2] = x;
    JT[3] = y;
    a += curl * 0.6;
    x += cos(a) * THUMB.lens[0] * HS;
    y += sin(a) * THUMB.lens[0] * HS;
    JT[4] = x;
    JT[5] = y;
    a += curl * 0.8;
    x += cos(a) * THUMB.lens[1] * HS;
    y += sin(a) * THUMB.lens[1] * HS;
    JT[6] = x;
    JT[7] = y;
  }
  function unit(x, y) {
    const n = sqrt(x * x + y * y) || 1;
    return [x / n, y / n];
  }
  // The direction a finger points, from its last joint to its tip.
  const fingerDir = (f) => unit(JF[f][6] - JF[f][4], JF[f][7] - JF[f][5]);
  const thumbDir = () => unit(JT[6] - JT[4], JT[7] - JT[5]);

  // ---------------------------------------------------------------- energy, one form per weapon
  function energyQuill(E, en, rk) {
    const tx = JF[0][6], ty = JF[0][7], d = fingerDir(0), L = 0.45 + 0.18 * rk;
    const ex = tx + d[0] * L, ey = ty + d[1] * L;
    cap(tx, ty, ex, ey, 0.012, 0.002, 3, 1.25 * en);
    // two barbs along the shaft, so it reads as a feather of light
    for (const s of [0.42, 0.7]) {
      const bx = tx + (ex - tx) * s, by = ty + (ey - ty) * s;
      cap(bx, by, bx - d[0] * 0.05 + 0.04, by - d[1] * 0.05, 0.004, 0.002, 4, 1.0 * en);
    }
    cap(tx, ty, tx, ty, 0.02 + 0.012 * rk, 0.02 + 0.012 * rk, 5, 1.6 * en);
    H.halos.push({ x: tx, y: ty, r: 0.22, c: E.rgb, k: 0.5 * en });
  }
  function energyPsalter(E, en, rk) {
    // a fan of verses, one from each finger and the thumb
    const L = 0.2 + 0.2 * rk;
    for (let f = 0; f < 4; f++) {
      const tx = JF[f][6], ty = JF[f][7], d = fingerDir(f);
      const ex = tx + d[0] * L, ey = ty + d[1] * L;
      cap(tx, ty, ex, ey, 0.014, 0.004, 3, 1.1 * en);
      cap(ex, ey, ex, ey, 0.021, 0.021, 5, 1.5 * en);
      cap(tx, ty, tx, ty, 0.02, 0.02, 4, 0.7 * en);
    }
    const td = thumbDir(), tx = JT[6], ty = JT[7];
    cap(tx, ty, tx + td[0] * L * 0.7, ty + td[1] * L * 0.7, 0.012, 0.004, 3, 1.0 * en);
    H.halos.push({ x: 0, y: -0.3, r: 0.34, c: E.rgb2, k: 0.4 * en });
  }
  function energyLitany(E, en, t, letter) {
    // a helix of script climbing out of the palm, one letter at a time
    const baseY = -0.56, N = 9;
    for (let s = 0; s < 2; s++)
      for (let k = 0; k < N; k++) {
        const u = (k / N + t * 0.32 + letter * 0.07) % 1;
        const x = cos(u * PI * 4 + k * 1.3 + s * PI) * (0.035 + 0.05 * u);
        const y = baseY - u * 1.05;
        const r = 0.024 - 0.011 * u;
        cap(x, y, x, y, r, r, u < 0.12 ? 5 : s ? 4 : 3, (1 - 0.7 * u) * en * 1.3);
      }
    cap(0, baseY, 0, baseY - 1.05, 0.005, 0.002, 4, 0.5 * en);
    H.halos.push({ x: 0, y: baseY - 0.25, r: 0.3, c: E.rgb, k: 0.45 * en });
  }
  function energyLance(E, en, beam, t, rk) {
    // a lantern flame held over a fist; while beaming, a column of light rises off the top of the screen
    const L = { y: -0.62, a: 0.075, b: 0.15, t, beam, e: en * (1 + 0.5 * rk) };
    SP.kind = 2;
    SP.l = L;
    const top = L.y - L.b * 0.9;
    if (beam > 0.01) {
      const w = (0.016 + 0.004 * sin(t * 37)) * beam;
      cap(0, top, 0, -2.3, w, w * 0.9, 3, 0.8 * en * beam);
      cap(0, top, 0, -2.3, w * 0.35, w * 0.3, 5, 1.1 * en * beam);
    }
    for (let k = 0; k < 3; k++) {
      const u = (t * 0.8 + k / 3) % 1, x = sin(k * 2.1 + t * 3) * 0.05 * u, y = top - 0.05 - u * 0.4;
      cap(x, y, x, y, 0.014 * (1 - u) + 0.003, 0.014 * (1 - u) + 0.003, 4, (1 - u) * en * 1.2);
    }
    EXT.push([-0.3, -2.4, 0.3, 0.3]);
    H.halos.push({ x: 0, y: L.y, r: 0.5, c: E.rgb, k: (0.5 + 0.4 * beam) * en });
  }
  function energyWord(E, en, ready, rk, t) {
    // a void the size of a fist: dark in the middle, a bright seam at its edge, runes turning around it
    const R = 0.1 + 0.012 * ready, oy = -0.98;
    cap(0, oy, 0, oy, R * 0.97, R * 0.97, 6, 0);
    SP.kind = 1;
    SP.w = { x: 0, y: oy, r: R, rimE: (0.5 + 0.9 * ready + 1.1 * rk) * en * 1.2, spin: t * (0.5 + 0.8 * ready), spin2: -t * 0.5, rk, ready };
    EXT.push([-0.3, oy - R * 2.6, 0.3, oy + R * 2.6]);
    H.halos.push({ x: 0, y: oy, r: 0.34, c: E.rgb, k: (0.25 + 0.3 * ready) * en });
  }
  function energyPalimpsest(E, en, c, rk, t) {
    // a coil of script wound round the index finger, tightening as the charge builds
    const o = JF[0], N = 14, turns = 1.8 + 2.4 * c, rc = 0.03 + 0.02 * c, rad = 0.011 + 0.003 * c;
    let px = 0, py = 0;
    for (let i = 0; i <= N; i++) {
      const u = i / N, s = min(2, floor(u * 3)), v = u * 3 - s;
      const ax = o[s * 2], ay = o[s * 2 + 1], bx = o[s * 2 + 2], by = o[s * 2 + 3];
      const px0 = ax + (bx - ax) * v, py0 = ay + (by - ay) * v;
      const d = unit(bx - ax, by - ay);
      const th = u * turns * 2 * PI + t * (5 + 6 * c);
      const off = rc * cos(th), x = px0 - d[1] * off, y = py0 + d[0] * off;
      if (i > 0) {
        const front = sin(th) > 0;
        cap(px, py, x, y, rad, rad, front ? 3 : 4, front ? 1.3 * en : 0.45 * en);
      }
      px = x;
      py = y;
    }
    const tx = o[6], ty = o[7];
    cap(tx, ty, tx, ty, 0.02 + 0.01 * c, 0.02 + 0.01 * c, 5, 1.5 * en);
    if (c > 0.55) {
      // the charged rail: a thin line of light that runs off the top of the screen, with a red seam
      const k = (c - 0.55) / 0.45;
      cap(tx, ty, tx, -2.3, 0.007 * k + 0.002, 0.004 * k + 0.001, 3, 1.4 * en * k);
      cap(tx + 0.003, ty, tx + 0.003, -2.3, 0.0025, 0.0015, 4, 1.2 * en * k);
      EXT.push([tx - 0.02, -2.4, tx + 0.02, ty]);
    }
    H.halos.push({ x: tx, y: ty, r: 0.3, c: E.rgb, k: (0.35 + 0.5 * c) * en });
  }

  // Solve the rig for this frame from the springs' curls.
  function build(wid, t, en, rk, c, beam, ready, letter) {
    NS = 0;
    EXT.length = 0;
    H.halos.length = 0;
    SP.kind = 0;
    const cur = S.cur, E = ENERGY[wid];
    // ---- bones
    for (let f = 0; f < 4; f++) solveFinger(f, cur[1 + f], cur[5]);
    solveThumb(cur[0]);
    cap(-0.09 * HS, -0.02 * HS, 0.09 * HS, -0.02 * HS, 0.075 * HS, 0.07 * HS, 1, 0); // the wrist
    cap(-0.07 * HS, -0.1 * HS, -0.1 * HS, -0.32 * HS, 0.03 * HS, 0.026 * HS, 0, 0); // the palm's edges
    cap(0.07 * HS, -0.1 * HS, 0.095 * HS, -0.3 * HS, 0.03 * HS, 0.026 * HS, 0, 0);
    cap(0, -0.2 * HS, 0, -0.2 * HS, 0.05 * HS, 0.05 * HS, 1, 0); // the hollow between them, in shadow
    for (let f = 0; f < 4; f++) {
      const F = FINGER[f], o = JF[f];
      cap(F.mc[0] * HS, F.mc[1] * HS, o[0], o[1], 0.03 * HS, 0.026 * HS, 0, 0); // metacarpal
      for (let j = 0; j < 3; j++) cap(o[2 * j], o[2 * j + 1], o[2 * j + 2], o[2 * j + 3], FRAD[j][0] * HS, FRAD[j][1] * HS, 0, 0);
      cap(o[0], o[1], o[0], o[1], 0.03 * HS, 0.03 * HS, 0, 0); // the knuckle
      for (let j = 0; j < 2; j++) cap(o[2 * j + 2], o[2 * j + 3], o[2 * j + 2], o[2 * j + 3], FRAD[j][1] * HS * 1.14, FRAD[j][1] * HS * 1.14, 0, 0);
      const d = fingerDir(f);
      cap(o[6], o[7], o[6] + d[0] * 0.02 * HS, o[7] + d[1] * 0.02 * HS, 0.011 * HS, 0.004 * HS, 7, 0); // claw
    }
    cap(THUMB.cx * HS, THUMB.cy * HS, THUMB.mx * HS, THUMB.my * HS, 0.03 * HS, 0.026 * HS, 0, 0);
    cap(JT[2], JT[3], JT[4], JT[5], TRAD[0][0] * HS, TRAD[0][1] * HS, 0, 0);
    cap(JT[4], JT[5], JT[6], JT[7], TRAD[1][0] * HS, TRAD[1][1] * HS, 0, 0);
    // ---- energy
    if (wid === 'quill') energyQuill(E, en, rk);
    else if (wid === 'psalter') energyPsalter(E, en, rk);
    else if (wid === 'litany') energyLitany(E, en, t, letter);
    else if (wid === 'lance') energyLance(E, en, beam, t, rk);
    else if (wid === 'word') energyWord(E, en, ready, rk, t);
    else if (wid === 'palimpsest') energyPalimpsest(E, en, c, rk, t);
    buildGrid();
  }

  // ---------------------------------------------------------------- springs
  const S = { cur: new Float32Array(6), vel: new Float32Array(6), wid: null, cd: 0, hurt: 0, en: 0.5, init: false };
  const TGT = new Float32Array(6);
  const K = 260, D = 2 * 0.3 * sqrt(K);

  function kick(arr, sg) {
    for (let k = 0; k < 6; k++) S.vel[k] += arr[k] * (k === 5 ? 1 : sg);
  }

  // Animate the hand for one frame. dt is the frame time (already slowed in slow motion).
  H.animate = function (game, dt) {
    const P = game.player, vm = game.vm, t = game.time;
    const wid = P.weapons[P.cur], w = P.weapon(), pose = POSE[wid];
    if (!pose || !ENERGY[wid]) {
      H.ready = false;
      return;
    }
    dt = clamp(dt || 0, 0, 0.05);
    if (!S.init) {
      S.init = true;
      for (let k = 0; k < 5; k++) S.cur[k] = pose.curl[k];
      S.cur[5] = pose.spread;
      S.cd = P.cd || 0;
      S.hurt = P.hurtT || 0;
    }
    if (wid !== S.wid) {
      // changing weapon: the fingers shake out of the old grip
      S.wid = wid;
      for (let k = 0; k < 5; k++) S.vel[k] += (k % 2 ? -1 : 1) * 2.5;
      S.vel[5] += 1.2;
    }
    const sp = clamp(Math.hypot(P.vx, P.vy) / 4.4, 0, 1);
    const beam = P.beaming ? 1 : 0;
    const c = w.charge ? clamp(P.charge / w.charge, 0, 1) : 0;
    const ready = wid === 'word' ? 1 - clamp(P.cd / (w.cd || 1), 0, 1) : 1;
    const rk = clamp(P.recoil || 0, 0, 1);
    const dashK = P.dashT > 0 ? clamp(P.dashT / 0.18, 0, 1) : 0;
    const eraseK = P.eraseT > 0 ? sin((1 - clamp(P.eraseT / 0.45, 0, 1)) * PI) : 0;
    const switchK = P.switchT > 0 ? clamp(P.switchT / 0.25, 0, 1) : 0;
    const turn = clamp((vm.sway || 0) / 0.06, -1, 1);
    // a shot kicks the fingers, a blow makes them flinch
    if ((P.cd || 0) > S.cd + 0.02) kick(KICK[wid], wid === 'litany' && (P.letterIdx | 0) % 2 ? -1 : 1);
    if ((P.hurtT || 0) > S.hurt + 0.3) kick(HURT, 1);
    S.cd = P.cd || 0;
    S.hurt = P.hurtT || 0;
    // what the hand is doing: walking swings the fingers, breath and tremor live in them all the time
    for (let k = 0; k < 5; k++) {
      let v = pose.curl[k];
      v += sp * 0.12 * sin((P.walk || 0) + k * 0.9);
      v += 0.035 * sin(t * 1.3 + k * 1.9);
      v += beam * 0.06 * sin(t * 40 + k * 1.7) + c * 0.035 * sin(t * 29 + k * 2.3);
      v -= dashK * 0.2;
      v += switchK * 0.45;
      v += eraseK * 0.7;
      v += turn * (k - 2) * 0.1; // the fingers trail a turn of the view
      TGT[k] = v;
    }
    TGT[5] = pose.spread + 0.05 * sin(t * 0.8) + dashK * 0.35 - eraseK * 0.25;
    // springs: each finger overshoots a little and settles
    const steps = 2, h = dt / steps;
    for (let s = 0; s < steps; s++)
      for (let k = 0; k < 6; k++) {
        S.vel[k] += (K * (TGT[k] - S.cur[k]) - D * S.vel[k]) * h;
        S.cur[k] += S.vel[k] * h;
      }
    // the energy's own level: it rests, flares on a shot, gathers while charging, and waits for the Word to recover
    const base = wid === 'word' ? 0.3 + 0.6 * ready : 0.5;
    const goal = base + 0.12 * sin(t * 2.7) + rk * 1.2 + c * 0.9 + beam * 1.2 + eraseK * 1.4;
    S.en += (goal - S.en) * (1 - exp(-dt * 10));
    build(wid, t, S.en, rk, c, beam, ready, P.letterIdx | 0);
    H.wid = wid;
    H.ready = true;
  };

  G.Hand = H;
})();
