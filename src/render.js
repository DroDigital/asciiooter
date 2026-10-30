'use strict';
// The renderer. The world is raycast at sub-cell resolution (2x4 samples per character cell,
// the braille grid), then every cell is converted into one glyph:
//   - mixed-content cells take the glyph whose *shape* best matches the 2x4 mask (via the set's LUT)
//   - flat cells take a density ramp glyph
// Each material, depth band, creature and sanity state can use a different glyph set,
// so several text-art styles share one frame.
(function () {
  const G = window.G;
  const D = G.Data, F = D.F, M = D.MAT;
  const R = (G.R = {});
  const K = 8; // portal crossings tracked per column
  const MAT_CEIL = 1, MAT_FLOOR = 2, MAT_WALL = 3, MAT_ENT = 4, MAT_WATER = 5, MAT_SKY = 6;
  R.MAT = { MAT_CEIL, MAT_FLOOR, MAT_WALL, MAT_ENT, MAT_WATER, MAT_SKY };

  let cols = 0, rows = 0, SW = 0, SH = 0;
  let sR, sG, sB, sD, sM, sE, sGl;
  let zbuf, cTop, cBot, cU, cTile, cSide, cPN, cPT, cPOX, cPOY, cRayLen;
  let rowDist, cellDepth, cellKind;
  const lampLUT = new Float32Array(512), fogLUT = new Float32Array(512);
  const tmpL = new Float32Array(8);
  const lt = [0, 0, 0];
  R.sprites = [];
  R.cam = {};
  R.offsets = [];

  R.alloc = function (c, r) {
    cols = c;
    rows = r;
    SW = c * 2;
    SH = r * 4;
    const n = SW * SH;
    sR = new Float32Array(n);
    sG = new Float32Array(n);
    sB = new Float32Array(n);
    sD = new Float32Array(n);
    sM = new Uint8Array(n);
    sE = new Int16Array(n);
    sGl = new Float32Array(n);
    zbuf = new Float32Array(SW);
    cTop = new Float32Array(SW);
    cBot = new Float32Array(SW);
    cU = new Float32Array(SW);
    cTile = new Int32Array(SW);
    cSide = new Uint8Array(SW);
    cPN = new Uint8Array(SW);
    cPT = new Float32Array(SW * K);
    cPOX = new Float32Array(SW * K);
    cPOY = new Float32Array(SW * K);
    cRayLen = new Float32Array(SW);
    rowDist = new Float32Array(SH);
    cellDepth = new Float32Array(c * r);
    cellKind = new Uint8Array(c * r);
    R.cols = c;
    R.rows = r;
    R.cellDepth = cellDepth;
    R.cellKind = cellKind;
  };

  // ---- camera ----
  R.setupCamera = function (cam, fovDeg, cellW, cellH) {
    const c = R.cam;
    c.x = cam.x;
    c.y = cam.y;
    c.a = cam.a;
    c.z = cam.z;
    c.dirX = Math.cos(cam.a);
    c.dirY = Math.sin(cam.a);
    const pl = Math.tan((fovDeg * Math.PI) / 360);
    c.plX = -c.dirY * pl;
    c.plY = c.dirX * pl;
    c.projX = SW / 2 / pl;
    c.projY = (c.projX * (cellW / 2)) / (cellH / 4);
    c.hz = SH / 2 + cam.pitch * SH * 0.62 + (cam.bob || 0) * c.projY * 0.1;
    c.invDet = 1 / (c.plX * c.dirY - c.dirX * c.plY);
  };

  // Project a world point to sample space. Returns depth (<=0 if behind).
  R.project = function (x, y, z, out) {
    const c = R.cam;
    const dx = x - c.x, dy = y - c.y;
    const tx = c.invDet * (c.dirY * dx - c.dirX * dy);
    const ty = c.invDet * (-c.plY * dx + c.plX * dy);
    out.d = ty;
    if (ty <= 0.05) return out;
    out.sx = (SW / 2) * (1 + tx / ty);
    out.sy = c.hz + ((c.z - z) * c.projY) / ty;
    out.cx = out.sx / 2;
    out.cy = out.sy / 4;
    out.camX = tx / ty;
    return out;
  };

  // ---- patterns ----
  function wallPattern(mat, u, z, th, time, out) {
    // returns brightness multiplier; may tint out[0..2]
    out[0] = out[1] = out[2] = 1;
    switch (mat) {
      case M.BRICK: {
        const row = Math.floor(z * 4);
        const bu = u * 2 + (row & 1) * 0.5;
        const fz = z * 4 - row, fu = bu - Math.floor(bu);
        if (fz < 0.1 || fu < 0.05) return 0.32;
        return 0.7 + 0.3 * G.hash2(row, Math.floor(bu), th);
      }
      case M.INSCRIBED: {
        const fz = z * 8 - Math.floor(z * 8);
        return fz < 0.08 ? 0.62 : 0.86;
      }
      case M.SHELVES: {
        const sz = z * 3, shelf = Math.floor(sz), fz = sz - shelf;
        if (fz < 0.09) return 1.0;
        const bi = Math.floor(u * 13);
        const h = G.hash2(bi, shelf, th);
        const top = 0.55 + 0.42 * G.hash2(bi + 7, shelf, th);
        if (fz > top) return 0.1;
        const edge = u * 13 - bi;
        if (edge < 0.08) return 0.2;
        out[0] = 0.75 + 0.5 * h;
        out[1] = 0.7 + 0.45 * G.hash2(bi, shelf + 3, th);
        out[2] = 0.65 + 0.5 * G.hash2(bi, shelf + 9, th);
        const band = fz > 0.32 && fz < 0.38 ? 1.25 : 1;
        return (0.4 + 0.45 * h) * band;
      }
      case M.FLESH: {
        const v = Math.sin(u * 17 + Math.sin(z * 6 + time * 0.7) * 2.4) * Math.cos(z * 8 + u * 3);
        return 0.5 + 0.35 * v + 0.1 * Math.sin(time * 2 + th);
      }
      case M.BONE: {
        const cu = u * 3 - Math.floor(u * 3) - 0.5, cz = z * 3.2 - Math.floor(z * 3.2) - 0.45;
        const d = cu * cu + cz * cz * 1.3;
        if (d > 0.11) return 0.22 + 0.1 * G.hash2(Math.floor(u * 3), Math.floor(z * 3.2), th);
        const ex = Math.abs(cu) - 0.13, ez = cz + 0.04;
        if (ex * ex + ez * ez < 0.006) return 0.12;
        return 0.85 + 0.15 * G.hash2(Math.floor(u * 3), Math.floor(z * 3.2), th + 1);
      }
      case M.CRYSTAL: {
        const f = Math.abs(u * 2 + z * 1.3 - Math.floor(u * 2 + z * 1.3) - 0.5) * 2;
        out[0] = 0.9 + 0.3 * Math.sin(z * 3 + time);
        out[2] = 1.1;
        return 0.35 + 0.65 * f * f + (G.hash2(Math.floor(u * 9), Math.floor(z * 9), th) > 0.93 ? 0.6 : 0);
      }
      case M.STONE: {
        const row = Math.floor(z * 1.6), bu = u * 1.3 + (row & 1) * 0.5;
        const fz = z * 1.6 - row, fu = bu - Math.floor(bu);
        if (fz < 0.05 || fu < 0.03) return 0.3;
        return 0.55 + 0.3 * G.hash2(row, Math.floor(bu), th) + 0.1 * Math.sin(u * 30 + z * 7);
      }
      case M.VOID: {
        if (G.hash2(Math.floor(u * 22), Math.floor(z * 30), th) > 0.965) return 0.15;
        return 0.96;
      }
      case M.PILLAR: {
        const c = Math.cos(u * G.TAU * 3);
        return 0.6 + 0.35 * c * c;
      }
      case M.KELP: {
        const s = Math.sin(u * 22 + Math.sin(z * 4 + time * 1.3) * 1.5);
        out[0] = 0.8;
        out[1] = 1.1;
        return s > 0.35 ? 0.85 : 0.3;
      }
    }
    return 0.8;
  }

  function floorPattern(pat, wx, wy, time) {
    switch (pat) {
      case 'planks': {
        const b = Math.floor(wy * 2.5), f = wy * 2.5 - b;
        if (f < 0.06) return 0.5;
        const j = wx * 0.5 + G.hash2(b, 0, 3);
        if (j - Math.floor(j) < 0.02) return 0.55;
        return 0.66 + 0.16 * G.hash2(b, Math.floor(j), 1) + 0.04 * Math.sin(wx * 9 + b);
      }
      case 'stone': {
        const fx = wx - Math.floor(wx), fy = wy - Math.floor(wy);
        if (fx < 0.05 || fy < 0.05) return 0.35;
        return 0.55 + 0.3 * G.hash2(Math.floor(wx), Math.floor(wy), 5);
      }
      case 'tiles': {
        const fx = wx - Math.floor(wx), fy = wy - Math.floor(wy);
        if (fx < 0.06 || fy < 0.06) return 0.3;
        const h = G.hash2(Math.floor(wx), Math.floor(wy), 7);
        if (h > 0.85) {
          const dx = fx - 0.5, dy = fy - 0.5;
          if (dx * dx + dy * dy < 0.06) return 1.0;
        }
        return 0.6 + 0.25 * h;
      }
      case 'marble': {
        const c = (Math.floor(wx * 0.5) + Math.floor(wy * 0.5)) & 1;
        const v = Math.sin(wx * 3 + Math.sin(wy * 2.1) * 2);
        return (c ? 0.85 : 0.5) + 0.12 * v;
      }
      case 'paper': {
        const fy = wy * 2 - Math.floor(wy * 2);
        if (fy < 0.04) return 0.82;
        return G.hash2(Math.floor(wx * 9), Math.floor(wy * 9), 2) > 0.985 ? 0.3 : 0.97;
      }
    }
    return 0.6;
  }

  function ceilPattern(pat, wx, wy) {
    switch (pat) {
      case 'beams': {
        const f = wx * 0.5 - Math.floor(wx * 0.5);
        return f < 0.14 ? 1.35 : 0.55;
      }
      case 'vault': {
        const f = (wx + wy) * 0.35 - Math.floor((wx + wy) * 0.35), g = (wx - wy) * 0.35 - Math.floor((wx - wy) * 0.35);
        return f < 0.06 || g < 0.06 ? 1.3 : 0.5;
      }
      case 'drip': {
        return G.hash2(Math.floor(wx * 4), Math.floor(wy * 4), 9) > 0.92 ? 1.3 : 0.55;
      }
    }
    return 0.6;
  }

  // The sky beneath the world. Returns rgb into out, and glow.
  function skyColor(kind, az, el, time, out, boss) {
    if (kind === 'sea') {
      const c = Math.abs(Math.sin(az * 9 + time * 0.6 + Math.sin(el * 11 - time)) * Math.sin(el * 17 - time * 0.4 + Math.cos(az * 7)));
      const k = c > 0.82 ? 1 : c * 0.35;
      out[0] = 0.04 + 0.2 * k;
      out[1] = 0.18 + 0.5 * k + el * 0.1;
      out[2] = 0.2 + 0.45 * k + el * 0.15;
      return k > 0.9 ? 0.6 : 0;
    }
    const inv = kind === 'void';
    // stars
    const sa = Math.floor(az * 160), se = Math.floor(el * 160);
    const h = G.hash2(sa, se, 77);
    let star = h > 0.992 ? 0.6 + 0.4 * Math.sin(time * 3 + h * 99) : 0;
    // nebula
    const n = G.noise2(az * 2.2 + 10, el * 3.1, 5) * G.noise2(az * 5, el * 6 + time * 0.01, 9);
    let r, g, b;
    if (inv) {
      r = 0.92 - n * 0.25;
      g = 0.9 - n * 0.3;
      b = 0.86 - n * 0.3;
      if (star) { r = g = b = 0.1; star = 0; }
    } else {
      r = 0.02 + n * 0.35 + el * 0.02;
      g = 0.01 + n * 0.1;
      b = 0.05 + n * 0.45 + el * 0.04;
      r += star;
      g += star;
      b += star;
    }
    // the colossus: an eye-wheel larger than any building, always in the same part of the sky
    const az0 = -Math.PI / 2;
    const size = boss ? 0.95 : inv ? 0.75 : 0.42;
    const e0 = boss ? 0.55 : 0.68;
    const dxa = G.angleDiff(az0, az) / size, dye = (el - e0) / (size * 0.85);
    const rr = Math.sqrt(dxa * dxa + dye * dye);
    let glow = star > 0.5 ? 0.4 : 0;
    if (rr < 1.15) {
      const th = Math.atan2(dye, dxa);
      const ink = inv ? 0.05 : 1;
      if (rr > 0.96) {
        const seg = (th / G.TAU) * 12 + time * 0.02;
        if (seg - Math.floor(seg) < 0.75) {
          const k = inv ? 0 : 0.55;
          r = inv ? 0.08 : r * 0.3 + k;
          g = inv ? 0.02 : g * 0.3 + k * 0.4;
          b = inv ? 0.02 : b * 0.3 + k * 0.9;
          glow = inv ? 0 : 0.5;
        }
      } else if (rr > 0.42) {
        const sp = 0.5 + 0.5 * Math.sin(th * 26 + time * 0.25 + rr * 6);
        const k = sp * (1 - (rr - 0.42) * 0.6);
        if (inv) {
          r = g = b = 0.9 - k * 0.85;
          r += k * 0.2;
        } else {
          r = 0.15 + k * 0.75 * ink;
          g = 0.05 + k * 0.3;
          b = 0.25 + k * 0.6;
          glow = k * 0.35;
        }
      } else {
        // the pupil, a slot of absence
        const open = boss ? 0.9 : 0.55;
        const pw = 0.1 * open + 0.03, px = dxa / pw, py = dye / 0.4;
        if (px * px + py * py < 1) {
          r = g = b = 0;
        } else {
          r = inv ? 0.75 : 0.35;
          g = inv ? 0.7 : 0.08;
          b = inv ? 0.68 : 0.2;
          glow = inv ? 0 : 0.2;
        }
      }
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
    return glow;
  }

  // ---- main world render into the sample buffer ----
  R.renderWorld = function (game) {
    const L = game.level, st = L.st, P = game.player, cam = R.cam;
    const W = L.w, H = L.h, tiles = L.tiles, flags = L.flags, plink = L.plink, portals = L.portals, seen = L.seen;
    const time = game.time, frame = game.frame;
    const px = cam.x, py = cam.y, dirX = cam.dirX, dirY = cam.dirY, plX = cam.plX, plY = cam.plY;
    const camZ = cam.z, Hc = st.ceilH, hz = cam.hz, projY = cam.projY;
    const fogR = st.fog[0], fogG = st.fog[1], fogB = st.fog[2];
    const amb = st.ambient;
    const lampOn = P.lanternOn ? 1 : 0;
    const lampR = P.lampRadius();
    const flick = 0.92 + 0.08 * Math.sin(time * 13.1) * Math.sin(time * 7.7 + 1.3);
    const lampI = lampOn * flick * 1.15;
    for (let i = 0; i < 512; i++) {
      const d = i / 8;
      const q = d / lampR;
      lampLUT[i] = lampI * Math.max(0, 1 - q * q) * (1 / (1 + d * 0.15)) + (d < 2 ? (0.1 * (2 - d)) / 2 : 0);
      fogLUT[i] = Math.exp(-d * st.fogD);
    }
    const lcR = st.lamp[0], lcG = st.lamp[1], lcB = st.lamp[2];
    const dyn = game.dynLights;
    const nd = dyn.length;
    const warp = game.fx.wallWarp;
    const secretVis = L.secretOpen;
    const skyKind = st.sky || 'cosmos';
    const bossSky = !!(L.arena && st.id === 4);
    const pfloor = st.floorPat, pceil = st.ceilPat;
    const fcol = st.floor, ccol = st.ceil;

    // per-row distances
    for (let y = 0; y < SH; y++) {
      const dy = y + 0.5 - hz;
      rowDist[y] = dy > 0 ? (camZ * projY) / dy : dy < 0 ? ((Hc - camZ) * projY) / -dy : 1e9;
    }
    R.offsets.length = 0;
    R.offsets.push(0, 0);
    let skyCount = 0;

    for (let x = 0; x < SW; x++) {
      const camX = (2 * (x + 0.5)) / SW - 1;
      const rdx = dirX + plX * camX, rdy = dirY + plY * camX;
      const rayLen = Math.sqrt(rdx * rdx + rdy * rdy);
      cRayLen[x] = rayLen;
      // DDA with portals
      let mx = Math.floor(px), my = Math.floor(py);
      const ddx = Math.abs(1 / (rdx || 1e-9)), ddy = Math.abs(1 / (rdy || 1e-9));
      const sx = rdx > 0 ? 1 : -1, sy = rdy > 0 ? 1 : -1;
      let sdx = (rdx > 0 ? mx + 1 - px : px - mx) * ddx;
      let sdy = (rdy > 0 ? my + 1 - py : py - my) * ddy;
      let t = 0, side = 0, offX = 0, offY = 0, pn = 0, hitTile = -1;
      for (let step = 0; step < 160; step++) {
        let dir;
        if (sdx < sdy) {
          t = sdx;
          sdx += ddx;
          dir = sx > 0 ? 0 : 1;
          side = 0;
        } else {
          t = sdy;
          sdy += ddy;
          dir = sy > 0 ? 2 : 3;
          side = 1;
        }
        let nx = mx + (side === 0 ? sx : 0), ny = my + (side === 1 ? sy : 0);
        if (mx >= 0 && my >= 0 && mx < W && my < H) {
          const pid = plink[(my * W + mx) * 4 + dir];
          if (pid >= 0) {
            const p = portals[pid];
            nx += p.ox;
            ny += p.oy;
            offX += p.ox;
            offY += p.oy;
            if (pn < K) {
              cPT[x * K + pn] = t;
              cPOX[x * K + pn] = offX;
              cPOY[x * K + pn] = offY;
              pn++;
              let found = false;
              for (let o = 0; o < R.offsets.length; o += 2) if (R.offsets[o] === offX && R.offsets[o + 1] === offY) found = true;
              if (!found && R.offsets.length < 16) R.offsets.push(offX, offY);
            }
          }
        }
        mx = nx;
        my = ny;
        if (mx < 0 || my < 0 || mx >= W || my >= H) {
          hitTile = -1;
          break;
        }
        const ti = my * W + mx;
        if (t < 18) {
          flags[ti] |= F.SEEN;
          seen[ti] = frame;
        }
        if (tiles[ti] > 0) {
          hitTile = ti;
          break;
        }
        if (t > 60) break;
      }
      if (t < 0.02) t = 0.02;
      cPN[x] = pn;
      zbuf[x] = t;
      cTile[x] = hitTile;
      cSide[x] = side;
      const hitX = px + offX + t * rdx, hitY = py + offY + t * rdy;
      let u = side === 0 ? hitY - Math.floor(hitY) : hitX - Math.floor(hitX);
      if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) u = 1 - u;
      cU[x] = u;
      let wob = 0;
      if (warp > 0) wob = Math.sin(x * 0.045 + time * 1.7) * warp * (projY / t) * 0.12;
      const top = hz - ((Hc - camZ) * projY) / t + wob;
      const bot = hz + (camZ * projY) / t - wob;
      cTop[x] = top;
      cBot[x] = bot;
      // wall lighting for this column
      const wd = t * rayLen;
      const wdi = Math.min(511, (wd * 8) | 0);
      L.light(hitX - rdx * 0.02, hitY - rdy * 0.02, lt);
      let wlR = lt[0] + lampLUT[wdi] * lcR, wlG = lt[1] + lampLUT[wdi] * lcG, wlB = lt[2] + lampLUT[wdi] * lcB;
      for (let k = 0; k < nd; k++) {
        const Lg = dyn[k];
        const ddx2 = hitX - Lg.x, ddy2 = hitY - Lg.y;
        const d2 = ddx2 * ddx2 + ddy2 * ddy2, r2 = Lg.rad * Lg.rad;
        if (d2 < r2) {
          const f = (1 - d2 / r2) * Lg.i;
          wlR += Lg.r * f * f;
          wlG += Lg.g * f * f;
          wlB += Lg.b * f * f;
        }
      }
      const sideK = side ? 0.74 : 1.0;
      const wfog = fogLUT[wdi];
      const mat = hitTile >= 0 ? tiles[hitTile] : 0;
      const wc = (mat && st.wall[mat]) || st.wall[st.mats[0]] || [0.5, 0.5, 0.5];
      const th = hitTile >= 0 ? hitTile & 1023 : 0;
      const secret = hitTile >= 0 && flags[hitTile] & F.SECRET;
      const yTop = Math.max(0, Math.floor(top)), yBot = Math.min(SH, Math.ceil(bot));
      let lastLm = -9, lmR = 0, lmG = 0, lmB = 0;

      for (let y = 0; y < SH; y++) {
        const i = y * SW + x;
        sGl[i] = 0;
        sE[i] = -1;
        if (y >= yTop && y < yBot && y + 0.5 >= top && y + 0.5 < bot) {
          // ---- wall ----
          if (hitTile < 0) {
            sR[i] = fogR;
            sG[i] = fogG;
            sB[i] = fogB;
            sD[i] = 999;
            sM[i] = MAT_WALL;
            continue;
          }
          const z = camZ + ((hz - (y + 0.5)) * t) / projY;
          const p = wallPattern(mat, u, z, th, time, lt);
          let r = wc[0] * p * lt[0] * wlR * sideK, g = wc[1] * p * lt[1] * wlG * sideK, b = wc[2] * p * lt[2] * wlB * sideK;
          if (secret && secretVis) {
            const s = 0.5 + 0.5 * Math.sin(time * 4 + y * 0.3 + x * 0.1);
            r += 0.35 * s;
            g += 0.1 * s;
            b += 0.6 * s;
            sGl[i] = 0.4 * s;
          }
          sR[i] = fogR + (r - fogR) * wfog;
          sG[i] = fogG + (g - fogG) * wfog;
          sB[i] = fogB + (b - fogB) * wfog;
          sD[i] = t;
          sM[i] = MAT_WALL;
          continue;
        }
        // ---- floor / ceiling ----
        const isFloor = y + 0.5 > hz;
        const rd = rowDist[y];
        let ox = 0, oy = 0;
        if (pn) {
          for (let k = 0; k < pn; k++) {
            if (rd > cPT[x * K + k]) {
              ox = cPOX[x * K + k];
              oy = cPOY[x * K + k];
            } else break;
          }
        }
        const wx = px + rdx * rd + ox, wy = py + rdy * rd + oy;
        const tx = Math.floor(wx), ty = Math.floor(wy);
        const ti = tx >= 0 && ty >= 0 && tx < W && ty < H ? ty * W + tx : -1;
        const fl = ti >= 0 ? flags[ti] : 0;
        const dist = rd * rayLen;
        const di = Math.min(511, (dist * 8) | 0);
        if (!isFloor && fl & F.SKY) {
          const az = Math.atan2(rdy, rdx);
          const el = (hz - (y + 0.5)) / (SH * 0.5);
          sGl[i] = skyColor(skyKind, az, el, time, lt, bossSky);
          sR[i] = lt[0];
          sG[i] = lt[1];
          sB[i] = lt[2];
          sD[i] = 900;
          sM[i] = MAT_SKY;
          skyCount++;
          continue;
        }
        let ar, ag, ab, m;
        if (isFloor) {
          if (fl & F.WATER) {
            const wv = 0.55 + 0.25 * Math.sin(wx * 2.7 + time * 1.6 + Math.sin(wy * 2.2 + time)) + 0.2 * Math.sin(wy * 5.3 - time * 2.1);
            ar = 0.05 * wv;
            ag = 0.32 * wv;
            ab = 0.36 * wv;
            m = MAT_WATER;
          } else {
            const p = floorPattern(pfloor, wx, wy, time);
            ar = fcol[0] * p;
            ag = fcol[1] * p;
            ab = fcol[2] * p;
            m = MAT_FLOOR;
          }
        } else {
          const p = ceilPattern(pceil, wx, wy);
          ar = ccol[0] * p;
          ag = ccol[1] * p;
          ab = ccol[2] * p;
          m = MAT_CEIL;
        }
        let lr, lg, lb;
        if (ti < 0) {
          lr = amb[0];
          lg = amb[1];
          lb = amb[2];
        } else if ((y & 1) && lastLm === y - 1) {
          lr = lmR;
          lg = lmG;
          lb = lmB;
        } else {
          L.light(wx, wy, lt);
          lr = lmR = lt[0];
          lg = lmG = lt[1];
          lb = lmB = lt[2];
          lastLm = y;
        }
        const lp = lampLUT[di];
        lr += lp * lcR;
        lg += lp * lcG;
        lb += lp * lcB;
        for (let k = 0; k < nd; k++) {
          const Lg = dyn[k];
          const ex = wx - Lg.x, ey = wy - Lg.y;
          const d2 = ex * ex + ey * ey, r2 = Lg.rad * Lg.rad;
          if (d2 < r2) {
            const f = (1 - d2 / r2) * Lg.i;
            lr += Lg.r * f * f;
            lg += Lg.g * f * f;
            lb += Lg.b * f * f;
          }
        }
        const fg = fogLUT[di];
        sR[i] = fogR + (ar * lr - fogR) * fg;
        sG[i] = fogG + (ag * lg - fogG) * fg;
        sB[i] = fogB + (ab * lb - fogB) * fg;
        sD[i] = rd;
        sM[i] = m;
      }
    }
    R.skyFraction = skyCount / (SW * SH);
    // water reflections: mirror the wall in the same (rippled) column
    if (st.water > 0) {
      for (let y = 0; y < SH; y++) {
        const ripple = Math.round(Math.sin(y * 0.55 + time * 2.2) * 1.4);
        for (let x = 0; x < SW; x++) {
          const i = y * SW + x;
          if (sM[i] !== MAT_WATER) continue;
          const xr = G.clamp(x + ripple, 0, SW - 1);
          const ry = Math.floor(2 * cBot[xr] - y);
          if (ry < 0 || ry >= SH) continue;
          const j = ry * SW + xr;
          if (sM[j] !== MAT_WALL) continue;
          sR[i] += sR[j] * 0.45;
          sG[i] += sG[j] * 0.5;
          sB[i] += sB[j] * 0.5;
          if (G.hash2(x, y, (time * 6) | 0) > 0.985) {
            sR[i] += 0.3;
            sG[i] += 0.4;
            sB[i] += 0.4;
            sGl[i] = 0.3;
          }
        }
      }
    }
    renderSprites(game);
  };

  // ---- sprites ----
  const prj = { d: 0, sx: 0, sy: 0, cx: 0, cy: 0, camX: 0 };
  function renderSprites(game) {
    const cam = R.cam, L = game.level, st = L.st, P = game.player;
    const list = R.sprites;
    list.length = 0;
    const offs = R.offsets;
    for (const e of game.ents) {
      if (!e.alive || e.hidden) continue;
      e.seen = false;
      e.onScreen = false;
      if (e.isPlayer && !game.thirdPerson && offs.length <= 2) continue;
      for (let o = 0; o < offs.length; o += 2) {
        const ox = offs[o], oy = offs[o + 1];
        if (e.isPlayer && !game.thirdPerson && ox === 0 && oy === 0) continue;
        R.project(e.x - ox, e.y - oy, e.z, prj);
        if (prj.d <= 0.15 || prj.d > 40) continue;
        const halfW = ((e.w * cam.projX) / prj.d) * 0.5;
        if (prj.sx + halfW < 0 || prj.sx - halfW > SW) continue;
        list.push({ e, ox, oy, d: prj.d, sx: prj.sx, sy: prj.sy, camX: prj.camX, halfW });
      }
    }
    list.sort((a, b) => b.d - a.d);
    const lampR = P.lampRadius();
    const lampI = P.lanternOn ? 1.1 : 0;
    const time = game.time;
    for (let si = 0; si < list.length; si++) {
      const s = list[si], e = s.e, def = e.def;
      if (s.ox === 0 && s.oy === 0) {
        e.onScreen = true;
        e.camX = s.camX;
        e.depth = s.d;
      }
      if (def.visible && !def.visible(e, s, game)) continue;
      const shape = def.shape;
      if (!shape) continue;
      // light at the entity
      L.light(e.x, e.y, lt);
      const dist = Math.hypot(e.x - P.x, e.y - P.y);
      const q = dist / lampR;
      const lp = lampI * Math.max(0, 1 - q * q) + 0.12;
      let lr = lt[0] + lp * st.lamp[0], lg = lt[1] + lp * st.lamp[1], lb = lt[2] + lp * st.lamp[2];
      for (const Lg of game.dynLights) {
        const d2 = (e.x - Lg.x) ** 2 + (e.y - Lg.y) ** 2, r2 = Lg.rad * Lg.rad;
        if (d2 < r2) {
          const f = (1 - d2 / r2) * Lg.i;
          lr += Lg.r * f * f;
          lg += Lg.g * f * f;
          lb += Lg.b * f * f;
        }
      }
      const minL = def.minLight || 0.32;
      if (lr + lg + lb < minL * 3) {
        const k = (minL * 3) / Math.max(0.01, lr + lg + lb);
        lr *= k;
        lg *= k;
        lb *= k;
      }
      const fog = Math.exp(-s.d * st.fogD * 0.8);
      const fogR = st.fog[0], fogG = st.fog[1], fogB = st.fog[2];
      const col = e.col, emit = e.emit || col;
      const flash = e.flash > 0;
      const spH = (e.h * R.cam.projY) / s.d;
      const bottom = s.sy;
      const top = bottom - spH;
      const x0 = Math.max(0, Math.floor(s.sx - s.halfW)), x1 = Math.min(SW - 1, Math.ceil(s.sx + s.halfW));
      const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(SH - 1, Math.ceil(bottom));
      for (let x = x0; x <= x1; x++) {
        // depth & portal-segment test
        if (s.d >= zbuf[x]) continue;
        const pn = cPN[x];
        if (pn) {
          let sox = 0, soy = 0;
          for (let k = 0; k < pn; k++) {
            if (s.d > cPT[x * K + k]) {
              sox = cPOX[x * K + k];
              soy = cPOY[x * K + k];
            } else break;
          }
          if (sox !== s.ox || soy !== s.oy) continue;
        } else if (s.ox !== 0 || s.oy !== 0) continue;
        const u = (x + 0.5 - s.sx) / s.halfW;
        for (let y = y0; y <= y1; y++) {
          const i = y * SW + x;
          if (sD[i] <= s.d && sM[i] === MAT_ENT) continue;
          const v = (y + 0.5 - top) / spH;
          const val = shape(u, v, e, time);
          if (val <= 0) continue;
          let r, g, b, gl = 0;
          if (flash) {
            r = g = b = 1.2;
            gl = 0.3;
          } else if (val > 1) {
            const k = val - 1;
            r = emit[0] * (0.6 + k);
            g = emit[1] * (0.6 + k);
            b = emit[2] * (0.6 + k);
            gl = k * (def.glow || 0.8);
          } else {
            r = col[0] * val * lr;
            g = col[1] * val * lg;
            b = col[2] * val * lb;
          }
          sR[i] = fogR + (r - fogR) * fog;
          sG[i] = fogG + (g - fogG) * fog;
          sB[i] = fogB + (b - fogB) * fog;
          sD[i] = s.d;
          sM[i] = MAT_ENT;
          sE[i] = si;
          sGl[i] = gl;
          if (s.ox === 0 && s.oy === 0) e.seen = true;
        }
      }
    }
  }

  // ---- convert samples into glyph cells ----
  function put(D_, ci, g, r, gg, b, br, bg, bb, gl) {
    D_.glyph[ci] = g;
    const o = ci * 4;
    D_.fg[o] = r > 1 ? 255 : r < 0 ? 0 : (r * 255) | 0;
    D_.fg[o + 1] = gg > 1 ? 255 : gg < 0 ? 0 : (gg * 255) | 0;
    D_.fg[o + 2] = b > 1 ? 255 : b < 0 ? 0 : (b * 255) | 0;
    D_.fg[o + 3] = gl > 1 ? 255 : gl < 0 ? 0 : (gl * 255) | 0;
    D_.bg[o] = br > 1 ? 255 : br < 0 ? 0 : (br * 255) | 0;
    D_.bg[o + 1] = bg > 1 ? 255 : bg < 0 ? 0 : (bg * 255) | 0;
    D_.bg[o + 2] = bb > 1 ? 255 : bb < 0 ? 0 : (bb * 255) | 0;
    D_.bg[o + 3] = 255;
  }
  R.put = put;

  const MIXED = ['ascii', 'blocks', 'braille', 'box', 'asciiFine', 'sigilB'];
  R.toCells = function (game, DSP) {
    const L = game.level, st = L.st, sets = G.Glyphs.sets, cam = R.cam, P = game.player;
    const time = game.time;
    const ink = st.ink;
    const corrupt = game.fx.corrupt;
    const ctick = Math.floor(time * 3);
    const alien = sets.sigilB, alienA = sets.sigilA;
    const collapse = game.fx.collapse || 0;
    const setWall = sets[st.wallSet] || sets.ascii, setFloor = sets[st.floorSet] || sets.ascii, setCeil = sets[st.ceilSet] || sets.ascii;
    const setFar = sets[st.farSet] || sets.braille, setSky = sets[st.skySet] || sets.braille;
    const mixed = st.wallSet === 'mixed';
    const W = L.w;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const ci = cy * cols + cx;
        const s0 = cy * 4 * SW + cx * 2;
        let entN = 0, entMask = 0, wallN = 0, skyN = 0, flN = 0, ceN = 0;
        let minL = 1e9, maxL = -1, sr = 0, sg = 0, sb = 0, er = 0, eg = 0, eb = 0, dmin = 1e9, gl = 0, ent = -1;
        for (let k = 0; k < 8; k++) {
          const i = s0 + (k >> 1) * SW + (k & 1);
          const m = sM[i];
          const r = sR[i], g = sG[i], b = sB[i];
          const Lm = 0.3 * r + 0.59 * g + 0.11 * b;
          tmpL[k] = Lm;
          if (Lm < minL) minL = Lm;
          if (Lm > maxL) maxL = Lm;
          sr += r;
          sg += g;
          sb += b;
          if (sD[i] < dmin) dmin = sD[i];
          if (sGl[i] > gl) gl = sGl[i];
          if (m === MAT_ENT) {
            entN++;
            entMask |= 1 << k;
            er += r;
            eg += g;
            eb += b;
            ent = sE[i];
          } else if (m === MAT_WALL) wallN++;
          else if (m === MAT_SKY) skyN++;
          else if (m === MAT_FLOOR || m === MAT_WATER) flN++;
          else ceN++;
        }
        cellDepth[ci] = dmin;
        // ---------- creatures ----------
        if (entN >= 1 && ent >= 0) {
          const spr = R.sprites[ent];
          const e = spr.e, set = sets[e.def.set || 'sigilA'] || alien;
          er /= entN;
          eg /= entN;
          eb /= entN;
          const el = 0.3 * er + 0.59 * eg + 0.11 * eb;
          let g;
          let fr = er, fg2 = eg, fb = eb, br, bgc, bb;
          if (entMask === 255) {
            if (maxL - minL > 0.18 && maxL - minL > maxL * 0.35) {
              const mid = (maxL + minL) * 0.5;
              let mask = 0, on = 0, ar = 0, ag = 0, ab = 0, dr = 0, dg = 0, db = 0;
              for (let k = 0; k < 8; k++) {
                const i = s0 + (k >> 1) * SW + (k & 1);
                if (tmpL[k] > mid) {
                  mask |= 1 << k;
                  on++;
                  ar += sR[i];
                  ag += sG[i];
                  ab += sB[i];
                } else {
                  dr += sR[i];
                  dg += sG[i];
                  db += sB[i];
                }
              }
              g = set.lut[mask];
              fr = (ar / on) * 1.15;
              fg2 = (ag / on) * 1.15;
              fb = (ab / on) * 1.15;
              br = (dr / (8 - on)) * 0.7;
              bgc = (dg / (8 - on)) * 0.7;
              bb = (db / (8 - on)) * 0.7;
            } else {
              if (set.crawl) {
                const lvl = Math.min(5, Math.floor(Math.sqrt(Math.max(0, el)) * 6));
                const bucket = set.buckets[lvl];
                const crawl = e.def.crawl === false ? 0 : Math.floor(time * 7 + e.id * 3);
                g = bucket[Math.floor(G.hash2(cx + e.id * 31, cy, crawl) * bucket.length)] || set.ramp[set.ramp.length - 1];
              } else {
                const n = set.ramp.length;
                g = set.ramp[Math.max(1, Math.min(n - 1, Math.floor(Math.sqrt(Math.max(0, el)) * n * 1.1)))];
              }
              const k = 1.25;
              fr = er * k;
              fg2 = eg * k;
              fb = eb * k;
              br = er * 0.38;
              bgc = eg * 0.38;
              bb = eb * 0.38;
            }
          } else {
            g = set.lut[entMask];
            const nn = 8 - entN;
            br = ((sr - er * entN) / nn) * 0.35;
            bgc = ((sg - eg * entN) / nn) * 0.35;
            bb = ((sb - eb * entN) / nn) * 0.35;
            fr *= 1.25;
            fg2 *= 1.25;
            fb *= 1.25;
          }
          if (e.def.flicker && G.hash2(cx, cy, Math.floor(time * 20)) < e.def.flicker && entMask !== 255) g = 0;
          put(DSP, ci, g, fr, fg2, fb, br, bgc, bb, gl);
          cellKind[ci] = 2;
          continue;
        }
        cellKind[ci] = 1;
        sr *= 0.125;
        sg *= 0.125;
        sb *= 0.125;
        const avgL = 0.3 * sr + 0.59 * sg + 0.11 * sb;
        // ---------- darkness: the absence of text ----------
        if (!ink && maxL < 0.018) {
          put(DSP, ci, 0, 0, 0, 0, sr * 0.5, sg * 0.5, sb * 0.5, 0);
          continue;
        }
        // ---------- choose a style ----------
        let set;
        let wallTile = -1;
        if (skyN >= 4) set = setSky;
        else if (wallN >= 4) {
          wallTile = cTile[cx * 2];
          set = dmin > st.farDist ? setFar : setWall;
          if (mixed && wallTile >= 0) set = sets[MIXED[(G.hash2(wallTile, 0, 3) * MIXED.length) | 0]];
        } else if (dmin > st.farDist) set = setFar;
        else set = flN >= ceN ? setFloor : setCeil;
        if (!set) set = sets.ascii;
        let tint = 0;
        if (wallTile >= 0 && L.flags[wallTile] & F.SECRET && L.secretOpen) set = alienA;
        if (corrupt > 0 && G.hash2(cx >> 1, cy, ctick + ((cx * 7) >> 3)) < corrupt) {
          set = G.hash2(cx, cy, 5) > 0.5 ? alien : alienA;
          tint = 1;
        }
        if (collapse > 0 && G.hash2(cx, cy, 11) < collapse) set = sets.braille;
        // ---------- inscribed walls: the letters resolve as you approach ----------
        if (wallTile >= 0 && !tint && L.text[wallTile] && dmin < 9) {
          const col = cx * 2;
          const t = zbuf[col];
          const lettersU = 5;
          const cellsPerLetter = (cam.projX / t) / lettersU / 2;
          if (cellsPerLetter > 0.75) {
            const u = cU[col];
            const z = cam.z + ((cam.hz - (cy * 4 + 2)) * t) / cam.projY;
            const lv = z * 7;
            const lu = u * lettersU;
            let show = true;
            if (cellsPerLetter > 1.7) {
              const halfU = 0.5 / cellsPerLetter;
              const halfV = (0.5 * 7 * t) / cam.projY * 4 * 0.5;
              show = Math.abs(lu - Math.floor(lu) - 0.5) < halfU && Math.abs(lv - Math.floor(lv) - 0.5) < Math.max(0.12, halfV);
            }
            if (show && z > 0.05 && z < st.ceilH - 0.05) {
              const txt = L.text[wallTile];
              const idx = (Math.floor(lv) * lettersU + Math.floor(lu) + (wallTile % 7) * 13) % txt.length;
              const chr = txt.charAt(idx);
              if (chr !== ' ') {
                const glyph = G.Glyphs.ch(chr);
                if (ink) put(DSP, ci, glyph, sr * 0.15, sg * 0.12, sb * 0.12, sr, sg, sb, 0);
                else {
                  const k = 1.9;
                  put(DSP, ci, glyph, sr * k + 0.05, sg * k + 0.035, sb * k * 0.8, sr * 0.45, sg * 0.45, sb * 0.45, 0.05);
                }
                continue;
              }
            }
          }
        }
        const range = maxL - minL;
        let g, fr, fg2, fb, br, bgc, bb;
        if (range > 0.035 && range > maxL * 0.3) {
          const mid = (maxL + minL) * 0.5;
          let mask = 0, on = 0, ar = 0, ag = 0, ab = 0, dr = 0, dg = 0, db = 0;
          for (let k = 0; k < 8; k++) {
            const i = s0 + (k >> 1) * SW + (k & 1);
            if (tmpL[k] > mid) {
              mask |= 1 << k;
              on++;
              ar += sR[i];
              ag += sG[i];
              ab += sB[i];
            } else {
              dr += sR[i];
              dg += sG[i];
              db += sB[i];
            }
          }
          if (ink) {
            // ink mode: the dark part is the glyph
            g = set.lut[255 & ~mask];
            fr = (dr / (8 - on)) * 0.6;
            fg2 = (dg / (8 - on)) * 0.6;
            fb = (db / (8 - on)) * 0.6;
            br = ar / on;
            bgc = ag / on;
            bb = ab / on;
          } else {
            g = set.lut[mask];
            fr = (ar / on) * set.fgEdge;
            fg2 = (ag / on) * set.fgEdge;
            fb = (ab / on) * set.fgEdge;
            br = on < 8 ? (dr / (8 - on)) * set.bgEdge : 0;
            bgc = on < 8 ? (dg / (8 - on)) * set.bgEdge : 0;
            bb = on < 8 ? (db / (8 - on)) * set.bgEdge : 0;
          }
        } else {
          const n = set.ramp.length;
          if (ink) {
            const dark = 1 - avgL;
            const idx = Math.min(n - 1, Math.floor(Math.pow(Math.max(0, dark - 0.08), 1.25) * n * 1.25));
            g = set.ramp[idx];
            fr = sr * 0.25;
            fg2 = sg * 0.22;
            fb = sb * 0.22;
            br = sr;
            bgc = sg;
            bb = sb;
          } else {
            const idx = Math.min(n - 1, Math.floor(Math.sqrt(avgL) * n * 1.05));
            g = set.ramp[idx];
            fr = sr * set.fgFlat;
            fg2 = sg * set.fgFlat;
            fb = sb * set.fgFlat;
            br = sr * set.bgFlat;
            bgc = sg * set.bgFlat;
            bb = sb * set.bgFlat;
          }
        }
        if (tint) {
          const k = 0.5 + 0.5 * Math.sin(time * 2 + cx * 0.1);
          fr = fr * 0.6 + 0.35 * k;
          fg2 *= 0.5;
          fb = fb * 0.7 + 0.4 * k;
        }
        put(DSP, ci, g, fr, fg2, fb, br, bgc, bb, gl);
      }
    }
  };

  // Title backdrop: the colossus in the sky over a skyline of spires.
  R.skyColor = skyColor;
  R.backdrop = function (game, kind, fakeL) {
    const t = game.time;
    cTile.fill(-1);
    for (let x = 0; x < SW; x++) {
      const az = -Math.PI / 2 + ((x + 0.5) / SW - 0.5) * 1.7;
      const n1 = G.noise2(x * 0.025, 0, 4);
      const sp = G.hash2(x >> 3, 0, 9);
      const hgt = 0.08 + n1 * 0.14 + (sp > 0.9 ? 0.3 * G.hash2(x >> 3, 1, 9) * (1 - Math.abs(((x & 7) - 3.5) / 4)) : 0);
      for (let y = 0; y < SH; y++) {
        const i = y * SW + x;
        const el = 1.05 - ((y + 0.5) / SH) * 1.25;
        sE[i] = -1;
        if (el < -0.2 + hgt) {
          const win = G.hash2(x >> 1, y >> 2, 21) > 0.985 && el < -0.25 + hgt;
          sR[i] = win ? 0.9 : 0.025;
          sG[i] = win ? 0.55 : 0.015;
          sB[i] = win ? 0.25 : 0.045;
          sGl[i] = win ? 0.6 : 0;
          sD[i] = 5;
          sM[i] = MAT_WALL;
        } else {
          sGl[i] = skyColor(kind, az, el, t, lt, false);
          sR[i] = lt[0];
          sG[i] = lt[1];
          sB[i] = lt[2];
          sD[i] = 900;
          sM[i] = MAT_SKY;
        }
      }
    }
    R.sprites.length = 0;
    R.toCells({ level: fakeL, time: t, fx: { corrupt: 0, collapse: 0 }, player: null }, game.dsp);
  };

  // Particles: world-space glyphs, depth tested against the cell grid.
  R.drawParticles = function (game, DSP) {
    const cam = R.cam;
    for (const p of game.parts) {
      R.project(p.x, p.y, p.z, prj);
      if (prj.d <= 0.1) continue;
      const cx = Math.floor(prj.cx), cy = Math.floor(prj.cy);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
      const ci = cy * cols + cx;
      if (!p.noDepth && cellDepth[ci] < prj.d - 0.05) continue;
      const a = p.life / p.max;
      const k = p.fade === false ? 1 : Math.min(1, a * 1.5);
      const o = ci * 4;
      DSP.glyph[ci] = p.g;
      DSP.fg[o] = Math.min(255, p.r * 255 * k) | 0;
      DSP.fg[o + 1] = Math.min(255, p.gr * 255 * k) | 0;
      DSP.fg[o + 2] = Math.min(255, p.b * 255 * k) | 0;
      DSP.fg[o + 3] = Math.min(255, (p.glow || 0) * 255 * k) | 0;
      if (p.bg) {
        DSP.bg[o] = DSP.bg[o] >> 1;
        DSP.bg[o + 1] = DSP.bg[o + 1] >> 1;
        DSP.bg[o + 2] = DSP.bg[o + 2] >> 1;
      }
    }
    void cam;
  };

  // Screen-space circle effects (the Unspoken Word's erasure).
  R.drawVoids = function (game, DSP) {
    for (const v of game.voids) {
      R.project(v.x, v.y, 0.5, prj);
      if (prj.d <= 0.2) continue;
      const k = 1 - v.life / v.max;
      const rad = (v.r * R.cam.projX * (0.4 + k * 0.8)) / prj.d / 2;
      const ry = rad * (DSP.cellW / DSP.cellH) * 1.0;
      const x0 = Math.max(0, Math.floor(prj.cx - rad - 1)), x1 = Math.min(cols - 1, Math.ceil(prj.cx + rad + 1));
      const y0 = Math.max(0, Math.floor(prj.cy - ry - 1)), y1 = Math.min(rows - 1, Math.ceil(prj.cy + ry + 1));
      const ink = game.level.st.ink;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dx = (x + 0.5 - prj.cx) / rad, dy = (y + 0.5 - prj.cy) / ry;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 1.08) continue;
          const ci = y * cols + x;
          if (d > 0.9) put(DSP, ci, G.Glyphs.id('sa:' + ((x * 7 + y * 3 + ((game.time * 20) | 0)) % 96)), 0.9, 0.5, 1, 0.1, 0, 0.15, 1);
          else if (ink) put(DSP, ci, 0, 0, 0, 0, 0.02, 0.02, 0.02, 0);
          else put(DSP, ci, 0, 0, 0, 0, 0.92, 0.9, 0.95, 0.4);
        }
    }
  };
})();
