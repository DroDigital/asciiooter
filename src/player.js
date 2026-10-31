'use strict';
// The Reader: movement, dash, lantern, lucidity, ammunition and the six weapons.
(function () {
  const G = window.G;
  const D = G.Data, In = G.Input;

  class Player {
    constructor(readerId, save, heresies) {
      const R = D.READERS[readerId];
      const an = (save && save.annot) || {};
      this.reader = readerId;
      this.x = 0;
      this.y = 0;
      this.a = 0;
      this.pitch = 0;
      this.vx = 0;
      this.vy = 0;
      this.kx = 0;
      this.ky = 0;
      this.relics = [];
      this.baseHp = R.hp + 10 * (an.vellum || 0);
      this.dmgAnnot = 1 + 0.08 * (an.steady || 0);
      this.ammoAnnot = 1 + 0.2 * (an.pockets || 0);
      this.wickAnnot = 1 - 0.25 * (an.wick || 0);
      this.heresy = heresies || {};
      this.mods = D.BASE_MODS();
      this.maxHp = this.baseHp;
      this.hp = this.maxHp;
      this.luc = this.heresy.thin ? Math.min(60, R.luc) : R.luc;
      this.oilMax = R.oil;
      this.oil = R.oil;
      this.ammo = { verse: R.ammo.verse, letters: R.ammo.letters };
      this.weapons = R.weapons.slice();
      this.cur = Math.min(1, this.weapons.length - 1);
      this.prevW = 0;
      this.cd = 0;
      this.dashT = 0;
      this.dashCd = 0;
      this.inv = 0;
      this.walk = 0;
      this.stepPhase = 0;
      this.recoil = 0;
      this.charge = 0;
      this.lanternOn = true;
      this.letterIdx = 0;
      this.switchT = 0;
      this.beaming = false;
      this.hurtT = 0;
      this.hurtDir = 0;
      this.alive = true;
      this.recompute();
    }

    recompute() {
      const m = (this.mods = D.BASE_MODS());
      for (const id of this.relics) D.RELICS[id].mod(m);
      if (this.reader === 'heretic') {
        m.gnosis *= 2;
        m.secretAt = Math.max(m.secretAt, 75);
      }
      const old = this.maxHp;
      this.maxHp = this.baseHp + m.hpMax;
      if (this.maxHp > old) this.hp += this.maxHp - old;
      this.hp = Math.min(this.hp, this.maxHp);
    }

    lampRadius() {
      const base = 6.5 * this.mods.lampR * (this.reader === 'lamplighter' ? 1.3 : 1);
      return this.oil < 15 ? base * (0.55 + (0.45 * this.oil) / 15) : base;
    }
    ammoMax(type) {
      if (type === 'oil') return this.oilMax;
      return Math.floor(D.AMMO_MAX[type] * this.mods.ammoMax * this.ammoAnnot);
    }
    damageMul() {
      const madness = (1 - this.luc / 100) * 0.5 * this.mods.gnosis;
      return this.mods.dmg * this.dmgAnnot * (1 + madness);
    }
    weapon() {
      return D.WEAPONS[this.weapons[this.cur]];
    }

    addAmmo(type, n, name) {
      if (type === 'oil') {
        if (this.oil >= this.oilMax - 0.5) return false;
        this.oil = Math.min(this.oilMax, this.oil + n);
      } else {
        const mx = this.ammoMax(type);
        if (this.ammo[type] >= mx) return false;
        n = Math.round(n * this.ammoAnnot);
        this.ammo[type] = Math.min(mx, this.ammo[type] + n);
      }
      G.Game.msg(`+${n} ${name}`, [0.8, 0.9, 1]);
      return true;
    }
    giveWeapon(id) {
      const w = D.WEAPONS[id];
      if (this.weapons.includes(id)) {
        if (w.ammo === 'verse') return this.addAmmo('verse', 12, 'VERSES');
        if (w.ammo === 'letters') return this.addAmmo('letters', 80, 'LETTERS');
        if (w.ammo === 'oil') return this.addAmmo('oil', 50, 'OIL');
        return false;
      }
      this.weapons.push(id);
      this.weapons.sort((a, b) => D.WEAPON_ORDER.indexOf(a) - D.WEAPON_ORDER.indexOf(b));
      this.select(this.weapons.indexOf(id));
      if (w.ammo === 'verse') this.ammo.verse = Math.max(this.ammo.verse, 12);
      if (w.ammo === 'letters') this.ammo.letters = Math.max(this.ammo.letters, 80);
      G.Game.msg(`YOU FOUND ${w.name}`, [1, 0.9, 0.5], 3);
      G.Game.msg(w.desc, [0.8, 0.8, 0.8], 4);
      G.Audio.play('relic');
      return true;
    }
    select(i) {
      if (i === this.cur || i < 0 || i >= this.weapons.length) return;
      this.prevW = this.cur;
      this.cur = i;
      this.switchT = 0.25;
      this.charge = 0;
      G.Audio.play('ui');
    }

    canFire(w) {
      if (!w.ammo) return true;
      if (w.ammo === 'lucidity') return true;
      if (w.ammo === 'oil') return this.oil > 0.5;
      return this.ammo[w.ammo] >= (w.cost || 1);
    }

    update(g, dt) {
      const L = g.level, opts = g.opts;
      // ---- look ----
      const sens = opts.sens;
      this.a += In.mdx * sens * 0.0022 + In.turnAxis() * 2.4 * dt + In.pad.ax[2] * 3.2 * dt;
      this.pitch -= (In.mdy * sens * 0.0022 + In.pad.ax[3] * 1.6 * dt) * (opts.invertY ? -1 : 1);
      this.pitch = G.clamp(this.pitch, -0.55, 0.55);
      // ---- move ----
      const ax = In.moveAxis();
      const ca = Math.cos(this.a), sa = Math.sin(this.a);
      let mx = ca * ax.f - sa * ax.s, my = sa * ax.f + ca * ax.s;
      const ml = Math.hypot(mx, my);
      if (ml > 1) {
        mx /= ml;
        my /= ml;
      }
      const tile = Math.floor(this.y) * L.w + Math.floor(this.x);
      const inWater = L.flags[tile] & D.F.WATER;
      const speed = 4.4 * this.mods.speed * (inWater ? 0.8 : 1);
      this.dashCd -= dt;
      this.inv -= dt;
      if (In.dash() && this.dashCd <= 0) {
        let dx = mx, dy = my;
        if (ml < 0.1) {
          dx = ca;
          dy = sa;
        }
        const n = Math.hypot(dx, dy);
        this.vx = (dx / n) * 13;
        this.vy = (dy / n) * 13;
        this.dashT = 0.18;
        this.inv = 0.24;
        this.dashCd = 1.1 * this.mods.dashCd;
        g.sound('dash');
        g.fx.fovKick = 9;
        if (this.mods.dashBlast) g.spawn('afterimage', this.x, this.y, {});
        g.smoke(this.x, this.y, 0.1, 4, 0.25, [0.5, 0.48, 0.55], 0.2);
        g.ring(this.x, this.y, 0.03, 0.1, 1.2, 0.35, [0.6, 0.7, 1]);
      }
      if (this.dashT > 0) {
        this.dashT -= dt;
        if (this.mods.dashHit) g.dashStrike(this);
      } else {
        const k = Math.min(1, dt * 14);
        this.vx += (mx * speed - this.vx) * k;
        this.vy += (my * speed - this.vy) * k;
      }
      this.kx *= Math.max(0, 1 - dt * 6);
      this.ky *= Math.max(0, 1 - dt * 6);
      L.move(this, (this.vx + this.kx) * dt, (this.vy + this.ky) * dt, 0.22, true);
      const sp = Math.hypot(this.vx, this.vy);
      this.walk += dt * sp * 2.3;
      const phase = Math.floor(this.walk / Math.PI);
      if (phase !== this.stepPhase) {
        this.stepPhase = phase;
        if (sp > 1) {
          g.sound(inWater ? 'splash' : 'step', undefined, undefined, { vol: inWater ? 0.6 : 1 });
          g.footstep(inWater);
        }
      }

      // ---- lantern, lucidity, unraveling ----
      if (In.lantern()) {
        if (!this.lanternOn && this.oil <= 0) g.msg('NO OIL', [1, 0.6, 0.3]);
        else {
          this.lanternOn = !this.lanternOn;
          g.sound('ui');
        }
      }
      if (this.lanternOn) {
        this.oil -= dt * 0.5 * this.mods.oilDrain * this.wickAnnot * (this.heresy.brittle ? 2 : 1);
        if (this.oil <= 0) {
          this.oil = 0;
          this.lanternOn = false;
          g.msg('YOUR LANTERN GUTTERS OUT', [1, 0.6, 0.3]);
        }
      }
      const here = g.lightAt(this.x, this.y);
      if (!this.lanternOn && here < 0.2) g.loseLucidity(0.7 * dt, 'dark');
      const br = g.nearLitBrazier(this.x, this.y, 3.2);
      if (br) {
        this.luc = Math.min(100, this.luc + 5 * dt);
        if (this.reader === 'lamplighter') this.hp = Math.min(this.maxHp, this.hp + 4 * dt);
      }
      if (this.luc <= 0) {
        this.luc = 0;
        this.hp -= 1.5 * dt;
        if (this.hp <= 0) g.killPlayer('THE UNRAVELING');
      }
      L.secretOpen = this.luc < this.mods.secretAt;

      // ---- weapons ----
      const owned = this.weapons;
      for (let i = 0; i < D.WEAPON_ORDER.length; i++) {
        if (In.hit('Digit' + (i + 1))) {
          const idx = owned.indexOf(D.WEAPON_ORDER[i]);
          if (idx >= 0) this.select(idx);
        }
      }
      const wd = In.weaponDelta();
      if (wd) this.select((this.cur + (wd > 0 ? 1 : -1) + owned.length) % owned.length);
      if (In.lastWeapon()) this.select(this.prevW);
      this.cd -= dt;
      this.switchT -= dt;
      this.recoil = Math.max(0, this.recoil - dt * 5);
      const w = this.weapon();
      this.beaming = false;
      if (this.switchT <= 0) {
        if (w.beam) {
          if (In.fire() && this.canFire(w)) {
            this.beaming = true;
            fireLance(g, this, w, dt);
          }
        } else if (w.charge) {
          if (In.fire() && this.canFire(w)) {
            if (this.charge === 0) g.sound('palimpsestCharge');
            this.charge = Math.min(w.charge, this.charge + dt);
          } else if (this.charge > 0) {
            if (this.charge >= w.charge * 0.98 && this.cd <= 0 && this.canFire(w)) firePalimpsest(g, this, w);
            this.charge = 0;
          }
        } else if ((w.auto ? In.fire() : In.firePressed() || In.fire()) && this.cd <= 0) {
          if (this.canFire(w)) {
            FIRE[this.weapons[this.cur]](g, this, w);
            this.cd = w.cd;
          } else if (In.firePressed()) {
            g.sound('deny');
            g.msg(`OUT OF ${D.AMMO_NAME[w.ammo]}`, [1, 0.5, 0.4]);
          }
        }
      }
      g.lanceLoop = this.beaming;
      this.hurtT -= dt;
    }
  }
  G.Player = Player;

  // ---- weapon behaviour ----
  function muzzle(g, p, w, strength) {
    p.recoil = Math.max(p.recoil, w.flash || 0.4);
    const a = g.aimA;
    g.addLight(p.x + Math.cos(a) * 0.6, p.y + Math.sin(a) * 0.6, w.col, 6 * (strength || 1), 1.3 * (strength || 1), 0.07);
    g.noise(p.x, p.y, 14);
    p.pitch += 0.008 * (strength || 1);
  }
  const FIRE = {
    quill(g, p, w) {
      const dmg = w.dmg * p.mods.quill * p.damageMul();
      const a = g.aimA + G.rand.range(-w.spread, w.spread);
      g.hitscan(p.x, p.y, a, 40, dmg, { tracer: [1, 0.85, 0.5], knock: 0.6 });
      g.sound('quill');
      muzzle(g, p, w, 0.8);
      g.playerShot(dmg);
    },
    psalter(g, p, w) {
      p.ammo.verse -= 1;
      const n = Math.round(w.pellets * p.mods.pellets);
      const dmg = w.dmg * p.damageMul();
      for (let i = 0; i < n; i++) {
        const a = g.aimA + G.rand.range(-w.spread, w.spread);
        g.hitscan(p.x, p.y, a, 24, dmg, { tracer: i % 2 ? [1, 0.7, 0.4] : null, knock: w.knock / n * 3 });
      }
      g.sound('psalter');
      muzzle(g, p, w, 1.4);
      g.shake(3);
      g.playerShot(dmg * n);
    },
    litany(g, p, w) {
      p.ammo.letters -= 1;
      const dmg = w.dmg * p.damageMul();
      const shots = p.mods.litanyDouble ? 2 : 1;
      for (let s = 0; s < shots; s++) {
        let ch = w.phrase.charAt(p.letterIdx++ % w.phrase.length);
        if (ch === ' ') ch = w.phrase.charAt(p.letterIdx++ % w.phrase.length);
        const a = g.aimA + G.rand.range(-0.025, 0.025) + (shots > 1 ? (s - 0.5) * 0.05 : 0);
        g.proj({ x: p.x + Math.cos(a) * 0.3, y: p.y + Math.sin(a) * 0.3, z: 0.45, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, dmg, team: 'player', life: 2, glyph: G.Glyphs.ch(ch), col: [0.7, 0.95, 1], r: 0.12 });
      }
      g.sound('litany', undefined, undefined, { note: [0, 3, 5, 7, 10, 12][p.letterIdx % 6] });
      muzzle(g, p, w, 0.5);
      g.playerShot(dmg);
    },
    word(g, p, w) {
      const cost = w.cost * p.mods.wordCost;
      g.loseLucidity(cost, 'word');
      const a = g.aimA;
      g.proj({ x: p.x + Math.cos(a) * 0.4, y: p.y + Math.sin(a) * 0.4, z: 0.5, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, dmg: w.dmg * p.damageMul(), team: 'player', life: 3, col: [0.8, 0.3, 1], r: 0.25, blast: w.radius, big: true });
      g.sound('word');
      muzzle(g, p, w, 1);
      g.flash([0.6, 0.2, 0.8], 0.15);
      g.playerShot(w.dmg);
    },
  };
  function fireLance(g, p, w, dt) {
    p.oil = Math.max(0, p.oil - w.perSec * dt);
    const dmg = w.dps * dt * p.damageMul();
    const dealt = g.hitscan(p.x, p.y, g.aimA, 18, dmg, { pierce: true, beam: true, tick: true });
    if (p.mods.beamHeal && dealt > 0) p.hp = Math.min(p.maxHp, p.hp + dealt * p.mods.beamHeal);
    p.recoil = Math.max(p.recoil, 0.25);
    g.noise(p.x, p.y, 10);
    if (Math.random() < dt * 8) g.playerShot(w.dps * 0.1);
  }
  function firePalimpsest(g, p, w) {
    p.ammo.letters -= w.cost;
    const dmg = w.dmg * p.damageMul();
    g.hitscan(p.x, p.y, g.aimA, 40, dmg, { pierce: true, walls: true, rail: true, knock: 3 });
    g.sound('palimpsest');
    muzzle(g, p, w, 1.8);
    g.shake(6);
    g.flash([1, 0.3, 0.3], 0.18);
    p.cd = w.cd;
    g.playerShot(dmg);
  }
})();
