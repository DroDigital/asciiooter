'use strict';
// Keyboard, mouse (pointer lock), wheel and gamepad, folded into a small action API.
(function () {
  const G = window.G;
  const GAME_KEYS = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote']);
  const In = (G.Input = {
    down: new Set(), pressed: new Set(), typed: [],
    mdx: 0, mdy: 0, mx: 0, my: 0, mbtn: [false, false, false], mpressed: [false, false, false], wheel: 0,
    locked: false, moved: false, canvas: null,
    pad: { ax: [0, 0, 0, 0], b: [], prev: [], connected: false },
  });

  In.init = function (canvas) {
    In.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (!In.down.has(e.code)) In.pressed.add(e.code);
      In.down.add(e.code);
      In.typed.push(e.key);
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      G.Audio.unlock();
    });
    window.addEventListener('keyup', (e) => In.down.delete(e.code));
    window.addEventListener('blur', () => {
      In.down.clear();
      In.mbtn = [false, false, false];
    });
    canvas.addEventListener('mousedown', (e) => {
      In.mbtn[e.button] = true;
      In.mpressed[e.button] = true;
      G.Audio.unlock();
      canvas.focus();
    });
    window.addEventListener('mouseup', (e) => (In.mbtn[e.button] = false));
    window.addEventListener('mousemove', (e) => {
      if (In.locked) {
        In.mdx += e.movementX;
        In.mdy += e.movementY;
      }
      if (e.clientX !== In.mx || e.clientY !== In.my) In.moved = true;
      In.mx = e.clientX;
      In.my = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => {
      In.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => (In.locked = document.pointerLockElement === canvas));
    window.addEventListener('gamepadconnected', () => (In.pad.connected = true));
  };

  In.lock = function () {
    if (In.locked || !In.canvas.requestPointerLock) return;
    try {
      const p = In.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* some browsers refuse without a gesture */
    }
  };
  In.unlock = function () {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  };

  In.pollPad = function () {
    const p = In.pad;
    p.prev = p.b.slice();
    p.b.length = 0;
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gps && Array.from(gps).find((g) => g && g.connected);
    if (!gp) {
      p.ax = [0, 0, 0, 0];
      return;
    }
    p.connected = true;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    p.ax = [dz(gp.axes[0] || 0), dz(gp.axes[1] || 0), dz(gp.axes[2] || 0), dz(gp.axes[3] || 0)];
    for (let i = 0; i < gp.buttons.length; i++) p.b[i] = gp.buttons[i].pressed || gp.buttons[i].value > 0.5;
  };
  const padDown = (i) => !!In.pad.b[i];
  const padHit = (i) => !!In.pad.b[i] && !In.pad.prev[i];

  In.key = (c) => In.down.has(c);
  In.hit = (c) => In.pressed.has(c);

  // Gameplay actions.
  In.moveAxis = function () {
    let f = 0, s = 0;
    if (In.key('KeyW')) f += 1;
    if (In.key('KeyS')) f -= 1;
    if (In.key('KeyD')) s += 1;
    if (In.key('KeyA')) s -= 1;
    if (In.key('ArrowUp')) f += 1;
    if (In.key('ArrowDown')) f -= 1;
    f -= In.pad.ax[1];
    s += In.pad.ax[0];
    return { f: G.clamp(f, -1, 1), s: G.clamp(s, -1, 1) };
  };
  In.turnAxis = () => (In.key('ArrowRight') ? 1 : 0) - (In.key('ArrowLeft') ? 1 : 0);
  In.fire = () => In.mbtn[0] || In.key('KeyJ') || In.key('ControlLeft') || padDown(7);
  In.firePressed = () => In.mpressed[0] || In.hit('KeyJ') || In.hit('ControlLeft') || padHit(7);
  In.dash = () => In.hit('Space') || In.hit('ShiftLeft') || In.mpressed[2] || padHit(0);
  In.interact = () => In.hit('KeyE') || padHit(2);
  In.lantern = () => In.hit('KeyF') || padHit(3);
  In.camera = () => In.hit('KeyV') || padHit(10) || padHit(11);
  In.weaponDelta = () => In.wheel + (padHit(5) ? 1 : 0) - (padHit(4) ? 1 : 0);
  In.lastWeapon = () => In.hit('KeyQ');
  In.mapHeld = () => In.key('Tab') || In.key('KeyM') || padDown(8);
  In.pause = () => In.hit('Escape') || In.hit('KeyP') || padHit(9);

  // Menu actions.
  In.up = () => In.hit('ArrowUp') || In.hit('KeyW') || padHit(12);
  In.downNav = () => In.hit('ArrowDown') || In.hit('KeyS') || padHit(13);
  In.left = () => In.hit('ArrowLeft') || In.hit('KeyA') || padHit(14);
  In.right = () => In.hit('ArrowRight') || In.hit('KeyD') || padHit(15);
  In.accept = () => In.hit('Enter') || In.hit('Space') || In.hit('KeyE') || padHit(0);
  In.back = () => In.hit('Escape') || In.hit('Backspace') || padHit(1);
  In.anyStart = () => In.hit('Enter') || In.hit('Space') || In.mpressed[0] || padHit(0) || padHit(9);

  In.endFrame = function () {
    In.pressed.clear();
    In.mpressed = [false, false, false];
    In.mdx = 0;
    In.mdy = 0;
    In.wheel = 0;
    In.typed.length = 0;
    In.moved = false;
  };
})();
