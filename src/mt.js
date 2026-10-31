'use strict';
// Multithreaded world rendering. When the page is cross-origin isolated (the desktop app, or
// serve.js), the raycast is split into vertical strips. Worker threads and the main thread claim
// strips from one shared counter until none are left, writing into shared sample buffers; the
// main thread then draws creatures, effects and glyphs over the finished world. A worker that is
// late or busy simply claims fewer strips, so a frame never waits on a slow thread.
(function () {
  const G = window.G;
  const R = G.R;
  const SLOT = 18; // per strip: sky count, offset count, 8 offset pairs

  const MT = (G.MT = {
    active: false,
    threads: 0,
    workers: [],
    ready: 0,
    gen: 0,
    stripsMain: 0,
  });
  let ctrl = null, out = null;
  let sentBufs = null, sentLevel = null, sentWhp = null, sentDver = -1;
  const offs = [];

  MT.cores = () => navigator.hardwareConcurrency || 1;
  MT.supported = () => G.SAB && typeof Worker !== 'undefined' && MT.cores() > 1;

  MT.start = function () {
    if (MT.workers.length || !MT.supported()) return;
    const n = G.params.has('threads') ? +G.params.get('threads') : Math.min(7, MT.cores() - 1);
    if (!(n > 0)) return;
    ctrl = new Int32Array(new SharedArrayBuffer(8));
    out = new Float32Array(new SharedArrayBuffer(256 * SLOT * 4));
    MT.ready = 0;
    for (let i = 0; i < n; i++) {
      let w;
      try {
        w = new Worker('src/render-worker.js');
      } catch (e) {
        console.warn('render threads unavailable:', e);
        MT.stop();
        return;
      }
      w.onmessage = (ev) => {
        if (ev.data.t === 'ready' && ++MT.ready === MT.workers.length) MT.active = true;
      };
      w.onerror = (e) => {
        console.warn('render thread failed, rendering on one thread:', e.message);
        MT.stop();
      };
      w.postMessage({ t: 'init', ctrl, out });
      MT.workers.push(w);
    }
    MT.threads = n;
    sentBufs = sentLevel = sentWhp = null;
    sentDver = -1;
  };

  MT.stop = function () {
    for (const w of MT.workers) w.terminate();
    if (MT.workers.length) MT.changed = true; // the game re-fits its resolution next frame
    MT.workers = [];
    MT.active = false;
    MT.threads = 0;
  };

  function post(msg) {
    for (const w of MT.workers) w.postMessage(msg);
  }
  function decalList(L) {
    return L.decals.map((d) => ({ x: d.x, y: d.y, z: d.z, r: d.r, c: d.c, a: d.a, em: d.em, wall: d.wall, s: d.s, tiles: d.tiles }));
  }

  // Bring the workers' view of the screen buffers and the level up to date.
  function sync(game) {
    if (R.bufs !== sentBufs) {
      post({ t: 'size', cols: R.cols, rows: R.rows, bufs: R.bufs });
      sentBufs = R.bufs;
    }
    const L = game.level;
    if (L !== sentLevel || L.whp !== sentWhp) {
      post({
        t: 'level',
        L: {
          w: L.w, h: L.h, st: L.st, tiles: L.tiles, flags: L.flags, plink: L.plink, portals: L.portals, lm: L.lm,
          seen: L.seen, whp: L.whp, wmax: L.wmax, arena: !!L.arena, secretOpen: L.secretOpen,
        },
        decals: decalList(L),
      });
      sentLevel = L;
      sentWhp = L.whp;
      sentDver = L.dver || 0;
    } else if ((L.dver || 0) !== sentDver) {
      post({ t: 'decals', decals: decalList(L) });
      sentDver = L.dver || 0;
    }
  }

  function claim(game, tag, n, SW) {
    for (;;) {
      const v = Atomics.load(ctrl, 0);
      if ((v & ~255) !== tag) return;
      const k = v & 255;
      if (k >= n) return;
      if (Atomics.compareExchange(ctrl, 0, v, v + 1) !== v) continue;
      offs.length = 0;
      const sky = R.worldPass(game, Math.floor((k * SW) / n), Math.floor(((k + 1) * SW) / n), offs);
      const o = k * SLOT;
      out[o] = sky;
      out[o + 1] = offs.length;
      for (let i = 0; i < offs.length; i++) out[o + 2 + i] = offs[i];
      MT.stripsMain++;
      Atomics.add(ctrl, 1, 1);
    }
  }

  // Render the world on every thread. Returns the number of sky samples, like R.worldPass.
  MT.world = function (game) {
    sync(game);
    const SW = R.SW, P = game.player;
    // a few strips per thread balance cheap sky columns against expensive walls
    const n = Math.min(255, (MT.threads + 1) * 3);
    MT.gen = (MT.gen % 0x7ffffe) + 1;
    const tag = MT.gen << 8;
    MT.stripsMain = 0;
    Atomics.store(ctrl, 1, 0);
    Atomics.store(ctrl, 0, tag);
    const c = R.cam;
    post({
      t: 'frame', gen: MT.gen, n, SW,
      cam: { x: c.x, y: c.y, a: c.a, z: c.z, dirX: c.dirX, dirY: c.dirY, plX: c.plX, plY: c.plY, projX: c.projX, projY: c.projY, hz: c.hz, invDet: c.invDet },
      cellW: R.cellW, cellH: R.cellH, time: game.time, frame: game.frame, dyn: game.dynLights, warp: game.fx.wallWarp,
      lantern: !!P.lanternOn, lampR: P.lampRadius(), secret: game.level.secretOpen,
    });
    claim(game, tag, n, SW);
    // the main thread always needs its own per-frame tables, even if workers took every strip
    if (!MT.stripsMain) R.worldPass(game, 0, 0, offs);
    const t0 = performance.now();
    while (Atomics.load(ctrl, 1) < n) {
      if (performance.now() - t0 > 400) {
        // a thread stalled mid-strip: fall back to one thread for good
        console.warn('render threads stalled; rendering on one thread');
        MT.stop();
        Atomics.store(ctrl, 0, 0);
        R.offsets.length = 2;
        return R.worldPass(game, 0, SW, R.offsets);
      }
    }
    let sky = 0;
    const ro = R.offsets;
    for (let k = 0; k < n; k++) {
      const o = k * SLOT;
      sky += out[o];
      for (let i = 0; i < out[o + 1]; i += 2) {
        const ox = out[o + 2 + i], oy = out[o + 3 + i];
        let found = false;
        for (let j = 0; j < ro.length; j += 2) if (ro[j] === ox && ro[j + 1] === oy) found = true;
        if (!found && ro.length < 16) ro.push(ox, oy);
      }
    }
    return sky;
  };
})();
