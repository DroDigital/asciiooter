'use strict';
// The glyph system. Every glyph lives in one atlas. ASCII comes from the system monospace
// font; blocks, braille, box-drawing, symbols and two alien alphabets are drawn procedurally
// so the look is identical on every machine. After painting, each glyph's ink coverage is
// measured on a 2x4 grid, which lets the renderer pick glyphs by *shape*.
(function () {
  const G = window.G;
  const GL = (G.Glyphs = { list: [], keys: new Map(), cov: null, sets: {}, gw: 0, gh: 0, atlas: null });

  function add(key, d) {
    let i = GL.keys.get(key);
    if (i !== undefined) return i;
    i = GL.list.length;
    d.key = key;
    GL.list.push(d);
    GL.keys.set(key, i);
    return i;
  }
  GL.id = (key) => {
    const i = GL.keys.get(key);
    return i === undefined ? 0 : i;
  };
  GL.ch = (c) => {
    const i = GL.keys.get('c:' + c);
    return i === undefined ? GL.keys.get('c:?') : i;
  };

  // ---- registration (index 0 is always blank) ----
  add('c: ', { t: 'blank' });
  for (let c = 33; c < 127; c++) add('c:' + String.fromCharCode(c), { t: 'char', ch: String.fromCharCode(c) });
  for (let q = 1; q < 16; q++) add('q:' + q, { t: 'quad', q }); // TL=1 TR=2 BL=4 BR=8
  for (let n = 1; n < 8; n++) add('v:' + n, { t: 'vbar', n }); // lower n/8 block
  for (let n = 1; n < 8; n++) add('h:' + n, { t: 'hbar', n }); // left n/8 block
  for (let n = 1; n <= 3; n++) add('sh:' + n, { t: 'shade', n });
  for (let m = 1; m < 256; m++) add('b:' + m, { t: 'braille', m }); // bit k = row*2+col
  for (let c = 1; c < 16; c++) add('bx:' + c, { t: 'box', c, dbl: false }); // N=1 E=2 S=4 W=8
  for (let c = 1; c < 16; c++) add('bxd:' + c, { t: 'box', c, dbl: true });
  const SYMS = ['dot', 'bullet', 'ring', 'diamond', 'star', 'eye', 'heart', 'drop', 'flame', 'cross', 'tri',
    'arrowU', 'arrowD', 'arrowL', 'arrowR', 'skull', 'moon', 'spiral', 'sun', 'wave', 'key', 'hand'];
  for (const s of SYMS) add('sym:' + s, { t: 'sym', s });
  const SIGILS = 96;
  for (let i = 0; i < SIGILS; i++) add('sa:' + i, { t: 'sigil', a: 0, i });
  for (let i = 0; i < SIGILS; i++) add('sb:' + i, { t: 'sigil', a: 1, i });
  GL.count = GL.list.length;

  // ---- procedural alphabets (stroke lists in unit space, size independent) ----
  const strokes = [[], []];
  (function genSigils() {
    const rng = new G.RNG(0x51617);
    const LX = [0.2, 0.5, 0.8], LY = [0.14, 0.38, 0.62, 0.86];
    for (let i = 0; i < SIGILS; i++) {
      // Alphabet A: "the Choir's runes" - straight strokes on a lattice.
      const s = [];
      if (rng.chance(0.65)) {
        const x = rng.pick(LX);
        s.push({ k: 'l', x0: x, y0: LY[0], x1: x, y1: LY[3] });
      }
      const n = rng.int(1, 3);
      for (let j = 0; j < n; j++) {
        const a = [rng.pick(LX), rng.pick(LY)], b = [rng.pick(LX), rng.pick(LY)];
        if (a[0] === b[0] && a[1] === b[1]) b[1] = LY[(LY.indexOf(a[1]) + 2) % 4];
        s.push({ k: 'l', x0: a[0], y0: a[1], x1: b[0], y1: b[1] });
      }
      if (rng.chance(0.3)) s.push({ k: 'd', x: rng.pick(LX), y: rng.pick(LY), r: 0.08 });
      strokes[0].push(s);
      // Alphabet B: "the Unwritten script" - arcs, hooks and eyes.
      const t = [];
      const arcs = rng.int(1, 2);
      for (let j = 0; j < arcs; j++) {
        t.push({ k: 'a', x: rng.range(0.32, 0.68), y: rng.range(0.3, 0.7), r: rng.range(0.16, 0.36),
          a0: rng.range(0, G.TAU), sw: rng.range(1.2, 4.6) });
      }
      if (rng.chance(0.6)) t.push({ k: 'l', x0: rng.range(0.2, 0.8), y0: rng.range(0.1, 0.4), x1: rng.range(0.2, 0.8), y1: rng.range(0.6, 0.92) });
      if (rng.chance(0.45)) t.push({ k: 'd', x: rng.range(0.3, 0.7), y: rng.range(0.25, 0.75), r: 0.09 });
      strokes[1].push(t);
    }
  })();

  const FONT = '"DejaVu Sans Mono", "Menlo", "Consolas", "Liberation Mono", "Courier New", monospace';

  function paint(ctx, d, x, y, w, h, fontPx) {
    const lw = Math.max(1, Math.round(Math.min(w, h / 2) * 0.16));
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (d.t) {
      case 'blank':
        return;
      case 'char':
        ctx.fillText(d.ch, x + w / 2, y + h * 0.54);
        return;
      case 'quad': {
        const hw = Math.round(w / 2), hh = Math.round(h / 2);
        if (d.q & 1) ctx.fillRect(x, y, hw, hh);
        if (d.q & 2) ctx.fillRect(x + hw, y, w - hw, hh);
        if (d.q & 4) ctx.fillRect(x, y + hh, hw, h - hh);
        if (d.q & 8) ctx.fillRect(x + hw, y + hh, w - hw, h - hh);
        return;
      }
      case 'vbar': {
        const bh = Math.round((h * d.n) / 8);
        ctx.fillRect(x, y + h - bh, w, bh);
        return;
      }
      case 'hbar':
        ctx.fillRect(x, y, Math.round((w * d.n) / 8), h);
        return;
      case 'shade': {
        for (let py = 0; py < h; py++)
          for (let px = 0; px < w; px++) {
            const on = d.n === 2 ? (px + py) % 2 === 0 : d.n === 1 ? px % 2 === 0 && py % 2 === 0 : !(px % 2 === 0 && py % 2 === 0);
            if (on) ctx.fillRect(x + px, y + py, 1, 1);
          }
        return;
      }
      case 'braille': {
        const r = Math.max(0.6, Math.min(w / 2, h / 4) * 0.3);
        for (let k = 0; k < 8; k++) {
          if (!(d.m & (1 << k))) continue;
          const cx = x + ((k & 1) + 0.5) * (w / 2), cy = y + ((k >> 1) + 0.5) * (h / 4);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, G.TAU);
          ctx.fill();
        }
        return;
      }
      case 'box': {
        const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
        const t = Math.max(1, Math.round(w * 0.12));
        const seg = (x0, y0, x1, y1) => ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || t, Math.abs(y1 - y0) || t);
        const offs = d.dbl ? [-t * 1.5, t * 1.5] : [0];
        for (const o of offs) {
          if (d.c & 1) seg(cx + o, y, cx + o, cy + t);
          if (d.c & 4) seg(cx + o, cy, cx + o, y + h);
          if (d.c & 2) seg(cx, cy + o, x + w, cy + o);
          if (d.c & 8) seg(x, cy + o, cx + t, cy + o);
        }
        return;
      }
      case 'sym':
        paintSym(ctx, d.s, x, y, w, h, lw);
        return;
      case 'sigil': {
        const list = strokes[d.a][d.i];
        for (const s of list) {
          ctx.beginPath();
          if (s.k === 'l') {
            ctx.moveTo(x + s.x0 * w, y + s.y0 * h);
            ctx.lineTo(x + s.x1 * w, y + s.y1 * h);
            ctx.stroke();
          } else if (s.k === 'a') {
            ctx.save();
            ctx.translate(x + s.x * w, y + s.y * h);
            ctx.scale(w, h * 0.62);
            ctx.lineWidth = lw / w;
            ctx.beginPath();
            ctx.arc(0, 0, s.r, s.a0, s.a0 + s.sw);
            ctx.restore();
            ctx.stroke();
          } else {
            ctx.arc(x + s.x * w, y + s.y * h, s.r * w + 0.5, 0, G.TAU);
            ctx.fill();
          }
        }
        return;
      }
    }
  }

  function paintSym(ctx, s, x, y, w, h, lw) {
    const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2;
    const P = (pts) => {
      ctx.beginPath();
      ctx.moveTo(x + pts[0] * w, y + pts[1] * h);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(x + pts[i] * w, y + pts[i + 1] * h);
      ctx.closePath();
      ctx.fill();
    };
    const C = (px, py, r, fill = true) => {
      ctx.beginPath();
      ctx.arc(x + px * w, y + py * h, r, 0, G.TAU);
      fill ? ctx.fill() : ctx.stroke();
    };
    switch (s) {
      case 'dot': C(0.5, 0.5, R * 0.2); break;
      case 'bullet': C(0.5, 0.5, R * 0.45); break;
      case 'ring': C(0.5, 0.5, R * 0.6, false); break;
      case 'diamond': P([0.5, 0.2, 0.85, 0.5, 0.5, 0.8, 0.15, 0.5]); break;
      case 'star':
        P([0.5, 0.15, 0.6, 0.42, 0.9, 0.5, 0.6, 0.58, 0.5, 0.85, 0.4, 0.58, 0.1, 0.5, 0.4, 0.42]);
        break;
      case 'eye':
        ctx.beginPath();
        ctx.moveTo(x, cy);
        ctx.quadraticCurveTo(cx, y + h * 0.22, x + w, cy);
        ctx.quadraticCurveTo(cx, y + h * 0.78, x, cy);
        ctx.stroke();
        C(0.5, 0.5, R * 0.3);
        break;
      case 'heart':
        C(0.32, 0.4, w * 0.2);
        C(0.68, 0.4, w * 0.2);
        P([0.13, 0.45, 0.87, 0.45, 0.5, 0.8]);
        break;
      case 'drop':
        P([0.5, 0.18, 0.75, 0.55, 0.25, 0.55]);
        C(0.5, 0.6, w * 0.26);
        break;
      case 'flame':
        P([0.5, 0.1, 0.78, 0.55, 0.62, 0.85, 0.38, 0.85, 0.22, 0.55]);
        break;
      case 'cross':
        ctx.fillRect(cx - lw / 2, y + h * 0.15, lw, h * 0.72);
        ctx.fillRect(x + w * 0.2, y + h * 0.35, w * 0.6, lw);
        break;
      case 'tri': P([0.5, 0.25, 0.85, 0.75, 0.15, 0.75]); break;
      case 'arrowU': P([0.5, 0.2, 0.85, 0.6, 0.15, 0.6]); break;
      case 'arrowD': P([0.5, 0.8, 0.85, 0.4, 0.15, 0.4]); break;
      case 'arrowL': P([0.15, 0.5, 0.75, 0.3, 0.75, 0.7]); break;
      case 'arrowR': P([0.85, 0.5, 0.25, 0.3, 0.25, 0.7]); break;
      case 'skull':
        C(0.5, 0.42, w * 0.36);
        ctx.fillRect(x + w * 0.3, y + h * 0.5, w * 0.4, h * 0.22);
        ctx.globalCompositeOperation = 'destination-out';
        C(0.36, 0.42, w * 0.1);
        C(0.64, 0.42, w * 0.1);
        ctx.globalCompositeOperation = 'source-over';
        break;
      case 'moon':
        C(0.5, 0.5, R * 0.6);
        ctx.globalCompositeOperation = 'destination-out';
        C(0.66, 0.42, R * 0.52);
        ctx.globalCompositeOperation = 'source-over';
        break;
      case 'spiral':
        ctx.beginPath();
        for (let i = 0; i < 40; i++) {
          const a = i * 0.45, r = (i / 40) * R * 0.85;
          const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 1.4;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
        break;
      case 'sun':
        C(0.5, 0.5, R * 0.3);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * G.TAU;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.45 * 1.6);
          ctx.lineTo(cx + Math.cos(a) * R * 0.85, cy + Math.sin(a) * R * 0.85 * 1.6);
          ctx.stroke();
        }
        break;
      case 'wave':
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const px = x + (i / 12) * w, py = cy + Math.sin((i / 12) * G.TAU) * h * 0.12;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
        break;
      case 'key':
        C(0.5, 0.3, w * 0.2, false);
        ctx.fillRect(cx - lw / 2, y + h * 0.4, lw, h * 0.45);
        ctx.fillRect(cx, y + h * 0.7, w * 0.2, lw);
        break;
      case 'hand':
        for (let i = 0; i < 4; i++) ctx.fillRect(x + w * (0.22 + i * 0.16), y + h * (0.2 + (i === 0 ? 0.1 : 0)), w * 0.1, h * 0.4);
        ctx.fillRect(x + w * 0.22, y + h * 0.5, w * 0.58, h * 0.3);
        break;
    }
  }

  // ---- atlas build ----
  GL.build = function (gw, gh) {
    GL.gw = gw;
    GL.gh = gh;
    const pad = 1, sw = gw + pad * 2, sh = gh + pad * 2;
    const acols = 32, arows = Math.ceil(GL.count / acols);
    const cv = document.createElement('canvas');
    cv.width = acols * sw;
    cv.height = arows * sh;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    let fontPx = Math.floor(gh * 0.86);
    ctx.font = `bold ${fontPx}px ${FONT}`;
    const mw = ctx.measureText('M').width;
    if (mw > gw * 1.02) fontPx = Math.floor((fontPx * gw * 1.02) / mw);
    ctx.font = `bold ${fontPx}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < GL.count; i++) {
      const x = (i % acols) * sw + pad, y = ((i / acols) | 0) * sh + pad;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, gw, gh);
      ctx.clip();
      paint(ctx, GL.list[i], x, y, gw, gh, fontPx);
      ctx.restore();
    }
    // Measure 2x4 coverage for shape matching.
    const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const cov = (GL.cov = new Float32Array(GL.count * 8));
    for (let i = 0; i < GL.count; i++) {
      const x0 = (i % acols) * sw + pad, y0 = ((i / acols) | 0) * sh + pad;
      for (let k = 0; k < 8; k++) {
        const c = k & 1, r = k >> 1;
        const xa = x0 + Math.floor((c * gw) / 2), xb = x0 + Math.floor(((c + 1) * gw) / 2);
        const ya = y0 + Math.floor((r * gh) / 4), yb = y0 + Math.floor(((r + 1) * gh) / 4);
        let s = 0, n = 0;
        for (let py = ya; py < yb; py++)
          for (let px = xa; px < xb; px++) {
            s += img[(py * cv.width + px) * 4 + 3];
            n++;
          }
        cov[i * 8 + k] = n ? s / (n * 255) : 0;
      }
    }
    GL.atlas = { canvas: cv, cols: acols, rows: arows, sw, sh, pad };
    buildSets();
  };

  function meanCov(g) {
    let s = 0;
    for (let k = 0; k < 8; k++) s += GL.cov[g * 8 + k];
    return s / 8;
  }

  // A glyph set = a style. lut maps a 2x4 shape mask to the best-matching glyph;
  // ramp maps flat brightness to glyph density; buckets hold variants per density.
  function makeSet(name, cands, ramp, opt) {
    const cov = GL.cov;
    const set = Object.assign({ name, lut: new Uint16Array(256), ramp: null, buckets: null,
      fgEdge: 1.15, bgEdge: 0.3, fgFlat: 1.5, bgFlat: 0.22 }, opt || {});
    if (set.identity) {
      for (let m = 0; m < 256; m++) set.lut[m] = set.identity(m);
    } else {
      const ids = [], nv = [];
      for (const g of cands) {
        let mx = 0;
        for (let k = 0; k < 8; k++) mx = Math.max(mx, cov[g * 8 + k]);
        if (mx < 0.04) continue;
        const v = new Float32Array(8);
        for (let k = 0; k < 8; k++) v[k] = cov[g * 8 + k] / mx;
        ids.push(g);
        nv.push(v);
      }
      for (let m = 1; m < 256; m++) {
        let best = 0, bd = 1e9;
        for (let j = 0; j < ids.length; j++) {
          const v = nv[j];
          let d = 0;
          for (let k = 0; k < 8; k++) {
            const e = v[k] - ((m >> k) & 1);
            d += e * e;
          }
          if (d < bd) {
            bd = d;
            best = ids[j];
          }
        }
        set.lut[m] = best;
      }
    }
    // Density buckets (used for "crawling" interiors).
    const sorted = cands.filter((g) => meanCov(g) > 0.02).sort((a, b) => meanCov(a) - meanCov(b));
    const NB = 6;
    set.buckets = [];
    for (let b = 0; b < NB; b++) {
      const a0 = Math.floor((b * sorted.length) / NB), a1 = Math.max(a0 + 1, Math.floor(((b + 1) * sorted.length) / NB));
      set.buckets.push(sorted.slice(a0, a1));
    }
    if (ramp) set.ramp = Uint16Array.from(ramp);
    else {
      const r = [0];
      for (let b = 0; b < NB; b++) r.push(set.buckets[b][set.buckets[b].length >> 1] || 0);
      set.ramp = Uint16Array.from(r);
    }
    GL.sets[name] = set;
    return set;
  }

  function buildSets() {
    const ids = (s) => Array.from(s).map((c) => GL.ch(c));
    const keys = (arr) => arr.map((k) => GL.id(k));
    const chars = [];
    for (let c = 33; c < 127; c++) chars.push(GL.ch(String.fromCharCode(c)));
    makeSet('ascii', chars, ids(' .:-=+*#%@'));
    makeSet('asciiFine', chars, ids(" .'`,:;!i|lI1tfjrxnuvczXYJCLQ0OZmwqpdbkhao*#MW&8%B@"), { fgFlat: 1.35, bgFlat: 0.18 });
    makeSet('asciiBold', chars, ids(' .oO0#@'), { fgFlat: 1.6, bgFlat: 0.25 });
    const quads = [];
    for (let q = 1; q < 16; q++) quads.push(GL.id('q:' + q));
    makeSet('blocks', quads, keys(['c: ', 'sh:1', 'sh:2', 'sh:3', 'q:15']), { bgEdge: 1.0, fgEdge: 1.0, fgFlat: 1.15, bgFlat: 0.45 });
    // Braille: mask is the glyph.
    const order = [0, 7, 3, 4, 1, 6, 2, 5];
    const bramp = [0];
    let m = 0;
    for (let i = 0; i < 8; i++) {
      m |= 1 << order[i];
      bramp.push(GL.id('b:' + m));
    }
    const braille = [];
    for (let b = 1; b < 256; b++) braille.push(GL.id('b:' + b));
    makeSet('braille', braille, bramp, { identity: (mm) => (mm ? GL.id('b:' + mm) : 0), bgEdge: 0.12, bgFlat: 0.1, fgFlat: 1.7, fgEdge: 1.4 });
    const box = [];
    for (let c = 1; c < 16; c++) box.push(GL.id('bx:' + c));
    for (const c of '/\\|-_+.\'') box.push(GL.ch(c));
    makeSet('box', box, keys(['c: ', 'sym:dot', 'c::', 'c:+', 'bx:15', 'bxd:15', 'c:#', 'q:15']), { bgFlat: 0.2, crawl: true });
    const sa = [], sb = [];
    for (let i = 0; i < SIGILS; i++) {
      sa.push(GL.id('sa:' + i));
      sb.push(GL.id('sb:' + i));
    }
    makeSet('sigilA', sa, null, { fgFlat: 1.6, bgFlat: 0.2, crawl: true });
    makeSet('sigilB', sb, null, { fgFlat: 1.6, bgFlat: 0.2, crawl: true });
    GL.setList = ['ascii', 'asciiFine', 'asciiBold', 'blocks', 'braille', 'box', 'sigilA', 'sigilB'];
  }
})();
