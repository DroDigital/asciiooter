'use strict';
// Every sound is synthesized at runtime with WebAudio: no audio files. Effects are short
// node graphs, spatialized by angle and distance from the listener. The ambience is a set of
// long-lived voices (drone, dissonance, wind, pulse, heartbeat, awe pad, whispers) whose levels
// follow the game state.
(function () {
  const G = window.G;
  const A = (G.Audio = { ctx: null, ok: false, vol: { master: 0.8, music: 0.7, sfx: 0.9 }, lx: 0, ly: 0, la: 0, voices: 0, loops: {} });

  function makeNoise(c, secs) {
    const b = c.createBuffer(1, c.sampleRate * secs, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function makeImpulse(c, secs, decay) {
    const len = c.sampleRate * secs;
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  A.unlock = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      A.ctx = new AC();
    } catch (e) {
      return;
    }
    const c = A.ctx;
    A.comp = c.createDynamicsCompressor();
    A.comp.threshold.value = -16;
    A.comp.ratio.value = 5;
    A.comp.connect(c.destination);
    A.master = c.createGain();
    A.master.connect(A.comp);
    A.sfx = c.createGain();
    A.sfx.connect(A.master);
    A.music = c.createGain();
    A.music.connect(A.master);
    A.verb = c.createConvolver();
    A.verb.buffer = makeImpulse(c, 3.2, 2.6);
    A.verbOut = c.createGain();
    A.verbOut.gain.value = 0.5;
    A.verb.connect(A.verbOut);
    A.verbOut.connect(A.master);
    A.noise = makeNoise(c, 2);
    A.ok = true;
    A.applyVolumes();
    startAmbience();
  };

  A.applyVolumes = function () {
    if (!A.ok) return;
    const t = A.ctx.currentTime;
    A.master.gain.setTargetAtTime(A.vol.master, t, 0.05);
    A.music.gain.setTargetAtTime(A.vol.music * 0.8, t, 0.05);
    A.sfx.gain.setTargetAtTime(A.vol.sfx, t, 0.05);
  };

  A.setListener = function (x, y, a) {
    A.lx = x;
    A.ly = y;
    A.la = a;
  };

  // Output chain for a one-shot: gain -> panner -> sfx (+ reverb send).
  function chain(opt, vol) {
    const c = A.ctx;
    let pan = 0, g = vol;
    if (opt && opt.x !== undefined) {
      const dx = opt.x - A.lx, dy = opt.y - A.ly;
      const d = Math.hypot(dx, dy);
      const rel = G.angleDiff(A.la, Math.atan2(dy, dx));
      pan = G.clamp(Math.sin(rel), -1, 1) * 0.85;
      g *= 1 / (1 + d * 0.22);
      if (Math.abs(rel) > Math.PI / 2) g *= 0.8;
    }
    if (opt && opt.vol !== undefined) g *= opt.vol;
    const gain = c.createGain();
    gain.gain.value = 0;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    gain.connect(p);
    p.connect(A.sfx);
    const send = c.createGain();
    send.gain.value = (opt && opt.verb) || 0.25;
    p.connect(send);
    send.connect(A.verb);
    return { gain, level: g };
  }
  function env(g, t, a, peak, d) {
    const p = Math.max(0.0002, peak);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(type, f0, f1, t, dur, dest) {
    const o = A.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  function noise(t, dur, dest) {
    const s = A.ctx.createBufferSource();
    s.buffer = A.noise;
    s.loop = true;
    s.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }
  function filt(type, f0, f1, q, t, dur, dest) {
    const f = A.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    f.connect(dest);
    return f;
  }

  // Sound recipes. Each receives (t, out-gain-node, level, opt).
  const SFX = {
    quill(t, o, L) {
      env(o, t, 0.002, L * 0.7, 0.09);
      noise(t, 0.1, filt('bandpass', 4200, 900, 1.2, t, 0.09, o));
      osc('square', 1100, 260, t, 0.07, filt('lowpass', 3000, 3000, 0.7, t, 0.1, o));
    },
    psalter(t, o, L) {
      env(o, t, 0.003, L * 1.1, 0.42);
      noise(t, 0.45, filt('lowpass', 5200, 260, 0.8, t, 0.4, o));
      osc('sine', 140, 38, t, 0.32, o);
    },
    litany(t, o, L, opt) {
      env(o, t, 0.004, L * 0.35, 0.09);
      const f = 330 * Math.pow(2, ((opt && opt.note) || 0) / 12);
      osc('triangle', f, f * 0.98, t, 0.1, o);
      noise(t, 0.03, filt('highpass', 5000, 5000, 1, t, 0.03, o));
    },
    word(t, o, L) {
      env(o, t, 0.25, L * 0.9, 0.5);
      osc('sine', 52, 30, t, 0.8, o);
      osc('sawtooth', 104, 60, t, 0.7, filt('lowpass', 400, 120, 2, t, 0.7, o));
    },
    boom(t, o, L) {
      env(o, t, 0.004, L * 1.3, 1.1);
      noise(t, 1.2, filt('lowpass', 2400, 90, 0.7, t, 1.1, o));
      osc('sine', 90, 24, t, 0.9, o);
    },
    palimpsestCharge(t, o, L) {
      env(o, t, 0.4, L * 0.4, 0.15);
      osc('sawtooth', 120, 900, t, 0.55, filt('bandpass', 800, 3000, 4, t, 0.55, o));
    },
    palimpsest(t, o, L) {
      env(o, t, 0.002, L * 1.2, 0.7);
      noise(t, 0.7, filt('highpass', 6000, 700, 0.9, t, 0.6, o));
      osc('square', 1800, 70, t, 0.5, filt('lowpass', 5000, 300, 1, t, 0.5, o));
    },
    hit(t, o, L) {
      env(o, t, 0.001, L * 0.45, 0.05);
      noise(t, 0.06, filt('highpass', 2500, 2500, 1, t, 0.05, o));
    },
    thud(t, o, L) {
      env(o, t, 0.002, L * 0.6, 0.12);
      osc('sine', 180, 60, t, 0.12, o);
    },
    kill(t, o, L) {
      env(o, t, 0.01, L * 0.6, 0.6);
      osc('triangle', 880, 110, t, 0.6, o);
      noise(t, 0.5, filt('bandpass', 1500, 300, 3, t, 0.5, o));
    },
    hurt(t, o, L) {
      env(o, t, 0.003, L * 1.0, 0.3);
      osc('sawtooth', 110, 45, t, 0.3, filt('lowpass', 900, 200, 3, t, 0.3, o));
      noise(t, 0.2, filt('lowpass', 1200, 200, 1, t, 0.2, o));
    },
    dash(t, o, L) {
      env(o, t, 0.02, L * 0.5, 0.25);
      noise(t, 0.3, filt('bandpass', 400, 2600, 2, t, 0.25, o));
    },
    step(t, o, L) {
      env(o, t, 0.002, L * 0.18, 0.06);
      noise(t, 0.07, filt('lowpass', 500, 200, 1, t, 0.06, o));
    },
    splash(t, o, L) {
      env(o, t, 0.005, L * 0.25, 0.18);
      noise(t, 0.2, filt('bandpass', 900, 2400, 2, t, 0.18, o));
    },
    pickup(t, o, L) {
      env(o, t, 0.005, L * 0.4, 0.25);
      osc('sine', 660, 660, t, 0.08, o);
      osc('sine', 990, 990, t + 0.07, 0.15, o);
    },
    relic(t, o, L) {
      env(o, t, 0.01, L * 0.5, 1.2);
      [0, 3, 7, 12, 15].forEach((n, i) => osc('triangle', 220 * Math.pow(2, n / 12), 220 * Math.pow(2, n / 12), t + i * 0.09, 0.9, o));
    },
    read(t, o, L) {
      env(o, t, 0.3, L * 0.45, 1.6);
      noise(t, 2, filt('bandpass', 700, 1600, 6, t, 1.8, o));
      osc('sine', 110, 104, t, 1.9, o);
    },
    brazier(t, o, L) {
      env(o, t, 0.05, L * 0.7, 0.9);
      noise(t, 1, filt('lowpass', 300, 3000, 1, t, 0.9, o));
    },
    descend(t, o, L) {
      env(o, t, 0.4, L * 0.8, 2.6);
      osc('sawtooth', 440, 30, t, 3, filt('lowpass', 2000, 100, 3, t, 3, o));
      osc('sine', 220, 20, t, 3, o);
    },
    death(t, o, L) {
      env(o, t, 0.05, L * 1, 3.5);
      osc('sawtooth', 70, 20, t, 3.6, filt('lowpass', 800, 60, 4, t, 3.6, o));
      noise(t, 3.6, filt('bandpass', 300, 60, 2, t, 3.6, o));
    },
    ui(t, o, L) {
      env(o, t, 0.002, L * 0.2, 0.05);
      osc('square', 880, 880, t, 0.05, filt('lowpass', 2500, 2500, 1, t, 0.05, o));
    },
    uiSelect(t, o, L) {
      env(o, t, 0.002, L * 0.3, 0.2);
      osc('triangle', 440, 880, t, 0.18, o);
    },
    deny(t, o, L) {
      env(o, t, 0.002, L * 0.3, 0.15);
      osc('square', 160, 120, t, 0.15, filt('lowpass', 900, 900, 1, t, 0.15, o));
    },
    crumble(t, o, L) {
      env(o, t, 0.005, L * 1.1, 1.2);
      noise(t, 1.3, filt('lowpass', 1800, 120, 0.8, t, 1.2, o));
      for (let i = 0; i < 6; i++) {
        const g2 = A.ctx.createGain();
        g2.connect(o);
        env(g2, t + i * 0.07 + Math.random() * 0.05, 0.002, 0.5, 0.08);
        noise(t + i * 0.07, 0.1, filt('bandpass', 600 + Math.random() * 1500, 600, 3, t, 0.1, g2));
      }
    },
    bell(t, o, L) {
      env(o, t, 0.005, L * 0.9, 2.6);
      [1, 2.76, 5.4, 8.93].forEach((r, i) => osc('sine', 196 * r, 196 * r * 0.995, t, 2.6 - i * 0.4, o));
    },
    beep(t, o, L) {
      env(o, t, 0.002, L * 0.4, 0.35);
      [0, 0.12, 0.24].forEach((d) => osc('square', 1600, 1600, t + d, 0.05, filt('lowpass', 3000, 3000, 1, t, 0.4, o)));
    },
    whoosh(t, o, L) {
      env(o, t, 0.1, L * 0.6, 0.35);
      noise(t, 0.5, filt('bandpass', 300, 1500, 1.5, t, 0.45, o));
    },
    howl(t, o, L) {
      env(o, t, 0.08, L * 0.5, 0.5);
      osc('sawtooth', 300, 700, t, 0.55, filt('bandpass', 900, 1300, 6, t, 0.55, o));
    },
    flap(t, o, L) {
      env(o, t, 0.01, L * 0.3, 0.12);
      noise(t, 0.15, filt('bandpass', 1200, 600, 2, t, 0.12, o));
    },
    ping(t, o, L) {
      env(o, t, 0.001, L * 0.5, 0.25);
      osc('sine', 2400, 2200, t, 0.25, o);
      osc('sine', 3700, 3500, t, 0.18, o);
    },
    fuse(t, o, L) {
      env(o, t, 0.01, L * 0.4, 0.45);
      noise(t, 0.5, filt('highpass', 4000, 6000, 1, t, 0.45, o));
    },
    // creatures
    groan(t, o, L) {
      env(o, t, 0.15, L * 0.5, 0.7);
      const f = filt('bandpass', 500, 300, 6, t, 0.8, o);
      osc('sawtooth', 85 + Math.random() * 30, 60, t, 0.85, f);
    },
    swipe(t, o, L) {
      env(o, t, 0.01, L * 0.5, 0.16);
      noise(t, 0.2, filt('bandpass', 1800, 500, 2, t, 0.16, o));
    },
    shriek(t, o, L) {
      env(o, t, 0.03, L * 0.5, 0.5);
      osc('sawtooth', 900, 1400, t, 0.5, filt('bandpass', 2400, 1800, 8, t, 0.5, o));
      osc('sawtooth', 950, 1300, t, 0.5, filt('bandpass', 1200, 900, 8, t, 0.5, o));
    },
    flutter(t, o, L) {
      env(o, t, 0.02, L * 0.25, 0.25);
      noise(t, 0.3, filt('highpass', 2000, 2000, 1, t, 0.3, o));
    },
    sing(t, o, L) {
      env(o, t, 0.4, L * 0.35, 0.6);
      [196, 233, 277].forEach((f) => osc('sawtooth', f, f * 1.02, t, 1, filt('bandpass', 800, 1100, 9, t, 1, o)));
    },
    note(t, o, L) {
      env(o, t, 0.01, L * 0.3, 0.3);
      osc('sine', 523, 500, t, 0.3, o);
    },
    roar(t, o, L) {
      env(o, t, 0.1, L * 1.0, 1.0);
      noise(t, 1.1, filt('lowpass', 600, 150, 2, t, 1, o));
      osc('sawtooth', 55, 40, t, 1.1, filt('lowpass', 500, 200, 1, t, 1, o));
    },
    click(t, o, L) {
      env(o, t, 0.001, L * 0.4, 0.04);
      osc('square', 2400, 2000, t, 0.03, o);
      osc('square', 2200, 1800, t + 0.06, 0.03, o);
    },
    bubble(t, o, L) {
      env(o, t, 0.01, L * 0.3, 0.15);
      osc('sine', 300, 900, t, 0.12, o);
    },
    redact(t, o, L) {
      env(o, t, 0.01, L * 0.8, 0.5);
      osc('square', 60, 58, t, 0.5, filt('lowpass', 1200, 1200, 1, t, 0.5, o));
      noise(t, 0.5, filt('bandpass', 3000, 3000, 2, t, 0.5, o));
    },
    seal(t, o, L) {
      env(o, t, 0.02, L * 0.9, 1.6);
      [110, 165, 220, 330].forEach((f) => osc('sine', f, f * 0.5, t, 1.7, o));
    },
  };

  A.play = function (name, opt) {
    if (!A.ok || A.voices > 48) return;
    const r = SFX[name];
    if (!r) return;
    const ch = chain(opt, 1);
    if (ch.level < 0.01) return;
    const t = A.ctx.currentTime + 0.005;
    r(t, ch.gain, ch.level, opt);
    A.voices++;
    setTimeout(() => {
      A.voices--;
      try {
        ch.gain.disconnect();
      } catch (e) {
        /* already gone */
      }
    }, 4000);
  };

  // ---- sustained loops (beam, gaze, choir) ----
  const LOOPS = {
    lance(c, out) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 3;
      f.connect(out);
      const a = c.createOscillator(), b = c.createOscillator();
      a.type = b.type = 'sawtooth';
      a.frequency.value = 220;
      b.frequency.value = 223.5;
      a.connect(f);
      b.connect(f);
      a.start();
      b.start();
      return [a, b];
    },
    gaze(c, out) {
      const a = c.createOscillator();
      a.type = 'sine';
      a.frequency.value = 1760;
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 6;
      lg.gain.value = 40;
      lfo.connect(lg);
      lg.connect(a.frequency);
      a.connect(out);
      a.start();
      lfo.start();
      return [a, lfo];
    },
    choir(c, out) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 5;
      f.connect(out);
      return [174.6, 207.7, 261.6, 277.2].map((fr) => {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = Math.random() * 20 - 10;
        o.connect(f);
        o.start();
        return o;
      });
    },
  };
  A.loop = function (name, vol, pan) {
    if (!A.ok) return;
    let L = A.loops[name];
    if (!L) {
      if (vol <= 0.001) return;
      const c = A.ctx;
      const g = c.createGain();
      g.gain.value = 0;
      const p = c.createStereoPanner();
      g.connect(p);
      p.connect(A.sfx);
      L = A.loops[name] = { g, p, nodes: LOOPS[name](c, g) };
    }
    const t = A.ctx.currentTime;
    L.g.gain.setTargetAtTime(Math.max(0, vol), t, 0.06);
    L.p.pan.setTargetAtTime(G.clamp(pan || 0, -1, 1), t, 0.06);
  };
  A.stopLoops = function () {
    for (const k in A.loops) A.loop(k, 0, 0);
  };

  // ---- ambience ----
  const amb = { level: 0, root: 55, luc: 1, threat: 0, danger: 0, awe: 0, water: 0, nextBeat: 0, nextHeart: 0, beatN: 0, whisperT: 2, menu: true };
  function startAmbience() {
    const c = A.ctx;
    const m = A.music;
    amb.bus = c.createGain();
    amb.bus.gain.value = 0;
    amb.bus.connect(m);
    const send = c.createGain();
    send.gain.value = 0.6;
    amb.bus.connect(send);
    send.connect(A.verb);
    amb.lp = c.createBiquadFilter();
    amb.lp.type = 'lowpass';
    amb.lp.frequency.value = 600;
    amb.lp.connect(amb.bus);
    const mk = (type, f, g) => {
      const o = c.createOscillator(), gg = c.createGain();
      o.type = type;
      o.frequency.value = f;
      gg.gain.value = g;
      o.connect(gg);
      gg.connect(amb.lp);
      o.start();
      return { o, g: gg };
    };
    amb.d1 = mk('sawtooth', 55, 0.12);
    amb.d2 = mk('sawtooth', 82.4, 0.07);
    amb.d3 = mk('triangle', 27.5, 0.25);
    amb.tri = mk('sawtooth', 77.8, 0);
    amb.d1.o.detune.value = -7;
    amb.d2.o.detune.value = 6;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.07;
    lg.gain.value = 260;
    lfo.connect(lg);
    lg.connect(amb.lp.frequency);
    lfo.start();
    // wind bed
    const ns = c.createBufferSource();
    ns.buffer = A.noise;
    ns.loop = true;
    amb.windF = c.createBiquadFilter();
    amb.windF.type = 'bandpass';
    amb.windF.frequency.value = 400;
    amb.windF.Q.value = 0.8;
    amb.windG = c.createGain();
    amb.windG.gain.value = 0.06;
    ns.connect(amb.windF);
    amb.windF.connect(amb.windG);
    amb.windG.connect(amb.bus);
    ns.start();
    const wl = c.createOscillator(), wlg = c.createGain();
    wl.frequency.value = 0.11;
    wlg.gain.value = 250;
    wl.connect(wlg);
    wlg.connect(amb.windF.frequency);
    wl.start();
    // awe pad
    amb.aweG = c.createGain();
    amb.aweG.gain.value = 0;
    amb.aweG.connect(amb.bus);
    amb.awe = [1, 1.5, 2, 2.52, 3].map((r) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = 220 * r;
      o.connect(amb.aweG);
      o.start();
      return { o, r };
    });
    amb.nextBeat = c.currentTime + 0.5;
    amb.nextHeart = c.currentTime + 0.5;
  }

  A.setStratum = function (root) {
    if (!A.ok) {
      amb.root = root;
      return;
    }
    amb.root = root;
    const t = A.ctx.currentTime;
    amb.d1.o.frequency.setTargetAtTime(root, t, 1.5);
    amb.d2.o.frequency.setTargetAtTime(root * 1.4983, t, 1.5);
    amb.d3.o.frequency.setTargetAtTime(root / 2, t, 1.5);
    amb.tri.o.frequency.setTargetAtTime(root * 1.4142, t, 1.5);
    for (const a of amb.awe) a.o.frequency.setTargetAtTime(root * 4 * a.r, t, 2);
  };

  function kick(t, lvl) {
    const c = A.ctx, g = c.createGain();
    g.connect(A.music);
    env(g, t, 0.003, lvl, 0.35);
    osc('sine', 95, 32, t, 0.35, g);
  }
  function tick(t, lvl) {
    const c = A.ctx, g = c.createGain();
    g.connect(A.music);
    env(g, t, 0.001, lvl, 0.04);
    noise(t, 0.05, filt('highpass', 7000, 7000, 1, t, 0.05, g));
  }
  function bass(t, lvl, f) {
    const c = A.ctx, g = c.createGain();
    g.connect(A.music);
    env(g, t, 0.01, lvl, 0.5);
    osc('sawtooth', f, f, t, 0.55, filt('lowpass', 420, 140, 4, t, 0.5, g));
  }
  function heart(t, lvl) {
    const c = A.ctx, g = c.createGain();
    g.connect(A.music);
    env(g, t, 0.01, lvl, 0.16);
    osc('sine', 60, 40, t, 0.18, g);
  }
  function whisper() {
    const c = A.ctx, t = c.currentTime;
    const g = c.createGain();
    const p = c.createStereoPanner();
    p.pan.value = Math.random() * 2 - 1;
    g.connect(p);
    p.connect(A.music);
    const dur = 0.5 + Math.random() * 1.1;
    env(g, t, dur * 0.4, 0.12 + 0.12 * (1 - amb.luc), dur * 0.6);
    const f1 = filt('bandpass', 500 + Math.random() * 600, 1200 + Math.random() * 1500, 9, t, dur, g);
    const f2 = filt('bandpass', 2400, 1800 + Math.random() * 900, 12, t, dur, g);
    noise(t, dur, f1);
    noise(t, dur, f2);
  }

  // Called every frame with the state of the world.
  A.update = function (dt, s) {
    if (!A.ok) return;
    const c = A.ctx, t = c.currentTime;
    amb.luc = s.luc;
    const target = s.menu ? 0.55 : 0.85;
    amb.bus.gain.setTargetAtTime(target, t, 0.6);
    amb.tri.g.gain.setTargetAtTime((1 - s.luc) * 0.11, t, 0.5);
    amb.windG.gain.setTargetAtTime(0.04 + (1 - s.luc) * 0.06, t, 0.5);
    amb.aweG.gain.setTargetAtTime(Math.min(0.05, s.awe * 0.06), t, 0.8);
    // combat pulse
    const bpm = 64 + s.threat * 46;
    while (amb.nextBeat < t + 0.12) {
      const bt = Math.max(amb.nextBeat, t);
      if (s.threat > 0.05 && !s.menu) {
        const n = amb.beatN++ % 8;
        kick(bt, 0.25 + 0.35 * s.threat);
        if (s.threat > 0.4) tick(bt + 30 / bpm, 0.05 + 0.08 * s.threat);
        if (s.threat > 0.25 && (n === 0 || n === 3 || n === 6)) bass(bt, 0.08 + 0.12 * s.threat, amb.root * (n === 6 ? 1.0595 : 1));
      }
      amb.nextBeat = bt + 60 / bpm;
    }
    // heartbeat when hurt or losing your mind
    if (s.danger > 0.05 && !s.menu) {
      while (amb.nextHeart < t + 0.12) {
        const ht = Math.max(amb.nextHeart, t);
        heart(ht, 0.3 * s.danger);
        heart(ht + 0.22, 0.2 * s.danger);
        amb.nextHeart = ht + 60 / (60 + 50 * s.danger);
      }
    } else amb.nextHeart = t + 0.2;
    // whispers
    if (!s.menu && s.luc < 0.6) {
      amb.whisperT -= dt;
      if (amb.whisperT <= 0) {
        whisper();
        amb.whisperT = 1 + Math.random() * 6 * s.luc;
      }
    }
  };
})();
