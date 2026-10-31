'use strict';
// A render thread. It owns no state of its own: it raycasts vertical strips of the world straight
// into the main thread's shared sample buffers, claiming strips from a shared counter (see mt.js).
self.window = self;
importScripts('core.js', 'data.js', 'level.js', 'render.js');
(function () {
  const G = self.G, R = G.R;
  let ctrl = null, out = null;
  const game = {
    level: null,
    time: 0,
    frame: 0,
    dynLights: [],
    fx: { wallWarp: 0 },
    player: {
      lanternOn: false,
      lr: 6,
      lampRadius() {
        return this.lr;
      },
    },
  };
  const offs = [];

  function setDecals(L, list) {
    L.dmask.fill(0);
    L.dtile = new Array(L.w * L.h);
    L.decals = list;
    for (const dc of list)
      for (const i of dc.tiles) {
        (L.dtile[i] || (L.dtile[i] = [])).push(dc);
        L.dmask[i] = 1;
      }
  }

  self.onmessage = (ev) => {
    const m = ev.data;
    if (m.t === 'init') {
      ctrl = m.ctrl;
      out = m.out;
      self.postMessage({ t: 'ready' });
    } else if (m.t === 'size') {
      R.adopt(m.cols, m.rows, m.bufs);
    } else if (m.t === 'level') {
      const L = Object.create(G.Level.prototype);
      Object.assign(L, m.L);
      L.dmask = new Uint8Array(L.w * L.h);
      setDecals(L, m.decals);
      game.level = L;
    } else if (m.t === 'decals') {
      if (game.level) setDecals(game.level, m.decals);
    } else if (m.t === 'frame') {
      if (!game.level || !ctrl || R.SW !== m.SW) return;
      Object.assign(R.cam, m.cam);
      R.cellW = m.cellW;
      R.cellH = m.cellH;
      game.time = m.time;
      game.frame = m.frame;
      game.dynLights = m.dyn;
      game.fx.wallWarp = m.warp;
      game.player.lanternOn = m.lantern;
      game.player.lr = m.lampR;
      game.level.secretOpen = m.secret;
      const tag = m.gen << 8, n = m.n, SW = m.SW;
      for (;;) {
        const v = Atomics.load(ctrl, 0);
        if ((v & ~255) !== tag) break;
        const k = v & 255;
        if (k >= n) break;
        if (Atomics.compareExchange(ctrl, 0, v, v + 1) !== v) continue;
        offs.length = 0;
        const sky = R.worldPass(game, Math.floor((k * SW) / n), Math.floor(((k + 1) * SW) / n), offs);
        const o = k * 18;
        out[o] = sky;
        out[o + 1] = offs.length;
        for (let i = 0; i < offs.length; i++) out[o + 2 + i] = offs[i];
        Atomics.add(ctrl, 1, 1);
      }
    }
  };
})();
