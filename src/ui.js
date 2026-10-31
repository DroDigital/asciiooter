'use strict';
// Everything drawn directly into the cell grid: HUD, menus, big titles, the map,
// the weapon in your hands, overlays and transitions.
(function () {
  const G = window.G;
  const D = G.Data, GL = G.Glyphs, In = G.Input;
  const UI = (G.UI = {});
  let DSP = null;
  UI.bind = (d) => (DSP = d);
  const C = () => DSP.cols, Rw = () => DSP.rows;

  // ---- primitives ----
  UI.put = function (x, y, g, fg, bg, glow) {
    if (x < 0 || y < 0 || x >= DSP.cols || y >= DSP.rows) return;
    const ci = y * DSP.cols + x, o = ci * 4;
    DSP.glyph[ci] = g;
    DSP.fg[o] = Math.min(255, fg[0] * 255) | 0;
    DSP.fg[o + 1] = Math.min(255, fg[1] * 255) | 0;
    DSP.fg[o + 2] = Math.min(255, fg[2] * 255) | 0;
    DSP.fg[o + 3] = Math.min(255, (glow || 0) * 255) | 0;
    if (bg) {
      DSP.bg[o] = Math.min(255, bg[0] * 255) | 0;
      DSP.bg[o + 1] = Math.min(255, bg[1] * 255) | 0;
      DSP.bg[o + 2] = Math.min(255, bg[2] * 255) | 0;
    }
  };
  UI.text = function (x, y, s, fg, bg, glow) {
    s = String(s);
    for (let i = 0; i < s.length; i++) {
      const c = s.charAt(i);
      if (c === ' ' && !bg) continue;
      UI.put(x + i, y, c === ' ' ? 0 : GL.ch(c), fg, bg, glow);
    }
    return s.length;
  };
  UI.textC = (y, s, fg, bg, glow) => UI.text(Math.floor((C() - String(s).length) / 2), y, s, fg, bg, glow);
  // Centered text on a dimmed band, legible over any scene.
  UI.caption = function (y, s, fg, glow, ink) {
    const x = Math.floor((C() - s.length) / 2);
    for (let i = -1; i <= s.length; i++) {
      const o = (y * DSP.cols + x + i) * 4;
      if (x + i < 0 || x + i >= C() || y < 0 || y >= Rw()) continue;
      DSP.glyph[y * DSP.cols + x + i] = 0;
      for (let c = 0; c < 3; c++) DSP.bg[o + c] = ink ? 230 : (DSP.bg[o + c] * 0.15) | 0;
    }
    UI.text(x, y, s, fg, null, glow);
  };
  UI.textR = (x, y, s, fg, bg, glow) => UI.text(x - String(s).length, y, s, fg, bg, glow);
  UI.fill = function (x, y, w, h, bg) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) UI.put(i, j, 0, [0, 0, 0], bg, 0);
  };
  UI.dim = function (x, y, w, h, k) {
    for (let j = Math.max(0, y); j < Math.min(Rw(), y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(C(), x + w); i++) {
        const o = (j * DSP.cols + i) * 4;
        for (let c = 0; c < 3; c++) {
          DSP.fg[o + c] = (DSP.fg[o + c] * k) | 0;
          DSP.bg[o + c] = (DSP.bg[o + c] * k) | 0;
        }
        DSP.fg[o + 3] = (DSP.fg[o + 3] * k) | 0;
      }
  };
  UI.frame = function (x, y, w, h, col, dbl, bg) {
    const p = dbl ? 'bxd:' : 'bx:';
    if (bg) UI.fill(x, y, w, h, bg);
    for (let i = 1; i < w - 1; i++) {
      UI.put(x + i, y, GL.id(p + 10), col);
      UI.put(x + i, y + h - 1, GL.id(p + 10), col);
    }
    for (let j = 1; j < h - 1; j++) {
      UI.put(x, y + j, GL.id(p + 5), col);
      UI.put(x + w - 1, y + j, GL.id(p + 5), col);
    }
    UI.put(x, y, GL.id(p + 6), col);
    UI.put(x + w - 1, y, GL.id(p + 12), col);
    UI.put(x, y + h - 1, GL.id(p + 3), col);
    UI.put(x + w - 1, y + h - 1, GL.id(p + 9), col);
  };
  UI.bar = function (x, y, w, frac, col, empty, glow) {
    const f = G.clamp(frac, 0, 1) * w;
    for (let i = 0; i < w; i++) {
      const k = f - i;
      if (k >= 1) UI.put(x + i, y, GL.id('q:15'), col, null, glow);
      else if (k > 0.06) UI.put(x + i, y, GL.id('h:' + Math.max(1, Math.round(k * 8) || 1)), col, null, glow);
      else UI.put(x + i, y, GL.id('sh:1'), empty);
    }
  };
  UI.wrap = function (text, width) {
    const words = String(text).split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > width) {
        lines.push(cur.trim());
        cur = w;
      } else cur += ' ' + w;
    }
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  };
  UI.mouseCell = () => DSP.cellAt(In.mx, In.my);

  // ---- big text through the shape-matching pipeline ----
  const bigCache = new Map();
  UI.bigText = function (str, cx, cy, hCells, setName, col, glow, opt) {
    const key = str + '|' + hCells + '|' + DSP.cols + '|' + (opt && opt.font);
    let m = bigCache.get(key);
    if (!m) {
      const hs = hCells * 4;
      const cv = document.createElement('canvas');
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const font = `bold ${Math.floor(hs * 0.95)}px ${(opt && opt.font) || 'Georgia, "Times New Roman", serif'}`;
      ctx.font = font;
      const wPx = Math.ceil(ctx.measureText(str).width * 1.04) + 4;
      // samples are ~square on screen; stretch width to sample aspect
      const aspect = (DSP.cellW / 2) / (DSP.cellH / 4);
      cv.width = Math.max(2, Math.ceil(wPx / aspect / 2) * 2);
      cv.height = hs;
      ctx.font = font;
      ctx.setTransform(1 / aspect, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(str, 2, hs * 0.54);
      const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
      m = { w: cv.width / 2, h: hCells, cov: new Float32Array(cv.width * cv.height), sw: cv.width };
      for (let i = 0; i < cv.width * cv.height; i++) m.cov[i] = img[i * 4 + 3] / 255;
      bigCache.set(key, m);
      if (bigCache.size > 60) bigCache.delete(bigCache.keys().next().value);
    }
    const set = GL.sets[setName] || GL.sets.blocks;
    const x0 = Math.floor(cx - m.w / 2), y0 = Math.floor(cy - m.h / 2);
    for (let j = 0; j < m.h; j++)
      for (let i = 0; i < m.w; i++) {
        let mask = 0, sum = 0;
        for (let k = 0; k < 8; k++) {
          const v = m.cov[(j * 4 + (k >> 1)) * m.sw + i * 2 + (k & 1)];
          sum += v;
          if (v > 0.45) mask |= 1 << k;
        }
        if (!mask) continue;
        const c = typeof col === 'function' ? col(i, j, m.w, m.h) : col;
        UI.put(x0 + i, y0 + j, set.lut[mask], c, opt && opt.bg ? opt.bg : null, glow);
        void sum;
      }
    return { x: x0, y: y0, w: m.w, h: m.h };
  };

  // ---- creature preview: sample a model straight into cells ----
  const PO = { d: 1, m: 0, e: 1, k: 1 };
  UI.drawShape = function (def, x0, y0, wc, hc, t, col) {
    const set = GL.sets[def.set || 'sigilA'];
    const fake = { id: 7, data: { mimic: 'wretch', shield: false, px: 0, gaze: 1, mouth: 0.5, surf: 1 }, state: 'chase', st: 0, walk: t * 4, vis: 1, h: def.h, w: def.w, z: 0, rel: Math.sin(t * 0.5) * 0.6, hp: 1, maxHp: 1, kind2: 'books', player: null };
    const hs = hc * 4, ws = wc * 2;
    const aspect = (DSP.cellW / 2) / (DSP.cellH / 4);
    const scale = def.h / hs;
    const thick = def.thick || 0.1;
    const cr = [0, 0, 0];
    for (let cy = 0; cy < hc; cy++)
      for (let cx = 0; cx < wc; cx++) {
        let mask = 0, n = 0, emis = 0;
        cr[0] = cr[1] = cr[2] = 0;
        for (let k = 0; k < 8; k++) {
          const sx = cx * 2 + (k & 1) + 0.5, sy = cy * 4 + (k >> 1) + 0.5;
          const X = (sx - ws / 2) * scale * aspect, Y = sy * scale;
          if (Math.abs(X) > def.w / 2) continue;
          PO.d = 1;
          PO.m = 0;
          PO.e = 1;
          PO.k = 1;
          def.model(X, Y, fake, t, PO);
          if (PO.d >= 0) continue;
          const m = def.mats[PO.m] || def.mats[0];
          const sh = m.e ? 0.6 + 0.4 * PO.e : (0.35 + 0.65 * Math.min(1, -PO.d / thick)) * PO.k * (1.05 - Y / def.h * 0.3);
          const c = m.e || m.c;
          cr[0] += c[0] * sh;
          cr[1] += c[1] * sh;
          cr[2] += c[2] * sh;
          if (m.e) emis++;
          mask |= 1 << k;
          n++;
        }
        if (!mask) continue;
        const g = mask === 255 ? set.ramp[Math.min(set.ramp.length - 1, Math.max(1, Math.round(((cr[0] + cr[1] + cr[2]) / (3 * n)) * set.ramp.length)))] : set.lut[mask];
        UI.put(x0 + cx, y0 + cy, g, [(cr[0] / n) * 1.3, (cr[1] / n) * 1.3, (cr[2] / n) * 1.3], null, emis > 1 ? 0.7 : 0);
      }
    void col;
  };

  // ---- menus ----
  // items: [{label, sub, disabled, right}]; st: {sel}; returns chosen index or -1
  UI.menu = function (items, st, x, y, opt) {
    opt = opt || {};
    const accent = opt.accent || [1, 0.7, 0.3];
    if (In.up()) {
      st.sel = (st.sel - 1 + items.length) % items.length;
      G.Audio.play('ui');
    }
    if (In.downNav()) {
      st.sel = (st.sel + 1) % items.length;
      G.Audio.play('ui');
    }
    const mc = UI.mouseCell();
    const gap = opt.gap || 1;
    let chosen = -1;
    const width = opt.width || 30;
    items.forEach((it, i) => {
      const yy = y + i * gap;
      const xx = opt.center ? Math.floor((C() - width) / 2) : x;
      if (In.moved && mc.y === yy && mc.x >= xx - 2 && mc.x < xx + width + 2 && !In.locked) st.sel = i;
      const on = i === st.sel;
      const col = it.disabled ? [0.35, 0.35, 0.38] : on ? accent : [0.72, 0.7, 0.66];
      if (on) {
        UI.put(xx - 2, yy, GL.id('sym:arrowR'), accent, null, 0.8);
        UI.fill(xx - 1, yy, width + 2, 1, [accent[0] * 0.12, accent[1] * 0.12, accent[2] * 0.12]);
      }
      UI.text(xx, yy, it.label, col, null, on ? 0.35 : 0);
      if (it.right) UI.textR(xx + width, yy, it.right, on ? accent : [0.55, 0.55, 0.6]);
      if (In.mpressed[0] && mc.y === yy && mc.x >= xx - 2 && mc.x < xx + width + 2) chosen = i;
    });
    if (In.accept()) chosen = st.sel;
    if (chosen >= 0) {
      if (items[chosen].disabled) {
        G.Audio.play('deny');
        return -1;
      }
      G.Audio.play('uiSelect');
    }
    return chosen;
  };

  // Charge meter for weapons that are held to charge.
  UI.chargeBar = function (g) {
    const P = g.player, w = P.weapon();
    if (!w.charge || P.charge <= 0) return;
    const f = P.charge / w.charge;
    UI.bar(Math.floor(C() / 2) - 6, Math.floor(Rw() / 2) + 2, 12, f, f >= 0.98 ? [1, 0.3, 0.3] : [0.9, 0.5, 0.5], [0.2, 0.1, 0.1], f >= 0.98 ? 1 : 0.3);
  };

  UI.crosshair = function (g) {
    const cx = Math.floor(C() / 2), cy = Math.floor(Rw() / 2);
    const hit = g.fx.hitMarker > 0;
    const col = hit ? [1, 0.3, 0.25] : g.level.st.ink ? [0.7, 0.1, 0.1] : [1, 0.9, 0.7];
    UI.put(cx, cy, GL.ch(hit ? 'x' : '+'), col, null, hit ? 1 : 0.4);
    const w = g.player.weapon();
    if (w.pellets) {
      UI.put(cx - 2, cy, GL.ch('('), [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6]);
      UI.put(cx + 2, cy, GL.ch(')'), [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6]);
    }
  };

  // ---- HUD ----
  UI.hud = function (g) {
    const P = g.player, cols = C(), R = Rw(), st = g.level.st;
    const ink = st.ink;
    const panel = ink ? [0.88, 0.86, 0.8] : [0.02, 0.015, 0.01];
    const txt = ink ? [0.15, 0.12, 0.12] : [0.75, 0.7, 0.62];
    for (let j = R - 3; j < R; j++) UI.fill(0, j, cols, 1, panel);
    const y = R - 2;
    const lucJitter = P.luc < 25;
    const label = (s) => (lucJitter && Math.random() < 0.05 ? s.replace(/[A-Z]/g, (c) => (Math.random() < 0.3 ? String.fromCharCode(65 + ((Math.random() * 26) | 0)) : c)) : s);
    let x = 2;
    UI.put(x, y, GL.id('sym:heart'), [1, 0.3, 0.3], null, 0.6);
    x += 2;
    UI.text(x, y, label('VITAE'), txt);
    x += 6;
    const bw = Math.max(10, Math.min(22, Math.floor(cols / 11)));
    const hpLow = P.hp / P.maxHp < 0.3;
    UI.bar(x, y, bw, P.hp / P.maxHp, hpLow && Math.sin(g.time * 8) > 0 ? [1, 0.5, 0.4] : [0.85, 0.2, 0.18], ink ? [0.7, 0.6, 0.6] : [0.18, 0.05, 0.05], hpLow ? 0.5 : 0.1);
    x += bw + 1;
    UI.text(x, y, `${Math.ceil(P.hp)}`.padStart(3), [1, 0.6, 0.55]);
    x += 6;
    UI.put(x, y, GL.id('sym:eye'), [0.75, 0.6, 1], null, 0.6);
    x += 2;
    UI.text(x, y, label('LUCIDITY'), txt);
    x += 9;
    const lc = P.luc / 100;
    UI.bar(x, y, bw, lc, [0.55 + 0.3 * (1 - lc), 0.45 * lc + 0.2, 0.95], ink ? [0.7, 0.65, 0.75] : [0.08, 0.05, 0.14], 0.15);
    x += bw + 1;
    UI.text(x, y, `${Math.ceil(P.luc)}`.padStart(3), [0.8, 0.7, 1]);
    x += 6;
    UI.put(x, y, GL.id('sym:flame'), P.lanternOn ? [1, 0.75, 0.3] : [0.4, 0.35, 0.3], null, P.lanternOn ? 0.8 : 0);
    x += 2;
    UI.text(x, y, label('OIL'), txt);
    x += 4;
    const ow = Math.max(6, Math.floor(bw * 0.6));
    UI.bar(x, y, ow, P.oil / P.oilMax, [1, 0.78, 0.3], ink ? [0.7, 0.65, 0.5] : [0.15, 0.1, 0.03], 0.1);
    x += ow + 1;
    UI.text(x, y, P.lanternOn ? 'LIT' : 'OUT', P.lanternOn ? [1, 0.8, 0.4] : [0.5, 0.45, 0.4]);
    // weapon & ammo on the right
    const w = P.weapon();
    let ammo = '';
    if (w.ammo === 'verse') ammo = `${P.ammo.verse}/${P.ammoMax('verse')} VERSES`;
    else if (w.ammo === 'letters') ammo = `${P.ammo.letters}/${P.ammoMax('letters')} LETTERS`;
    else if (w.ammo === 'oil') ammo = `${Math.ceil(P.oil)} OIL`;
    else if (w.ammo === 'lucidity') ammo = `${Math.round(w.cost * P.mods.wordCost)} LUCIDITY/WORD`;
    else ammo = 'INFINITE';
    UI.textR(cols - 2, y, `${w.name}  ${ammo}`, ink ? [0.5, 0.05, 0.05] : [1, 0.85, 0.55], null, 0.2);
    // weapon slots
    let sx = 2;
    const y2 = R - 1;
    D.WEAPON_ORDER.forEach((id, i) => {
      const owned = P.weapons.indexOf(id);
      if (owned < 0) return;
      const on = owned === P.cur;
      const s = `${i + 1} ${D.WEAPONS[id].name}`;
      UI.text(sx, y2, s, on ? (ink ? [0.6, 0, 0] : [1, 0.85, 0.5]) : ink ? [0.4, 0.38, 0.36] : [0.45, 0.42, 0.38], null, on ? 0.3 : 0);
      sx += s.length + 3;
    });
    // dash
    const dr = P.dashCd <= 0 ? 'DASH READY' : 'DASH ' + '.'.repeat(Math.ceil(P.dashCd * 4));
    UI.textR(cols - 2, y2, dr, P.dashCd <= 0 ? [0.6, 0.9, 1] : [0.35, 0.4, 0.45]);
    // top-left: where you are
    const FL = D.FLOORS[g.run.floor];
    const sameStratum = D.FLOORS.filter((f) => f.s === FL.s);
    const idx = sameStratum.indexOf(FL) + 1;
    const where = `${st.numeral} - ${st.name} - ${FL.boss ? 'THE END OF THE STRATUM' : idx + '/' + sameStratum.filter((f) => !f.boss).length}`;
    UI.text(2, 1, where, ink ? [0.4, 0.05, 0.05] : st.accent, null, 0.2);
    UI.text(2, 2, `"${g.run.seed}"`, ink ? [0.55, 0.5, 0.5] : [0.4, 0.38, 0.35]);
    // top-right: ink & relics
    UI.textR(cols - 2, 1, `INK ${g.save.ink}`, ink ? [0.1, 0.1, 0.5] : [0.6, 0.55, 1], null, 0.3);
    let rx = cols - 2;
    for (let i = P.relics.length - 1; i >= 0; i--) {
      const r = D.RELICS[P.relics[i]];
      UI.put(rx - 1, 2, GL.id('sym:' + r.sym), ink ? [0.5, 0.3, 0] : [1, 0.82, 0.4], null, 0.5);
      rx -= 2;
    }
    if (g.opts.fps) UI.textR(cols - 2, 3, `${g.fpsShow} FPS ${g.msShow}MS`, [0.5, 0.8, 0.5]);
  };

  UI.bossBar = function (g) {
    const b = g.bossRef;
    if (!b || !b.alive) return;
    const cols = C();
    const w = Math.min(60, cols - 20), x = Math.floor((cols - w) / 2), y = 4;
    const name = D.CODEX[b.type === 'heart' ? 'unwritten' : b.type].name;
    UI.textC(y - 1, name, [1, 0.35, 0.3], null, 0.5);
    UI.bar(x, y, w, b.hp / b.maxHp, [0.85, 0.1, 0.1], [0.2, 0.03, 0.03], 0.4);
    if (b.data.shield) UI.textC(y + 1, 'SEALED', [0.8, 0.6, 1], null, 0.4);
  };

  UI.messages = function (g) {
    let y = 6;
    for (const m of g.msgs) {
      const a = Math.min(1, m.t * 1.5);
      const c = [m.col[0] * a, m.col[1] * a, m.col[2] * a];
      for (const line of UI.wrap(m.text, Math.min(70, C() - 8))) UI.caption(y++, line, c, 0.3 * a, g.level.st.ink);
    }
  };

  UI.prompt = function (g) {
    if (!g.prompt) return;
    const y = Math.floor(Rw() * 0.64);
    const s = `[${In.label('interact')}] ${g.prompt.text}`;
    UI.caption(y, s, g.level.st.ink ? [0.5, 0, 0] : [1, 0.9, 0.6], 0.5, g.level.st.ink);
  };

  UI.damageArrows = function (g) {
    const P = g.player;
    if (P.hurtT <= 0) return;
    const rel = G.angleDiff(g.cam.a, P.hurtDir);
    const cx = C() / 2, cy = Rw() / 2;
    const rx = C() * 0.32, ry = Rw() * 0.32;
    const x = Math.round(cx + Math.sin(rel) * rx), y = Math.round(cy - Math.cos(rel) * ry);
    const sym = Math.abs(rel) < 0.6 ? 'arrowU' : Math.abs(rel) > 2.5 ? 'arrowD' : rel > 0 ? 'arrowR' : 'arrowL';
    const a = Math.min(1, P.hurtT * 2);
    UI.put(x, y, GL.id('sym:' + sym), [1 * a, 0.15 * a, 0.1 * a], null, a);
    UI.put(x + 1, y, GL.id('sym:' + sym), [1 * a, 0.15 * a, 0.1 * a], null, a);
  };

  // ---- dark sight: beacons over what can be used, markers for unseen threats ----
  const BEACON = { exitwell: 'sym:diamond', brazier: 'sym:flame', lectern: 'sym:eye', altar: 'sym:star', remnant: 'sym:moon' };
  const bprj = { d: 0, sx: 0, sy: 0, cx: 0, cy: 0 };
  function spent(e) {
    return (e.type === 'brazier' && e.lit) || (e.type === 'lectern' && e.read) || (e.type === 'altar' && e.used);
  }
  function edgeMark(g, ang, col, a, label) {
    const rel = G.angleDiff(g.cam.a, ang);
    const cx = C() / 2, cy = Rw() / 2, rx = C() * 0.4, ry = Rw() * 0.36;
    const x = Math.round(cx + Math.sin(rel) * rx), y = Math.round(cy - Math.cos(rel) * ry);
    const sym = Math.abs(rel) < 0.6 ? 'arrowU' : Math.abs(rel) > 2.5 ? 'arrowD' : rel > 0 ? 'arrowR' : 'arrowL';
    const c = [col[0] * a, col[1] * a, col[2] * a];
    UI.put(x, y, GL.id('sym:' + sym), c, null, a);
    if (label) UI.text(x - (rel > 0 ? label.length + 1 : -2), y, label, [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], null, a * 0.4);
  }
  UI.beacons = function (g) {
    const P = g.player, R = G.R, ink = g.level.st.ink, dark = g.dark || 0, t = g.time;
    const cols = C(), rows = Rw();
    let threats = 0;
    for (const e of g.ents) {
      if (!e.alive || e.isPlayer) continue;
      const def = e.def, d = Math.hypot(e.x - P.x, e.y - P.y);
      if (e.type === 'exitwell' && e.seen) e.known = true;
      if (def.kind === 'enemy') {
        // a creature that is hunting you, out of sight, close: mark the edge it comes from
        if (e.seen || e.state === 'idle' || def.stealth || def.phantom || d > 9 || threats >= 6) continue;
        const a = Math.min(1, dark * (1 - d / 9) * 1.3 + (d < 3 ? 0.35 : 0)) * (0.75 + 0.25 * Math.sin(t * 9 + e.id));
        if (a < 0.08) continue;
        threats++;
        edgeMark(g, Math.atan2(e.y - P.y, e.x - P.x), ink ? [0.6, 0.02, 0.05] : [1, 0.22, 0.15], a, null);
        continue;
      }
      const sym = def.kind === 'pickup' ? 'sym:diamond' : BEACON[e.type];
      if (!sym || spent(e)) continue;
      const well = e.type === 'exitwell';
      let w = well ? (e.known ? 0.3 + 0.7 * dark : 0) : dark * G.clamp(1 - d / 14, 0, 1);
      if (w < 0.05) continue;
      const col = ink ? [0.5, 0.05, 0.08] : def.emit || def.col || [1, 0.9, 0.6];
      if (!e.seen) {
        if (well && e.known) edgeMark(g, Math.atan2(e.y - P.y, e.x - P.x), col, w * 0.9, `${Math.round(d)}`);
        continue;
      }
      R.project(e.x, e.y, (e.z || 0) + e.h + 0.35, bprj);
      if (bprj.d <= 0.3) continue;
      const x = Math.floor(bprj.cx), y = Math.max(0, Math.floor(bprj.cy));
      if (x < 0 || x >= cols || y >= rows - 3) continue;
      if (R.cellDepth[y * cols + x] < bprj.d - 0.6) continue; // hidden behind a wall
      const a = w * (0.65 + 0.35 * Math.sin(t * 3 + e.id));
      const c = [col[0] * a, col[1] * a, col[2] * a];
      UI.put(x, y, GL.id(sym), c, null, a);
      // a falling stroke of light ties the mark to its object
      const bot = Math.floor(bprj.cy + (e.h * R.cam.projY) / bprj.d / 4 * 0.35);
      for (let yy = y + 1; yy <= Math.min(bot, rows - 4); yy++) {
        const f = a * 0.45 * (1 - (yy - y) / (bot - y + 1));
        if (R.cellDepth[yy * cols + x] < bprj.d - 0.6) break;
        UI.put(x, yy, GL.ch(':'), [col[0] * f, col[1] * f, col[2] * f], null, f);
      }
      if (well && d > 3) UI.text(x + 2, y, `${Math.round(d)}`, [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], null, a * 0.3);
    }
  };

  // ---- combat feedback: damage written in the air, the fervor chain, words of impact ----
  const nprj = { d: 0, sx: 0, sy: 0, cx: 0, cy: 0 };
  UI.combat = function (g) {
    const R = G.R, cols = C(), rows = Rw(), ink = g.level.st.ink;
    if (g.opts.dmgNums && g.dmgNums) {
      for (const n of g.dmgNums) {
        const k = n.t / n.max;
        R.project(n.x, n.y, n.z + (1 - k) * 0.6, nprj);
        if (nprj.d <= 0.3) continue;
        const s = String(Math.max(1, Math.round(n.v)));
        const x = Math.round(nprj.cx + n.ox - s.length / 2), y = Math.floor(nprj.cy);
        if (y < 1 || y >= rows - 4 || x < 0 || x + s.length >= cols) continue;
        if (R.cellDepth[y * cols + Math.max(0, Math.min(cols - 1, x))] < nprj.d - 0.8) continue;
        const a = Math.min(1, k * 2.5), big = n.v >= 40;
        const c = ink ? [0.5 * a, 0.02, 0.05] : n.crit ? [1 * a, 0.85 * a, 0.3 * a] : big ? [1 * a, 0.45 * a, 0.25 * a] : [0.95 * a, 0.92 * a, 0.85 * a];
        UI.text(x, y, s, c, null, (big || n.crit ? 0.8 : 0.35) * a);
      }
    }
    const f = g.fervor;
    if (f && f.t > 0 && f.n >= 2) {
      const x = cols - 3, y = 5, p = f.pulse || 0;
      const heat = Math.min(1, f.n / 12);
      const c = ink ? [0.55, 0.05, 0.05] : [1, 0.75 - heat * 0.45 + p * 0.25, 0.35 - heat * 0.25 + p * 0.3];
      UI.textR(x, y, `x${f.n} FERVOR`, c, null, 0.4 + p * 0.6);
      const w = 12, fill = Math.round((f.t / 4) * w);
      for (let i = 0; i < w; i++) UI.put(x - w + i, y + 1, GL.ch(i < fill ? '=' : '-'), i < fill ? c : [0.25, 0.22, 0.2], null, i < fill ? 0.3 : 0);
      UI.textR(x, y + 2, `+${Math.round((g.fervorMul() - 1) * 100)}% DAMAGE`, [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7]);
    }
    if (g.words && g.words.length) {
      const w = g.words[g.words.length - 1];
      const k = w.t / w.max, a = Math.min(1, k * 3, (1 - k) * 8);
      const h = Math.max(3, Math.floor(rows / 14));
      const c = ink ? [0.4 * a, 0.02, 0.02] : [w.col[0] * a, w.col[1] * a, w.col[2] * a];
      UI.bigText(w.text, cols / 2 + (k > 0.85 ? (Math.random() - 0.5) * 2 : 0), Math.floor(rows * 0.24), h, 'braille', c, 0.6 * a);
    }
  };

  // The Oculus blinks, and you are inside the eye: lids of flesh close over the screen.
  UI.eyelids = function (g, k) {
    const cols = C(), rows = Rw() - 3, half = rows / 2;
    for (let x = 0; x < cols; x++) {
      const u = (x - cols / 2) / (cols / 2);
      const reach = Math.ceil(half * k * (1 - 0.35 * u * u) + (k > 0.98 ? 1 : 0));
      for (let j = 0; j < reach; j++) {
        const edge = j === reach - 1;
        const c = edge ? [0.55, 0.12, 0.16] : [0.16 + 0.04 * Math.sin(x * 0.7 + j), 0.03, 0.04];
        const gl = edge ? GL.ch(j % 2 ? '~' : '-') : 0;
        UI.put(x, j, gl, c, [0.12, 0.02, 0.03]);
        UI.put(x, rows - 1 - j, gl, c, [0.12, 0.02, 0.03]);
      }
    }
  };

  // Margins whisper; and they point to the lie in the wall.
  UI.whispers = function (g) {
    for (const w of g.whispers) {
      const a = Math.min(1, w.t, (w.max - w.t) * 2);
      const c = g.level.st.ink ? [0.4 * a, 0.05, 0.05] : [0.6 * a, 0.5 * a, 0.85 * a];
      UI.text(w.x, w.y, w.text, c, null, 0.2 * a);
    }
  };

  UI.bars = function (g) {
    const cols = C(), R = Rw();
    for (const b of g.bars) {
      const y0 = Math.floor(b.y * R), h = b.h;
      for (let j = y0; j < y0 + h; j++) {
        if (j < 0 || j >= R - 3) continue;
        for (let i = 0; i < cols; i++) {
          const edge = j === y0 || j === y0 + h - 1;
          UI.put(i, j, edge ? GL.id(j === y0 ? 'v:2' : 'q:3') : GL.id('q:15'), edge ? [0.5, 0.02, 0.02] : [0.01, 0, 0], [0, 0, 0], edge ? 0.3 : 0);
        }
      }
    }
  };

  // The map: everything you have seen, folded flat.
  UI.map = function (g) {
    const L = g.level, P = g.player, cols = C(), R = Rw();
    const W = L.w, H = L.h;
    const mw = Math.min(W, cols - 4), mh = Math.min(H, R - 8);
    const ox = Math.floor((cols - mw) / 2), oy = Math.floor((R - mh) / 2) - 1;
    const sx = G.clamp(Math.floor(P.x - mw / 2), 0, Math.max(0, W - mw)), sy = G.clamp(Math.floor(P.y - mh / 2), 0, Math.max(0, H - mh));
    UI.dim(0, 0, cols, R - 3, 0.25);
    UI.frame(ox - 1, oy - 1, mw + 2, mh + 2, [0.5, 0.45, 0.4], true);
    const ink = L.st.ink;
    for (let j = 0; j < mh; j++)
      for (let i = 0; i < mw; i++) {
        const tx = sx + i, ty = sy + j, ti = ty * W + tx;
        if (!(L.flags[ti] & D.F.SEEN)) continue;
        let g2, c;
        if (L.tiles[ti] > 0) {
          let n = 0;
          if (!L.wall(tx, ty - 1)) n |= 1;
          if (!L.wall(tx + 1, ty)) n |= 2;
          if (!L.wall(tx, ty + 1)) n |= 4;
          if (!L.wall(tx - 1, ty)) n |= 8;
          if (!n) continue;
          g2 = GL.id('q:15');
          c = L.flags[ti] & D.F.SECRET && L.secretOpen ? [0.7, 0.3, 1] : ink ? [0.2, 0.2, 0.2] : [0.55, 0.45, 0.35];
        } else {
          g2 = GL.ch(L.flags[ti] & D.F.WATER ? '~' : L.flags[ti] & D.F.SKY ? ':' : '.');
          c = ink ? [0.5, 0.45, 0.4] : [0.3, 0.27, 0.24];
        }
        UI.put(ox + i, oy + j, g2, c, ink ? [0.9, 0.88, 0.84] : [0, 0, 0]);
      }
    for (const e of g.ents) {
      if (!e.alive) continue;
      const tx = Math.floor(e.x) - sx, ty = Math.floor(e.y) - sy;
      if (tx < 0 || ty < 0 || tx >= mw || ty >= mh) continue;
      if (!(L.flags[Math.floor(e.y) * W + Math.floor(e.x)] & D.F.SEEN)) continue;
      if (e.type === 'exitwell') UI.put(ox + tx, oy + ty, GL.id('sym:spiral'), [0.8, 0.5, 1], null, 1);
      else if (e.type === 'brazier') UI.put(ox + tx, oy + ty, GL.id('sym:flame'), e.lit ? [1, 0.6, 0.2] : [0.4, 0.3, 0.2], null, e.lit ? 0.8 : 0);
      else if (e.type === 'altar' && !e.used) UI.put(ox + tx, oy + ty, GL.id('sym:diamond'), [1, 0.85, 0.4], null, 0.8);
      else if (e.type === 'lectern' && !e.read) UI.put(ox + tx, oy + ty, GL.id('sym:key'), [1, 0.95, 0.8], null, 0.5);
      else if (e.type === 'remnant') UI.put(ox + tx, oy + ty, GL.id('sym:cross'), [0.6, 0.7, 1], null, 0.5);
    }
    const px = Math.floor(P.x) - sx, py = Math.floor(P.y) - sy;
    const a = ((P.a % G.TAU) + G.TAU) % G.TAU;
    const dirSym = a < Math.PI / 4 || a > (7 * Math.PI) / 4 ? 'arrowR' : a < (3 * Math.PI) / 4 ? 'arrowD' : a < (5 * Math.PI) / 4 ? 'arrowL' : 'arrowU';
    UI.put(ox + px, oy + py, GL.id('sym:' + dirSym), [1, 0.9, 0.3], null, 1);
    UI.textC(oy - 2, `MAP OF ${L.st.name}`, [0.8, 0.75, 0.65]);
  };

  // Title card on arrival.
  UI.titleCard = function (g) {
    if (g.titleT <= 0) return;
    const st = g.level.st;
    const a = Math.min(1, g.titleT / 1.2, (5 - g.titleT) * 2);
    if (a <= 0) return;
    const R = Rw();
    const FL = D.FLOORS[g.run.floor];
    const col = st.ink ? [0.45 * a, 0.03, 0.03] : [st.accent[0] * a, st.accent[1] * a, st.accent[2] * a];
    const cy = Math.floor(R * (FL.boss ? 0.3 : 0.2));
    UI.bigText(st.numeral, C() / 2, cy, Math.max(4, Math.floor(R / 9)), 'blocks', col, 0.6 * a);
    UI.caption(cy + Math.floor(R / 18) + 2, FL.boss ? `${st.name}  -  ${D.CODEX[FL.boss].name} WAITS` : st.name, col, 0.5 * a, st.ink);
    UI.caption(cy + Math.floor(R / 18) + 3, st.sub, [col[0] * 0.75, col[1] * 0.75, col[2] * 0.75], 0, st.ink);
  };

  // Random-glyph scramble for transitions.
  UI.scramble = function (g, amount, seed) {
    if (amount <= 0) return;
    const n = DSP.cols * DSP.rows;
    const sets = ['sa:', 'sb:'];
    const acc = g.level ? g.level.st.accent : [1, 0.7, 0.3];
    for (let i = 0; i < n; i++) {
      if (G.hash2(i, seed, 1) > amount) continue;
      const k = G.hash2(i, seed, 2);
      DSP.glyph[i] = GL.id(sets[(k * 2) | 0] + ((k * 9600) % 96 | 0));
      const o = i * 4;
      const b = 0.3 + 0.7 * G.hash2(i, seed, 3);
      DSP.fg[o] = acc[0] * 255 * b;
      DSP.fg[o + 1] = acc[1] * 255 * b;
      DSP.fg[o + 2] = acc[2] * 255 * b;
      DSP.fg[o + 3] = 80;
      DSP.bg[o] = DSP.bg[o + 1] = DSP.bg[o + 2] = 0;
    }
  };

  // A text page (lore, epitaphs) with a typewriter reveal.
  UI.page = function (title, lines, t, accent, footer) {
    const cols = C(), R = Rw();
    const w = Math.min(76, cols - 6);
    const body = [];
    for (const l of lines) for (const s of l === '' ? [''] : UI.wrap(l, w - 6)) body.push(s);
    const h = body.length + 6;
    const x = Math.floor((cols - w) / 2), y = Math.floor((R - h) / 2) - 1;
    UI.dim(0, 0, cols, R, 0.3);
    UI.frame(x, y, w, h, accent, true, [0.03, 0.025, 0.02]);
    UI.textC(y + 1, title, accent, null, 0.5);
    let budget = Math.floor(t * 70);
    body.forEach((s, i) => {
      const shown = s.slice(0, Math.max(0, budget));
      budget -= s.length;
      UI.text(x + 3, y + 3 + i, shown, [0.9, 0.86, 0.78]);
    });
    if (footer) UI.textC(y + h - 2, footer, [0.55, 0.52, 0.48]);
  };
})();
