'use strict';
// Levels: a tile grid with materials, flags, edge portals (non-Euclidean doorways), a baked
// lightmap, a flow field for pathing, and procedural generation for floors and boss arenas.
(function () {
  const G = window.G;
  const D = G.Data, F = D.F, M = D.MAT;
  // Directions: 0=E(+x) 1=W(-x) 2=S(+y) 3=N(-y)
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];

  class Level {
    constructor(w, h, st) {
      this.w = w;
      this.h = h;
      this.st = st;
      this.tiles = new Uint8Array(w * h).fill(st.mats[0]);
      this.flags = new Uint8Array(w * h);
      this.room = new Int16Array(w * h).fill(-1);
      this.plink = new Int16Array(w * h * 4).fill(-1);
      this.portals = [];
      this.lm = new Float32Array(w * h * 3);
      this.flow = new Int16Array(w * h).fill(32767);
      this.seen = new Uint32Array(w * h);
      this.text = new Array(w * h);
      this.rooms = [];
      this.lights = [];
      this.shifts = [];
      this.spawns = [];
      this.secretOpen = false;
      this.dmask = new Uint8Array(w * h);
      this.dtile = new Array(w * h);
      this.decals = [];
      this.start = { x: 2.5, y: 2.5, a: 0 };
      this.arena = null;
    }
    inb(x, y) {
      return x >= 0 && y >= 0 && x < this.w && y < this.h;
    }
    wall(x, y) {
      return !this.inb(x, y) || this.tiles[y * this.w + x] > 0;
    }
    solid(x, y) {
      if (!this.inb(x, y)) return true;
      const i = y * this.w + x;
      if (this.tiles[i] === 0) return false;
      return !(this.secretOpen && this.flags[i] & F.SECRET);
    }
    addPortal(tx, ty, dir, ox, oy) {
      const id = this.portals.length;
      this.portals.push({ ox, oy });
      this.plink[(ty * this.w + tx) * 4 + dir] = id;
    }
    portal(tx, ty, dir) {
      if (!this.inb(tx, ty)) return null;
      const id = this.plink[(ty * this.w + tx) * 4 + dir];
      return id < 0 ? null : this.portals[id];
    }

    // Axis-separated movement with radius r. Returns true if blocked.
    move(e, dx, dy, r, portals) {
      let blocked = false;
      if (dx) blocked = this._axis(e, dx, 0, r, portals) || blocked;
      if (dy) blocked = this._axis(e, 0, dy, r, portals) || blocked;
      return blocked;
    }
    _axis(e, dx, dy, r, portals) {
      const horiz = dx !== 0;
      const d = horiz ? dx : dy;
      const dir = horiz ? (d > 0 ? 0 : 1) : d > 0 ? 2 : 3;
      const cx = Math.floor(e.x), cy = Math.floor(e.y);
      const npos = (horiz ? e.x : e.y) + d;
      const edge = npos + (d > 0 ? r : -r);
      const cur = horiz ? cx : cy;
      const probe = Math.floor(edge);
      if (probe !== cur) {
        const o0 = Math.floor((horiz ? e.y : e.x) - r), o1 = Math.floor((horiz ? e.y : e.x) + r);
        for (let o = o0; o <= o1; o++) {
          const tx = horiz ? cx : o, ty = horiz ? o : cy;
          const p = portals ? this.portal(tx, ty, dir) : null;
          if (p) {
            if (!this.solid(tx + DX[dir] + p.ox, ty + DY[dir] + p.oy)) continue;
          }
          const px = horiz ? probe : o, py = horiz ? o : probe;
          if (this.solid(px, py)) {
            // clamp to the boundary
            if (horiz) e.x = d > 0 ? probe - r - 0.001 : probe + 1 + r + 0.001;
            else e.y = d > 0 ? probe - r - 0.001 : probe + 1 + r + 0.001;
            if (horiz ? Math.floor(e.x) !== cx : Math.floor(e.y) !== cy) {
              if (horiz) e.x = d > 0 ? cx + 1 - r - 0.001 : cx + r + 0.001;
              else e.y = d > 0 ? cy + 1 - r - 0.001 : cy + r + 0.001;
            }
            return true;
          }
        }
      }
      if (horiz) e.x = npos;
      else e.y = npos;
      if (portals) {
        const nc = Math.floor(horiz ? e.x : e.y);
        if (nc !== cur) {
          const p = this.portal(cx, cy, dir);
          if (p) {
            e.x += p.ox;
            e.y += p.oy;
            e.portaled = true;
          }
        }
      }
      return false;
    }

    // Line of sight (no portals). Secret walls block sight.
    los(x0, y0, x1, y1) {
      let mx = Math.floor(x0), my = Math.floor(y0);
      const tx = Math.floor(x1), ty = Math.floor(y1);
      const dx = x1 - x0, dy = y1 - y0;
      const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
      const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
      let sdx = (dx > 0 ? mx + 1 - x0 : x0 - mx) * ddx, sdy = (dy > 0 ? my + 1 - y0 : y0 - my) * ddy;
      for (let i = 0; i < 200; i++) {
        if (mx === tx && my === ty) return true;
        if (sdx < sdy) {
          sdx += ddx;
          mx += sx;
        } else {
          sdy += ddy;
          my += sy;
        }
        if (mx === tx && my === ty) return true;
        if (this.wall(mx, my)) return false;
      }
      return false;
    }

    // Breadth-first flow field toward (x, y).
    computeFlow(x, y) {
      const W = this.w, H = this.h, f = this.flow;
      f.fill(32767);
      const q = this._q || (this._q = new Int32Array(W * H));
      let head = 0, tail = 0;
      const s = Math.floor(y) * W + Math.floor(x);
      if (s < 0 || s >= W * H) return;
      f[s] = 0;
      q[tail++] = s;
      while (head < tail) {
        const i = q[head++], v = f[i] + 1;
        const ix = i % W, iy = (i / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = ix + DX[d], ny = iy + DY[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (f[j] <= v || this.solid(nx, ny)) continue;
          f[j] = v;
          q[tail++] = j;
        }
      }
    }

    // Static lighting: ambient, sky light, and line-of-sight point lights.
    bake() {
      const W = this.w, H = this.h, lm = this.lm, st = this.st;
      const sky = st.sky === 'sea' ? [0.05, 0.16, 0.16] : st.sky === 'cosmos' ? [0.1, 0.06, 0.16] : [0, 0, 0];
      for (let i = 0; i < W * H; i++) {
        const s = this.flags[i] & F.SKY ? 1 : 0;
        lm[i * 3] = st.ambient[0] + sky[0] * s;
        lm[i * 3 + 1] = st.ambient[1] + sky[1] * s;
        lm[i * 3 + 2] = st.ambient[2] + sky[2] * s;
      }
      for (const L of this.lights) {
        if (L.off) continue;
        const r = L.rad, x0 = Math.max(0, Math.floor(L.x - r)), x1 = Math.min(W - 1, Math.ceil(L.x + r));
        const y0 = Math.max(0, Math.floor(L.y - r)), y1 = Math.min(H - 1, Math.ceil(L.y + r));
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const d = Math.hypot(x + 0.5 - L.x, y + 0.5 - L.y);
            if (d >= r) continue;
            if (!this.los(L.x, L.y, x + 0.5, y + 0.5)) continue;
            const k = (1 - d / r) * (1 - d / r) * L.i;
            const i = (y * W + x) * 3;
            lm[i] += L.c[0] * k;
            lm[i + 1] += L.c[1] * k;
            lm[i + 2] += L.c[2] * k;
          }
      }
    }
    // Bilinear lightmap sample into out[0..2].
    light(x, y, out) {
      const W = this.w, lm = this.lm;
      let fx = x - 0.5, fy = y - 0.5;
      let ix = Math.floor(fx), iy = Math.floor(fy);
      fx -= ix;
      fy -= iy;
      if (ix < 0) { ix = 0; fx = 0; }
      if (iy < 0) { iy = 0; fy = 0; }
      if (ix >= W - 1) { ix = W - 2; fx = 1; }
      if (iy >= this.h - 1) { iy = this.h - 2; fy = 1; }
      const a = (iy * W + ix) * 3, b = a + 3, c = a + W * 3, d = c + 3;
      const w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
      out[0] = lm[a] * w0 + lm[b] * w1 + lm[c] * w2 + lm[d] * w3;
      out[1] = lm[a + 1] * w0 + lm[b + 1] * w1 + lm[c + 1] * w2 + lm[d + 1] * w3;
      out[2] = lm[a + 2] * w0 + lm[b + 2] * w1 + lm[c + 2] * w2 + lm[d + 2] * w3;
      return out;
    }

    // Stains on floors and walls. A decal is stored in every tile its circle touches.
    addDecal(dc) {
      const W = this.w;
      const x0 = Math.max(0, Math.floor(dc.x - dc.r)), x1 = Math.min(W - 1, Math.floor(dc.x + dc.r));
      const y0 = Math.max(0, Math.floor(dc.y - dc.r)), y1 = Math.min(this.h - 1, Math.floor(dc.y + dc.r));
      dc.tiles = [];
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          if (dc.wall ? this.tiles[i] === 0 : this.tiles[i] > 0) continue;
          const list = this.dtile[i] || (this.dtile[i] = []);
          if (list.length >= 8) this.removeDecal(list[0]);
          list.push(dc);
          this.dmask[i] = 1;
          dc.tiles.push(i);
        }
      this.decals.push(dc);
      if (this.decals.length > 360) this.removeDecal(this.decals[0]);
    }
    removeDecal(dc) {
      for (const i of dc.tiles) {
        const list = this.dtile[i];
        const k = list.indexOf(dc);
        if (k >= 0) list.splice(k, 1);
        if (!list.length) this.dmask[i] = 0;
      }
      dc.tiles = [];
      const k = this.decals.indexOf(dc);
      if (k >= 0) this.decals.splice(k, 1);
    }

    randomFloorIn(room, rng, margin) {
      const m = margin === undefined ? 1 : margin;
      for (let t = 0; t < 40; t++) {
        const x = rng.int(room.x + m, room.x + room.w - 1 - m), y = rng.int(room.y + m, room.y + room.h - 1 - m);
        if (!this.wall(x, y)) return { x: x + 0.5, y: y + 0.5 };
      }
      return { x: room.cx + 0.5, y: room.cy + 0.5 };
    }
  }
  G.Level = Level;

  // ---------------------------------------------------------------- generation
  function carve(L, x, y, roomId) {
    if (x < 1 || y < 1 || x >= L.w - 1 || y >= L.h - 1) return;
    const i = y * L.w + x;
    L.tiles[i] = 0;
    if (roomId !== undefined && roomId >= 0) {
      L.room[i] = roomId;
      L.flags[i] |= F.ROOM;
    }
  }
  function carveCorridor(L, a, b, rng, wide) {
    const hFirst = rng.chance(0.5);
    const w = wide ? 2 : 1;
    const hline = (x0, x1, y) => {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let k = 0; k < w; k++) carve(L, x, y + k);
    };
    const vline = (y0, y1, x) => {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let k = 0; k < w; k++) carve(L, x + k, y);
    };
    if (hFirst) {
      hline(a.cx, b.cx, a.cy);
      vline(a.cy, b.cy, b.cx);
    } else {
      vline(a.cy, b.cy, a.cx);
      hline(a.cx, b.cx, b.cy);
    }
  }

  function roomTiles(L, r) {
    const out = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!L.wall(x, y)) out.push([x, y]);
    return out;
  }

  G.Level.generate = function (fi, seedStr, opts) {
    const FL = D.FLOORS[fi], st = D.STRATA[FL.s];
    const rng = new G.RNG(G.hashStr(seedStr + '#' + fi));
    if (FL.boss) return genArena(fi, FL, st, rng, opts);
    const W = FL.size, H = FL.size;
    const L = new Level(W, H, st);
    L.fi = fi;
    // rooms
    const target = rng.int(FL.rooms[0], FL.rooms[1]);
    const rooms = L.rooms;
    for (let tries = 0; rooms.length < target && tries < 900; tries++) {
      const w = rng.int(5, 12), h = rng.int(5, 11);
      const x = rng.int(2, W - w - 3), y = rng.int(2, H - h - 3);
      let ok = true;
      for (const r of rooms) if (x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y) { ok = false; break; }
      if (!ok) continue;
      rooms.push({ id: rooms.length, x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1), type: 'normal', shape: 'rect' });
    }
    for (const r of rooms) {
      const shape = r.w >= 7 && r.h >= 7 && rng.chance(0.22) ? 'round' : r.w >= 8 && r.h >= 8 && rng.chance(0.15) ? 'cross' : 'rect';
      r.shape = shape;
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) {
          const u = (x + 0.5 - (r.x + r.w / 2)) / (r.w / 2), v = (y + 0.5 - (r.y + r.h / 2)) / (r.h / 2);
          if (shape === 'round' && u * u + v * v > 1.05) continue;
          if (shape === 'cross' && Math.abs(u) > 0.4 && Math.abs(v) > 0.4) continue;
          carve(L, x, y, r.id);
        }
    }
    // connect: Prim MST plus a few loops
    const inTree = [0], edges = [];
    const left = new Set(rooms.map((r) => r.id).slice(1));
    while (left.size) {
      let best = null, bd = 1e9;
      for (const a of inTree)
        for (const b of left) {
          const d = Math.abs(rooms[a].cx - rooms[b].cx) + Math.abs(rooms[a].cy - rooms[b].cy);
          if (d < bd) {
            bd = d;
            best = [a, b];
          }
        }
      edges.push(best);
      inTree.push(best[1]);
      left.delete(best[1]);
    }
    const extra = Math.max(1, Math.round(rooms.length * 0.25));
    for (let i = 0; i < extra; i++) {
      const a = rng.int(0, rooms.length - 1), b = rng.int(0, rooms.length - 1);
      if (a !== b) edges.push([a, b]);
    }
    for (const [a, b] of edges) carveCorridor(L, rooms[a], rooms[b], rng, rng.chance(0.25));

    // start: the room closest to a corner; exit: farthest by walking distance
    let start = rooms[0];
    for (const r of rooms) if (r.cx + r.cy < start.cx + start.cy) start = r;
    start.type = 'start';
    L.computeFlow(start.cx + 0.5, start.cy + 0.5);
    let exit = start;
    for (const r of rooms) if (L.flow[r.cy * W + r.cx] < 32767 && L.flow[r.cy * W + r.cx] > L.flow[exit.cy * W + exit.cx]) exit = r;
    exit.type = 'exit';

    // special rooms
    const pool = rng.shuffle(rooms.filter((r) => r.type === 'normal'));
    const take = (pred) => {
      const i = pool.findIndex(pred);
      return i < 0 ? null : pool.splice(i, 1)[0];
    };
    const shrine = take(() => true);
    if (shrine) shrine.type = 'shrine';
    const lib = take(() => true);
    if (lib) lib.type = 'library';
    if (rng.chance(0.55)) {
      const lib2 = take(() => true);
      if (lib2) lib2.type = 'library';
    }
    // a mirror room: its east and west walls are the same doorway
    if (FL.s >= 1 || rng.chance(0.5)) {
      const mr = take((r) => r.shape === 'rect' && r.w >= 6 && r.h >= 5);
      if (mr) makeMirror(L, mr) ? (mr.type = 'mirror') : pool.push(mr);
    }
    for (const r of pool) {
      if (rng.chance(st.skyChance)) r.sky = true;
      if (r.shape === 'rect' && r.w >= 7 && r.h >= 7 && rng.chance(0.75)) r.pillars = true;
    }
    if (st.skyChance >= 1) for (const r of rooms) r.sky = true;
    if (rng.chance(st.skyChance) && exit) exit.sky = true;

    // materials
    const nseed = rng.int(0, 99999);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (L.tiles[i] === 0) continue;
        const n = G.noise2(x * 0.13, y * 0.13, nseed);
        L.tiles[i] = st.mats[Math.min(st.mats.length - 1, Math.floor(n * st.mats.length))];
      }
    for (const r of rooms) {
      if (r.type !== 'library') continue;
      for (let y = r.y - 1; y <= r.y + r.h; y++)
        for (let x = r.x - 1; x <= r.x + r.w; x++) if (L.inb(x, y) && L.tiles[y * W + x] > 0) L.tiles[y * W + x] = M.INSCRIBED;
    }
    // pillars (some shift when unobserved)
    for (const r of rooms) {
      if (!r.pillars) continue;
      const shifting = FL.s >= 1 && rng.chance(0.7);
      const a = [], b = [];
      for (let y = r.y + 2; y < r.y + r.h - 2; y += 3)
        for (let x = r.x + 2; x < r.x + r.w - 2; x += 3) {
          a.push(y * W + x);
          if (x + 1 < r.x + r.w - 1 && y + 1 < r.y + r.h - 1) b.push((y + 1) * W + x + 1);
        }
      for (const i of a) L.tiles[i] = M.PILLAR;
      if (shifting && b.length) {
        for (const i of a.concat(b)) L.flags[i] |= F.SHIFT;
        L.shifts.push({ a, b, on: 0, t: rng.range(5, 9) });
      }
    }
    // water
    if (st.water > 0) {
      const ws = rng.int(0, 99999);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (L.tiles[i] === 0 && G.noise2(x * 0.11, y * 0.11, ws) < st.water) L.flags[i] |= F.WATER;
        }
    }
    // skylights
    for (const r of rooms) if (r.sky) for (const [x, y] of roomTiles(L, r)) L.flags[y * W + x] |= F.SKY;
    if (st.skyChance >= 1) for (let i = 0; i < W * H; i++) L.flags[i] |= F.SKY;
    // wall inscriptions
    for (let i = 0; i < W * H; i++) if (L.tiles[i] === M.INSCRIBED || L.tiles[i] === M.VOID) L.text[i] = inscription(rng);

    // secret vault behind a wall that is a lie
    const vault = makeVault(L, rooms, rng);

    // ---- population ----
    const sp = L.spawns;
    L.start = { x: start.cx + 0.5, y: start.cy + 0.5, a: Math.atan2(exit.cy - start.cy, exit.cx - start.cx) };
    const sx = rng.chance(0.5) ? start.x + 1 : start.x + start.w - 2;
    sp.push({ type: 'brazier', x: sx + 0.5, y: start.y + 1.5, lit: true });
    sp.push({ type: 'exitwell', x: exit.cx + 0.5, y: exit.cy + 0.5 });
    L.lights.push({ x: exit.cx + 0.5, y: exit.cy + 0.5, rad: st.ink ? 4 : 7, i: st.ink ? 0.4 : 1.1, c: st.ink ? [0.35, 0.03, 0.03] : [0.6, 0.35, 1.0] });
    if (shrine) sp.push({ type: 'brazier', x: shrine.cx + 0.5, y: shrine.cy + 0.5, lit: false });
    for (const r of rooms) if (r.type === 'library') sp.push({ type: 'lectern', x: r.cx + 0.5, y: r.cy + 0.5 });
    if (vault) {
      sp.push({ type: 'altar', x: vault.cx + 0.5, y: vault.cy + 0.5 });
      for (let k = 0; k < 4; k++) {
        const p = L.randomFloorIn(vault, rng, 0);
        sp.push({ type: 'ink', x: p.x, y: p.y, val: 6 });
      }
    }
    // enemies
    let budget = FL.budget * ((opts && opts.enemyMul) || 1);
    const combat = rooms.filter((r) => r.type !== 'start' && r !== vault);
    const area = combat.reduce((s, r) => s + r.w * r.h, 0);
    for (const r of combat) {
      let rb = (budget * r.w * r.h) / area + rng.range(-0.5, 1);
      if (r.type === 'exit') rb += 1;
      let guard = 0;
      while (rb > 0.4 && guard++ < 20) {
        let type = rng.weighted(st.enemies);
        const p = L.randomFloorIn(r, rng, 1);
        if (type === 'drowned' && !(L.flags[Math.floor(p.y) * W + Math.floor(p.x)] & F.WATER)) type = 'wretch';
        rb -= D.COST[type];
        sp.push({ type, x: p.x, y: p.y });
      }
    }
    // pickups and props
    const ammoTypes = ['verse', 'letters', 'oil', 'salve'];
    for (const r of rooms) {
      if (r === vault) continue;
      if (rng.chance(0.55)) {
        const p = L.randomFloorIn(r, rng, 1);
        sp.push({ type: rng.pick(ammoTypes), x: p.x, y: p.y });
      }
      if (rng.chance(0.25)) {
        const p = L.randomFloorIn(r, rng, 1);
        sp.push({ type: 'salve', x: p.x, y: p.y });
      }
      const nInk = rng.int(0, 2);
      for (let k = 0; k < nInk; k++) {
        const p = L.randomFloorIn(r, rng, 1);
        sp.push({ type: 'ink', x: p.x, y: p.y, val: 2 });
      }
      const nProps = rng.int(1, 4);
      for (let k = 0; k < nProps; k++) {
        const p = L.randomFloorIn(r, rng, 0);
        const kind = rng.pick(st.props);
        sp.push({ type: 'prop', kind, x: p.x, y: p.y });
        if (kind === 'candles') L.lights.push({ x: p.x, y: p.y, rad: 3.5, i: 0.55, c: [1, 0.7, 0.35] });
        if (kind === 'crystals') L.lights.push({ x: p.x, y: p.y, rad: 3, i: 0.4, c: st.ink ? [0.3, 0.3, 0.3] : [0.6, 0.4, 1] });
      }
    }
    if (opts && opts.weapon) {
      const r = rng.pick(combat);
      const p = L.randomFloorIn(r, rng, 1);
      sp.push({ type: 'weapon', x: p.x, y: p.y, weapon: opts.weapon });
    }
    L.bake();
    return L;
  };

  function inscription(rng) {
    let s = '';
    while (s.length < 120) s += rng.pick(D.WALL_TEXT) + ' ';
    return s;
  }

  function makeMirror(L, r) {
    const W = L.w;
    let made = 0;
    for (let y = r.cy - 1; y <= r.cy + 1; y++) {
      const e = r.x + r.w, w = r.x - 1;
      if (!L.wall(e, y) || !L.wall(w, y) || L.wall(r.x, y) || L.wall(r.x + r.w - 1, y)) continue;
      // also require the tiles beyond to be walls, so no corridor sneaks into the fold
      if (!L.wall(e, y - 1) && y === r.cy - 1) continue;
      L.addPortal(r.x + r.w - 1, y, 0, -r.w, 0);
      L.addPortal(r.x, y, 1, r.w, 0);
      L.flags[y * W + e] |= F.LORE;
      made++;
    }
    return made > 0;
  }

  function makeVault(L, rooms, rng) {
    const W = L.w, H = L.h;
    const cands = rng.shuffle(rooms.filter((r) => r.type === 'normal' || r.type === 'library'));
    for (const r of cands) {
      for (const dir of rng.shuffle([0, 1, 2, 3])) {
        const vw = 4, vh = 4;
        let vx, vy, sx, sy;
        if (dir === 3) { vx = r.cx - 1; vy = r.y - 1 - vh; sx = r.cx; sy = r.y - 1; }
        else if (dir === 2) { vx = r.cx - 1; vy = r.y + r.h + 1; sx = r.cx; sy = r.y + r.h; }
        else if (dir === 1) { vx = r.x - 1 - vw; vy = r.cy - 1; sx = r.x - 1; sy = r.cy; }
        else { vx = r.x + r.w + 1; vy = r.cy - 1; sx = r.x + r.w; sy = r.cy; }
        if (vx < 2 || vy < 2 || vx + vw > W - 2 || vy + vh > H - 2) continue;
        // the inner side of the secret wall must be open floor
        const ix = sx - (dir === 0 ? 1 : dir === 1 ? -1 : 0), iy = sy - (dir === 2 ? 1 : dir === 3 ? -1 : 0);
        if (L.wall(ix, iy)) continue;
        let ok = L.wall(sx, sy);
        for (let y = vy - 1; ok && y <= vy + vh; y++) for (let x = vx - 1; x <= vx + vw; x++) if (!L.wall(x, y)) { ok = false; break; }
        if (!ok) continue;
        const v = { id: rooms.length, x: vx, y: vy, w: vw, h: vh, cx: vx + 2, cy: vy + 2, type: 'vault', shape: 'rect' };
        rooms.push(v);
        for (let y = vy; y < vy + vh; y++) for (let x = vx; x < vx + vw; x++) carve(L, x, y, v.id);
        L.flags[sy * W + sx] |= F.SECRET;
        L.tiles[sy * W + sx] = M.INSCRIBED;
        L.text[sy * W + sx] = 'THIS WALL IS A LIE THIS WALL IS A LIE THIS WALL IS A LIE ';
        L.lights.push({ x: v.cx + 0.5, y: v.cy + 0.5, rad: 4, i: 0.7, c: [1, 0.85, 0.4] });
        return v;
      }
    }
    return null;
  }

  function genArena(fi, FL, st, rng, opts) {
    const unw = FL.boss === 'unwritten';
    const W = unw ? 48 : 44, H = W;
    const L = new Level(W, H, st);
    L.fi = fi;
    const cx = W / 2, cy = unw ? 22 : 20, R = unw ? 15 : 13;
    L.arena = { cx, cy, r: R };
    const room = { id: 0, x: Math.floor(cx - R), y: Math.floor(cy - R), w: R * 2, h: R * 2, cx: Math.floor(cx), cy: Math.floor(cy), type: 'arena', shape: 'round' };
    L.rooms.push(room);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d < R) carve(L, x, y, 0);
      }
    // entry corridor from the south
    const ex = Math.floor(cx);
    for (let y = Math.floor(cy + R - 2); y < H - 3; y++) {
      carve(L, ex - 1, y);
      carve(L, ex, y);
    }
    for (let i = 0; i < W * H; i++) L.flags[i] |= F.ARENA;
    const nseed = rng.int(0, 9999);
    for (let i = 0; i < W * H; i++) if (L.tiles[i]) L.tiles[i] = st.mats[Math.floor(G.noise2((i % W) * 0.2, (i / W) * 0.2, nseed) * st.mats.length) % st.mats.length];
    for (let i = 0; i < W * H; i++) if (L.tiles[i] === M.INSCRIBED || L.tiles[i] === M.VOID) L.text[i] = inscription(rng);
    // pillar ring
    const pr = unw ? 6 : 8.5, np = unw ? 6 : 8;
    const ringA = [], ringB = [];
    for (let k = 0; k < np; k++) {
      const a = (k / np) * G.TAU + 0.3, a2 = a + Math.PI / np;
      const i = Math.floor(cy + Math.sin(a) * pr) * W + Math.floor(cx + Math.cos(a) * pr);
      const j = Math.floor(cy + Math.sin(a2) * pr) * W + Math.floor(cx + Math.cos(a2) * pr);
      L.tiles[i] = M.PILLAR;
      ringA.push(i);
      ringB.push(j);
    }
    if (unw) {
      for (const i of ringA.concat(ringB)) L.flags[i] |= F.SHIFT;
      L.shifts.push({ a: ringA, b: ringB, on: 0, t: 6, arena: true });
      for (let i = 0; i < W * H; i++) L.flags[i] |= F.SKY;
    }
    L.start = { x: ex + 0.0, y: H - 5.5, a: -Math.PI / 2 };
    const sp = L.spawns;
    if (unw) {
      sp.push({ type: 'heart', x: cx, y: cy });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * G.TAU;
        sp.push({ type: 'seal', x: cx + Math.cos(a) * 10, y: cy + Math.sin(a) * 10 });
      }
    } else {
      sp.push({ type: 'redactor', x: cx, y: cy - 4 });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * G.TAU + Math.PI / 4;
        const bx = cx + Math.cos(a) * (R - 2), by = cy + Math.sin(a) * (R - 2);
        sp.push({ type: 'brazier', x: bx, y: by, lit: true });
      }
    }
    sp.push({ type: 'salve', x: ex + 0.5, y: H - 8 });
    sp.push({ type: 'verse', x: ex - 0.5, y: H - 9 });
    sp.push({ type: 'oil', x: ex + 0.5, y: H - 10 });
    sp.push({ type: 'letters', x: ex - 0.5, y: H - 11 });
    L.bake();
    return L;
  }
})();
