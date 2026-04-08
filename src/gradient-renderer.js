/**
 * gradient-renderer.js — WebGL mesh gradient with Shepard's interpolation.
 *
 * Responsibilities:
 *  - WebGL2 primary context; WebGL1 automatic fallback (T8.6)
 *  - Shader compilation and uniform management
 *  - Color source lifecycle (bound → hand, unbound → ambient drift)
 *  - Palette transitions (800ms ease-out lerp)
 *  - Animated color-count change (400ms, T7.4)
 *  - Inter-frame position interpolation for bound sources (T8.2)
 *  - Ambient drift animation in IDLE state
 */

import vertSrc2   from './shaders/gradient.vert.glsl?raw';
import fragSrc2   from './shaders/gradient.frag.glsl?raw';
import vertSrc1   from './shaders/gradient-webgl1.vert.glsl?raw';
import fragSrc1   from './shaders/gradient-webgl1.frag.glsl?raw';
import { lerp, easeOut, lerpColor } from './math-utils.js';
import { PALETTES, DEFAULT_PALETTE_INDEX, DEFAULT_COLOR_COUNT } from './palettes.js';

const MAX_SOURCES = 5;

// Default initial positions for color sources — spread evenly around screen
const INITIAL_POSITIONS = [
  { x: 0.15, y: 0.18 },
  { x: 0.82, y: 0.22 },
  { x: 0.50, y: 0.50 },
  { x: 0.18, y: 0.78 },
  { x: 0.80, y: 0.75 },
];

// Drift params — each source oscillates around its base position
const DRIFT_PARAMS = [
  { sx: 0.38, sy: 0.29, px: 0.00, py: 1.20, amp: 0.028 },
  { sx: 0.42, sy: 0.35, px: 2.10, py: 0.50, amp: 0.022 },
  { sx: 0.30, sy: 0.25, px: 0.80, py: 2.30, amp: 0.032 },
  { sx: 0.45, sy: 0.32, px: 1.50, py: 0.90, amp: 0.025 },
  { sx: 0.36, sy: 0.28, px: 3.00, py: 1.70, amp: 0.020 },
];

// Parked position — contributes ~0.001% weight, safely negligible
const PARKED = { x: -100, y: -100 };

export class GradientRenderer {
  constructor(canvas) {
    this.canvas   = canvas;
    this.gl       = null;
    this.program  = null;
    this._isGL2   = false;

    /** @type {Array<{basePosition:{x,y}, position:{x,y}, color:{r,g,b}, bound:boolean}>} */
    this.sources = [];

    // Palette / color-count transition state
    // { fromColors, toColors, startTime, duration, trimTo? }
    this._transition = null;

    // Inter-frame position interpolation (T8.2)
    // Per source: { prev:{x,y}, curr:{x,y}, prevT:ms, currT:ms }
    this._interp = [];

    this.startTime    = performance.now();
    this._animHandle  = null;

    // Uniform location cache
    this._u = {};
  }

  // ── Initialisation ─────────────────────────────────────────────

  init() {
    // T8.6 — try WebGL2 first, fall back to WebGL1
    let gl = this.canvas.getContext('webgl2');
    if (gl) {
      this._isGL2 = true;
    } else {
      gl = this.canvas.getContext('webgl') ||
           this.canvas.getContext('experimental-webgl');
      if (!gl) throw new Error('WebGL not supported');
      this._isGL2 = false;
    }
    this.gl = gl;

    this._compileProgram(this._isGL2 ? vertSrc2 : vertSrc1,
                         this._isGL2 ? fragSrc2 : fragSrc1);
    this._setupGeometry();
    this._cacheUniforms();
    this._setDefaultSources();
    this.resize();
  }

  _compileShader(type, src) {
    const gl     = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error:\n${log}`);
    }
    return shader;
  }

  _compileProgram(vertSrc, fragSrc) {
    const gl   = this.gl;
    const vert = this._compileShader(gl.VERTEX_SHADER,   vertSrc);
    const frag = this._compileShader(gl.FRAGMENT_SHADER, fragSrc);

    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link error:\n${gl.getProgramInfoLog(prog)}`);
    }

    gl.detachShader(prog, vert);
    gl.detachShader(prog, frag);
    gl.deleteShader(vert);
    gl.deleteShader(frag);

    this.program = prog;
  }

  _setupGeometry() {
    const gl    = this.gl;
    const verts = new Float32Array([
      -1, -1,   1, -1,  -1,  1,
       1, -1,   1,  1,  -1,  1,
    ]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const loc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  _cacheUniforms() {
    const gl = this.gl;
    const p  = this.program;
    // u_numSources and u_exponent intentionally omitted — optimised shader
    // runs unconditionally for all 5 slots; unused slots are parked by JS.
    this._u = {
      resolution:    gl.getUniformLocation(p, 'u_resolution'),
      time:          gl.getUniformLocation(p, 'u_time'),
      grainIntensity: gl.getUniformLocation(p, 'u_grainIntensity'),
      positions: Array.from({ length: MAX_SOURCES }, (_, i) =>
        gl.getUniformLocation(p, `u_positions[${i}]`)),
      colors: Array.from({ length: MAX_SOURCES }, (_, i) =>
        gl.getUniformLocation(p, `u_colors[${i}]`)),
    };
  }

  _setDefaultSources() {
    const palette = PALETTES[DEFAULT_PALETTE_INDEX];
    const colors  = palette.colors[DEFAULT_COLOR_COUNT];

    this.sources = colors.map((color, i) => ({
      basePosition: { ...INITIAL_POSITIONS[i] },
      position:     { ...INITIAL_POSITIONS[i] },
      color:        { ...color },
      bound:        false,
    }));
    this._interp = this.sources.map(() => null);
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Bind N sources to hand positions (screen-space normalized [0,1]).
   * Stores previous + new position with timestamps for inter-frame
   * interpolation (T8.2) — smooths 15 fps tracking onto 60 fps render.
   * @param {Array<{x:number, y:number}>} positions
   */
  bindSources(positions) {
    const now = performance.now();
    positions.forEach((pos, i) => {
      if (i >= this.sources.length) return;

      const prevPos = { ...this.sources[i].position };
      const prevT   = this._interp[i]?.currT ?? now;

      this._interp[i] = {
        prev:  prevPos,
        curr:  { ...pos },
        prevT,
        currT: now,
      };

      this.sources[i].basePosition = { ...pos };
      this.sources[i].bound        = true;
    });
  }

  /** Release all bound sources back to ambient drift. */
  releaseAllSources() {
    this.sources.forEach((s, i) => {
      s.bound      = false;
      this._interp[i] = null;
    });
  }

  /**
   * Release sources from index `start` onwards (leave 0..start-1 bound).
   * @param {number} start
   */
  releaseSourcesFrom(start) {
    for (let i = start; i < this.sources.length; i++) {
      this.sources[i].bound = false;
      this._interp[i]       = null;
    }
  }

  /**
   * Transition to a new set of colors over `duration` ms (palette change).
   * Uses easeOut for a smooth, snappy feel.
   * @param {Array<{r,g,b}>} newColors
   * @param {number}         duration   ms, default 800
   */
  transitionToColors(newColors, duration = 800) {
    this._transition = {
      fromColors: this.sources.map(s => ({ ...s.color })),
      toColors:   newColors,
      startTime:  performance.now(),
      duration,
    };
  }

  /**
   * Animated color-count change (T7.4) — 400 ms default.
   *
   * Adding sources: new source spawns at nearest existing position/color,
   *   then transitions to its target palette color while drifting toward
   *   its base position via the normal ambient-drift animation.
   *
   * Removing sources: departing sources cross-fade to the nearest remaining
   *   color over `duration`, then are spliced out via `trimTo`.
   *
   * @param {Array<{r,g,b}>} newColors  — desired color array (length may differ)
   * @param {number}         duration   ms, default 400
   */
  setColorCount(newColors, duration = 400) {
    const oldLen = this.sources.length;
    const newLen = newColors.length;

    if (newLen === oldLen) {
      this.transitionToColors(newColors, duration);
      return;
    }

    if (newLen > oldLen) {
      // ── Add sources ─────────────────────────────────────────────
      for (let i = oldLen; i < newLen; i++) {
        // Spawn at nearest existing source (index 0 if nothing else)
        const ref = this.sources[Math.min(i - 1, oldLen - 1)];
        this.sources.push({
          basePosition: { ...INITIAL_POSITIONS[i] },
          position:     { ...ref.position },      // start co-located
          color:        { ...ref.color },          // start same color
          bound:        false,
        });
        this._interp.push(null);
      }
      // Transition all — new ones animate from ref color to target
      this._transition = {
        fromColors: this.sources.map(s => ({ ...s.color })),
        toColors:   newColors,
        startTime:  performance.now(),
        duration,
      };

    } else {
      // ── Remove sources ──────────────────────────────────────────
      // Cross-fade departing sources toward the nearest remaining color
      const fromColors = this.sources.map(s => ({ ...s.color }));
      const toColors   = this.sources.map((_, i) =>
        i < newLen ? { ...newColors[i] } : { ...newColors[newLen - 1] }
      );
      this._transition = {
        fromColors,
        toColors,
        startTime: performance.now(),
        duration,
        trimTo: newLen,  // splice after animation completes
      };
    }
  }

  /**
   * Immediate color replace (no animation). Used by touch color-count tap
   * when caller prefers a direct swap rather than animated transition.
   * @param {Array<{r,g,b}>} colors
   */
  setColors(colors) {
    while (this.sources.length < colors.length) {
      const ref = this.sources[this.sources.length - 1];
      this.sources.push({
        basePosition: { ...ref.basePosition },
        position:     { ...ref.position },
        color:        { ...ref.color },
        bound:        false,
      });
      this._interp.push(null);
    }
    while (this.sources.length > colors.length) {
      this.sources.pop();
      this._interp.pop();
    }
    colors.forEach((c, i) => { this.sources[i].color = { ...c }; });
    this._transition = null;
  }

  // ── Render loop ────────────────────────────────────────────────

  /**
   * Render one frame — driven by the master RAF in main.js.
   * @param {number} timestamp — RAF timestamp (ms)
   */
  renderFrame(timestamp) {
    this._render(timestamp);
  }

  /** Standalone loop for isolated testing. */
  start() {
    const loop = (now) => {
      this._render(now);
      this._animHandle = requestAnimationFrame(loop);
    };
    this._animHandle = requestAnimationFrame(loop);
  }

  stop() {
    if (this._animHandle !== null) {
      cancelAnimationFrame(this._animHandle);
      this._animHandle = null;
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2× for perf
    const w   = this.canvas.clientWidth  * dpr;
    const h   = this.canvas.clientHeight * dpr;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width  = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  // ── Internal render ────────────────────────────────────────────

  _render(now) {
    const gl   = this.gl;
    const time = (now - this.startTime) / 1000;

    this._updateTransition(now);
    this._updateDrift(time, now);

    gl.useProgram(this.program);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(this._u.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this._u.time,       time);
    gl.uniform1f(this._u.grainIntensity, 0.035);

    // Upload all MAX_SOURCES slots; unused positions are parked far off-screen
    for (let i = 0; i < MAX_SOURCES; i++) {
      const src = this.sources[i];
      if (src) {
        gl.uniform2f(this._u.positions[i], src.position.x, src.position.y);
        gl.uniform3f(this._u.colors[i],    src.color.r,    src.color.g, src.color.b);
      } else {
        // Parked slot — negligible weight (~0.001%)
        gl.uniform2f(this._u.positions[i], PARKED.x, PARKED.y);
        gl.uniform3f(this._u.colors[i],    0, 0, 0);
      }
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  _updateTransition(now) {
    if (!this._transition) return;

    const { fromColors, toColors, startTime, duration, trimTo } = this._transition;
    const raw = (now - startTime) / duration;
    const t   = easeOut(Math.min(raw, 1));

    this.sources.forEach((src, i) => {
      const from = fromColors[i] ?? src.color;
      const to   = toColors[i]   ?? src.color;
      src.color  = lerpColor(from, to, t);
    });

    if (raw >= 1) {
      // Splice out departing sources after their fade animation completes
      if (trimTo !== undefined) {
        this.sources = this.sources.slice(0, trimTo);
        this._interp  = this._interp.slice(0, trimTo);
      }
      this._transition = null;
    }
  }

  /**
   * Update positions for all sources.
   *
   * Bound sources (T8.2): interpolate/extrapolate between the last two
   *   positions received from MediaPipe to fill the gap between tracker
   *   frames (~15 fps) within the 60 fps render loop.
   *
   * Unbound sources: sinusoidal ambient drift around their base position.
   *
   * @param {number} time — elapsed seconds since start
   * @param {number} now  — performance.now() ms
   */
  _updateDrift(time, now) {
    this.sources.forEach((src, i) => {
      if (src.bound) {
        const st = this._interp[i];
        if (st && st.currT > st.prevT) {
          const interval = st.currT - st.prevT;
          // Extrapolate slightly (up to 1.5× interval) for predictive smoothness
          const t = Math.min((now - st.prevT) / interval, 1.5);
          // Dampening: lerp rendered position toward the interpolated target at 60%
          // speed — gives colours a pleasant "weight", reduces jitter amplification
          const targetX = lerp(st.prev.x, st.curr.x, t);
          const targetY = lerp(st.prev.y, st.curr.y, t);
          src.position.x = lerp(src.position.x, targetX, 0.6);
          src.position.y = lerp(src.position.y, targetY, 0.6);
        } else {
          src.position.x = lerp(src.position.x, src.basePosition.x, 0.6);
          src.position.y = lerp(src.position.y, src.basePosition.y, 0.6);
        }
        return;
      }

      // Ambient drift
      const dp = DRIFT_PARAMS[i] ?? DRIFT_PARAMS[0];
      src.position.x = src.basePosition.x + Math.sin(time * dp.sx + dp.px) * dp.amp;
      src.position.y = src.basePosition.y + Math.cos(time * dp.sy + dp.py) * dp.amp;
    });
  }
}
