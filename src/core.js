'use strict';
// Core utilities shared by every module. Everything hangs off the global G.
(function () {
  const G = (window.G = window.G || {});

  G.TAU = Math.PI * 2;
  G.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.smoothstep = (a, b, x) => {
    const t = G.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  G.angleDiff = (a, b) => {
    let d = (b - a) % G.TAU;
    if (d > Math.PI) d -= G.TAU;
    else if (d < -Math.PI) d += G.TAU;
    return d;
  };
  G.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

  // FNV-1a string hash.
  G.hashStr = function (s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };

  // Integer lattice hash -> [0,1).
  G.hash2 = function (x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // Smooth value noise.
  G.noise2 = function (x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf);
    yf = yf * yf * (3 - 2 * yf);
    const a = G.hash2(xi, yi, s), b = G.hash2(xi + 1, yi, s);
    const c = G.hash2(xi, yi + 1, s), d = G.hash2(xi + 1, yi + 1, s);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };

  // mulberry32 PRNG: small, fast, deterministic per seed.
  class RNG {
    constructor(seed) {
      this.s = seed >>> 0 || 0x9e3779b9;
    }
    next() {
      let t = (this.s = (this.s + 0x6d2b79f5) | 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) {
      return a + (b - a) * this.next();
    }
    int(a, b) {
      return a + Math.floor(this.next() * (b - a + 1));
    }
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    }
    chance(p) {
      return this.next() < p;
    }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    }
    weighted(obj) {
      let tot = 0;
      for (const k in obj) tot += obj[k];
      let r = this.next() * tot;
      for (const k in obj) {
        r -= obj[k];
        if (r <= 0) return k;
      }
      return Object.keys(obj)[0];
    }
  }
  G.RNG = RNG;
  // Non-deterministic stream for combat noise and effects.
  G.rand = new RNG((Math.random() * 4294967296) >>> 0);

  G.hex = (s) => {
    const n = parseInt(s.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  // localStorage can throw (private mode, blocked storage); never let it break the game.
  G.store = {
    load(key, def) {
      try {
        const s = localStorage.getItem(key);
        return s ? JSON.parse(s) : def;
      } catch (e) {
        return def;
      }
    },
    save(key, v) {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch (e) {
        /* storage unavailable */
      }
    },
  };

  G.params = new URLSearchParams(location.search);
  G.debug = G.params.has('debug');
})();
