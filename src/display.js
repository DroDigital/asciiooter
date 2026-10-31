'use strict';
// The display: a grid of cells (glyph, foreground, background) composited in a single
// WebGL2 draw. The shader adds glow (bloom sampled from the foreground grid), CRT curvature,
// scanlines, chromatic aberration, flashes and inversion. Everything else is the grid.
(function () {
  const G = window.G;

  const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FS = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
uniform usampler2D uGlyph; uniform sampler2D uFg; uniform sampler2D uBg; uniform sampler2D uAtlas;
uniform vec2 uGrid; uniform vec2 uRes; uniform int uAtlasCols; uniform vec2 uSlot; uniform vec2 uGlyphPx;
uniform vec2 uAtlasSize; uniform float uPad; uniform float uTime; uniform float uScan; uniform float uCurve;
uniform float uAberr; uniform float uGlow; uniform float uNoise; uniform float uVig; uniform float uFlash;
uniform vec3 uFlashCol; uniform float uInvert; uniform vec2 uShake; uniform float uWarp; uniform float uDpr;
uniform vec4 uWave[4]; uniform float uSat; uniform vec3 uTint; uniform float uSpeed;
in vec2 vUv; out vec4 outColor;

vec3 cellAt(vec2 uv){
  vec2 g = uv * uGrid;
  if (g.x < 0.0 || g.y < 0.0 || g.x >= uGrid.x || g.y >= uGrid.y) return vec3(0.0);
  ivec2 c = ivec2(g); vec2 f = fract(g);
  int gi = int(texelFetch(uGlyph, c, 0).r);
  vec3 fg = texelFetch(uFg, c, 0).rgb; vec3 bg = texelFetch(uBg, c, 0).rgb;
  vec2 slot = vec2(float(gi % uAtlasCols), float(gi / uAtlasCols));
  vec2 p = slot * uSlot + vec2(uPad) + clamp(f, vec2(0.002), vec2(0.998)) * uGlyphPx;
  float a = texture(uAtlas, p / uAtlasSize).a;
  return mix(bg, fg, a);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  uv += uShake / uRes;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  uv = 0.5 + cc * (1.0 + uCurve * r2);
  if (uWarp > 0.0) uv.x += uWarp * sin(uv.y * 37.0 + uTime * 2.7) * 0.004;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = uWave[i];
    if (w.w <= 0.0) continue;
    vec2 dv = (uv - w.xy) * asp;
    float d = length(dv);
    float k = exp(-pow((d - w.z) / 0.04, 2.0)) * w.w;
    uv -= (dv / max(d, 1e-4)) / asp * k * 0.03;
  }
  vec3 col;
  if (uAberr > 0.0005) {
    vec2 d = (uv - 0.5) * uAberr;
    col = vec3(cellAt(uv + d).r, cellAt(uv).g, cellAt(uv - d).b);
  } else {
    col = cellAt(uv);
  }
  if (uSpeed > 0.01) {
    vec2 dir = (uv - 0.5);
    vec3 acc = col;
    for (int i = 1; i <= 3; i++) acc += cellAt(uv - dir * float(i) * 0.018 * uSpeed);
    col = mix(col, acc / 4.0, min(1.0, uSpeed));
  }
  if (uGlow > 0.0) {
    vec2 px = 1.0 / uGrid;
    vec3 gs = vec3(0.0);
    vec4 s0 = texture(uFg, uv); gs += s0.rgb * s0.a * 2.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec4 s = texture(uFg, uv + vec2(cos(a), sin(a) * 0.55) * px * 1.5);
      gs += s.rgb * s.a;
    }
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398 + 0.39;
      vec4 s = texture(uFg, uv + vec2(cos(a), sin(a) * 0.55) * px * 4.0);
      gs += s.rgb * s.a * 0.55;
    }
    col += gs * uGlow / 14.4;
  }
  float sl = 0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159 / max(1.0, uDpr));
  col *= 1.0 - uScan * 0.28 * sl;
  col *= 1.0 - uVig * smoothstep(0.08, 0.55, r2);
  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * uNoise;
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(vec3(lum), col, uSat) * uTint;
  col = mix(col, uFlashCol, uFlash);
  col = mix(col, vec3(1.0) - col, uInvert);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) col = vec3(0.0);
  outColor = vec4(col, 1.0);
}`;

  class Display {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL2 is not available in this browser.');
      this.gl = gl;
      this.cols = 0;
      this.rows = 0;
      this.fx = { scan: 0.5, curve: 0.04, aberr: 0, glow: 1, noise: 0.025, vig: 0.55, flash: 0, flashCol: [1, 1, 1], invert: 0, shakeX: 0, shakeY: 0, warp: 0, sat: 1, tint: [1, 1, 1], speed: 0, waves: new Float32Array(16) };
      this._init();
    }

    _init() {
      const gl = this.gl;
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
      this.prog = p;
      this.u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        this.u[info.name] = gl.getUniformLocation(p, info.name);
      }
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const tex = (filter) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      this.tGlyph = tex(gl.NEAREST);
      this.tFg = tex(gl.LINEAR);
      this.tBg = tex(gl.NEAREST);
      this.tAtlas = tex(gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    }

    // Choose a grid for the window. cellH is CSS pixels per text row.
    setup(cellH) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cellW = Math.max(4, Math.round(cellH * 0.56));
      const gw = Math.max(4, Math.round(cellW * dpr)), gh = Math.max(7, Math.round(cellH * dpr));
      const cols = G.clamp(Math.floor(window.innerWidth / cellW), 60, 300);
      const rows = G.clamp(Math.floor(window.innerHeight / cellH), 30, 110);
      this.dpr = dpr;
      this.cellW = cellW;
      this.cellH = cellH;
      const c = this.canvas;
      c.width = cols * gw;
      c.height = rows * gh;
      c.style.width = (cols * gw) / dpr + 'px';
      c.style.height = (rows * gh) / dpr + 'px';
      if (gw !== G.Glyphs.gw || gh !== G.Glyphs.gh) {
        G.Glyphs.build(gw, gh);
        const gl = this.gl, a = G.Glyphs.atlas;
        gl.bindTexture(gl.TEXTURE_2D, this.tAtlas);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.canvas);
      }
      this.gw = gw;
      this.gh = gh;
      if (cols !== this.cols || rows !== this.rows) {
        this.cols = cols;
        this.rows = rows;
        this.glyph = new Uint16Array(cols * rows);
        this.fg = new Uint8Array(cols * rows * 4);
        this.bg = new Uint8Array(cols * rows * 4);
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.tGlyph);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, cols, rows, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, this.glyph);
        gl.bindTexture(gl.TEXTURE_2D, this.tFg);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.fg);
        gl.bindTexture(gl.TEXTURE_2D, this.tBg);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.bg);
      }
      return { cols, rows };
    }

    clear() {
      this.glyph.fill(0);
      this.fg.fill(0);
      this.bg.fill(0);
    }

    // Pixel position (client coords) -> cell.
    cellAt(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      return { x: Math.floor(((clientX - r.left) / r.width) * this.cols), y: Math.floor(((clientY - r.top) / r.height) * this.rows) };
    }

    present(time) {
      const gl = this.gl, f = this.fx, u = this.u, a = G.Glyphs.atlas;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(this.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tGlyph);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, this.rows, gl.RED_INTEGER, gl.UNSIGNED_SHORT, this.glyph);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.tFg);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, this.rows, gl.RGBA, gl.UNSIGNED_BYTE, this.fg);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.tBg);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, this.rows, gl.RGBA, gl.UNSIGNED_BYTE, this.bg);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.tAtlas);
      gl.uniform1i(u.uGlyph, 0);
      gl.uniform1i(u.uFg, 1);
      gl.uniform1i(u.uBg, 2);
      gl.uniform1i(u.uAtlas, 3);
      gl.uniform2f(u.uGrid, this.cols, this.rows);
      gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
      gl.uniform1i(u.uAtlasCols, a.cols);
      gl.uniform2f(u.uSlot, a.sw, a.sh);
      gl.uniform2f(u.uGlyphPx, this.gw, this.gh);
      gl.uniform2f(u.uAtlasSize, a.canvas.width, a.canvas.height);
      gl.uniform1f(u.uPad, a.pad);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uScan, f.scan);
      gl.uniform1f(u.uCurve, f.curve);
      gl.uniform1f(u.uAberr, f.aberr);
      gl.uniform1f(u.uGlow, f.glow);
      gl.uniform1f(u.uNoise, f.noise);
      gl.uniform1f(u.uVig, f.vig);
      gl.uniform1f(u.uFlash, f.flash);
      gl.uniform3f(u.uFlashCol, f.flashCol[0], f.flashCol[1], f.flashCol[2]);
      gl.uniform1f(u.uInvert, f.invert);
      gl.uniform2f(u.uShake, f.shakeX * this.dpr, f.shakeY * this.dpr);
      gl.uniform1f(u.uWarp, f.warp);
      gl.uniform1f(u.uDpr, this.dpr);
      gl.uniform4fv(u['uWave[0]'], f.waves);
      gl.uniform1f(u.uSat, f.sat);
      gl.uniform3f(u.uTint, f.tint[0], f.tint[1], f.tint[2]);
      gl.uniform1f(u.uSpeed, f.speed);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  G.Display = Display;
})();
