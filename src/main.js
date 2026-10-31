'use strict';
// Boot: create the display, wire input, run the frame loop.
(function () {
  const G = window.G;
  const canvas = document.getElementById('screen');
  function fail(msg) {
    const el = document.getElementById('fail');
    el.style.display = 'block';
    el.textContent = 'ASCIIOOTER could not continue.\n\n' + msg;
    canvas.style.display = 'none';
  }
  let dsp;
  try {
    dsp = new G.Display(canvas);
  } catch (e) {
    fail(e.message + '\n\nThis game needs a browser with WebGL2 (any recent Chrome, Firefox, Edge or Safari).');
    return;
  }
  G.Input.init(canvas);
  G.Models.attach();
  try {
    G.Game.init(dsp);
  } catch (e) {
    fail(e.stack || String(e));
    return;
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    try {
      G.Game.step(dt);
    } catch (e) {
      console.error(e);
      fail(e.stack || String(e));
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
