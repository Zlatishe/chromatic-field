/**
 * overlay-renderer.js — 2D canvas hand visualization layer.
 *
 * Renders on top of the WebGL gradient canvas (pointer-events: none).
 *
 * Visual elements (PRD spec):
 *  - White dots 8px / pinch-dot 12px, soft glow shadowBlur:12
 *  - Connecting line 1px, 15–30% opacity, 3-second sine pulse
 *  - Coord label [ X: 42.09 // Y: 11.23 ] offset ~20px from dot
 *  - Gesture label [ SPREAD ] / [ PINCH ] / [ MENU ]
 *  - Fade-in 300ms on hand appear, fade-out 300ms on hand lose
 *  - Labels auto-hide after 2s stillness
 *
 * T5.7 — Pinch merge / split animation:
 *  SPREAD→PINCH: two dots lerp to the single pinch midpoint over 150ms
 *  PINCH→SPREAD: single dot fans out to two positions over 150ms
 *  Both animate line collapse / expansion naturally as a side-effect.
 */

import { lerp, easeInOut, distance } from './math-utils.js';

// ── Visual constants ───────────────────────────────────────────
const DOT_R_NORMAL      = 4;      // px radius (8px diameter)
const DOT_R_PINCH       = 6;      // px radius (12px diameter) for pinch mode
const DOT_GLOW_BLUR     = 12;     // px
const DOT_GLOW_ALPHA    = 0.4;
const PINCH_GLOW_ALPHA  = 0.55;
const LINE_ALPHA_MIN    = 0.15;
const LINE_ALPHA_MAX    = 0.30;
const LINE_PULSE_MS     = 3000;   // one full sine cycle
const FADE_MS           = 300;    // hand appear / disappear fade
const LABEL_HIDE_MS     = 2000;   // ms still → labels fade
const MERGE_SPLIT_MS    = 150;    // pinch transition duration
const MOVE_THRESHOLD    = 0.003;  // normalised distance for "moved" detection
const FONT_SIZE         = 10;     // px (applied after DPR scale)

export class OverlayRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    // Canonical (target) dots: [{x,y,label?,pinch?,sublabel?}] normalised [0,1]
    this._dots     = [];
    this._prevDots = [];   // for stillness detection

    // Locked source positions — draw faint pulsing rings (R3.2)
    this._lockedPositions = [];

    // Fade envelope
    this._opacity       = 0;
    this._targetOpacity = 0;
    this._fadeFrom      = 0;
    this._fadeStartMs   = 0;

    // Label stillness
    this._lastMoveMs    = 0;
    this._labelsVisible = false;

    // T5.7 — merge / split transition
    // null | { type:'merge'|'split', startDots, endDots, startMs, duration }
    this._tx = null;

    this._startMs = performance.now();
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Supply the current dots every tracker frame.
   * @param {Array<{x:number,y:number,label?:string,pinch?:boolean}>} dots
   */
  setDots(dots) {
    const now      = performance.now();
    const prevCount = this._dots.length;
    const newCount  = dots.length;

    // Stillness detection
    const moved = dots.some((d, i) => {
      const p = this._prevDots[i];
      return !p || distance(d, p) > MOVE_THRESHOLD;
    });
    if (moved) {
      this._lastMoveMs    = now;
      this._labelsVisible = true;
    }

    // ── T5.7: detect dot-count change and launch transition ──────
    if (prevCount === 2 && newCount === 1 && this._dots.length === 2) {
      // SPREAD → PINCH  (merge)
      this._tx = {
        type:      'merge',
        startDots: this._dots.slice(),   // two spread dots
        endDots:   dots.slice(),          // single pinch dot
        startMs:   now,
        duration:  MERGE_SPLIT_MS,
      };
    } else if (prevCount === 1 && newCount === 2 && this._dots.length === 1) {
      // PINCH → SPREAD  (split)
      this._tx = {
        type:      'split',
        startDots: this._dots.slice(),   // single pinch dot
        endDots:   dots.slice(),          // two spread dots
        startMs:   now,
        duration:  MERGE_SPLIT_MS,
      };
    } else if (this._tx && newCount !== prevCount) {
      // Rapid re-change mid-transition — cancel and snap
      this._tx = null;
    }

    this._prevDots = dots.map(d => ({ ...d }));
    this._dots     = dots;

    if (dots.length > 0 && this._targetOpacity === 0) {
      this._startFade(1);
    }
  }

  /** Remove all dots (hand lost / IDLE). */
  clearDots() {
    this._tx       = null;
    this._dots     = [];
    this._prevDots = [];
    this._startFade(0);
  }

  /**
   * Set positions of locked colour sources — drawn as faint pulsing rings.
   * Call every render frame from the master loop.
   * @param {Array<{x:number,y:number}>} positions
   */
  setLockedPositions(positions) {
    this._lockedPositions = positions;
  }

  /** Resize to match display. Call on init and window resize. */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth  * dpr;
    const h = this.canvas.clientHeight * dpr;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width  = w;
      this.canvas.height = h;
    }
  }

  /** Called every RAF frame by the master loop. */
  render() {
    const { ctx, canvas } = this;
    const now = performance.now();

    this._updateFade(now);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this._opacity < 0.01 || this._dots.length === 0) return;

    // Label hide after stillness
    if (now - this._lastMoveMs > LABEL_HIDE_MS) this._labelsVisible = false;

    const dpr         = canvas.width / this.canvas.clientWidth;
    const W           = canvas.width;
    const H           = canvas.height;
    const tPulse      = (now - this._startMs) / LINE_PULSE_MS;
    const lineAlpha   = LINE_ALPHA_MIN +
      (LINE_ALPHA_MAX - LINE_ALPHA_MIN) * (0.5 + 0.5 * Math.sin(tPulse * Math.PI * 2));

    // Resolve dots: either the live dots or interpolated transition state
    const display = this._resolveDisplay(now);

    ctx.save();
    ctx.globalAlpha = this._opacity;

    // ── Locked source rings (R3.2) ─────────────────────────────
    // Faint pulsing circles mark where the user has "stamped" a colour
    if (this._lockedPositions.length > 0) {
      const tRing    = (now - this._startMs) / 2000;
      const ringAlpha = 0.18 + 0.10 * Math.sin(tRing * Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${ringAlpha})`;
      ctx.lineWidth   = dpr * 0.75;
      this._lockedPositions.forEach(pos => {
        ctx.beginPath();
        ctx.arc(pos.x * W, pos.y * H, 9 * dpr, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    // ── Finger→source binding lines (R4.4) ────────────────────
    // Draw a thin dotted line from each finger dot to its claimed colour source
    display.forEach(dot => {
      if (!dot.boundTo) return;
      const fx = dot.x * W;
      const fy = dot.y * H;
      const sx = dot.boundTo.x * W;
      const sy = dot.boundTo.y * H;
      // Skip if nearly overlapping
      if (Math.hypot(fx - sx, fy - sy) < 6 * dpr) return;
      ctx.save();
      ctx.setLineDash([3 * dpr, 4 * dpr]);
      ctx.strokeStyle = `rgba(255,255,255,0.12)`;
      ctx.lineWidth   = 0.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });

    // ── Connecting line ────────────────────────────────────────
    if (display.length >= 2) {
      const [a, b] = display;
      ctx.beginPath();
      ctx.moveTo(a.x * W, a.y * H);
      ctx.lineTo(b.x * W, b.y * H);
      ctx.strokeStyle = `rgba(255,255,255,${lineAlpha})`;
      ctx.lineWidth   = dpr;
      ctx.stroke();
    }

    // ── Dots & labels ──────────────────────────────────────────
    display.forEach(dot => {
      const px = dot.x * W;
      const py = dot.y * H;
      const r  = (dot.pinch ? DOT_R_PINCH : DOT_R_NORMAL) * dpr;
      const ga = dot.pinch ? PINCH_GLOW_ALPHA : DOT_GLOW_ALPHA;

      ctx.shadowBlur  = DOT_GLOW_BLUR * dpr;
      ctx.shadowColor = `rgba(255,255,255,${ga})`;

      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();

      ctx.shadowBlur  = 0;
      ctx.shadowColor = 'transparent';

      if (this._labelsVisible && dot.label) {
        this._drawLabel(ctx, dot.label, px, py, W, H, dpr, {
          alpha:    dot.sublabel ? 0.52 : 0.82,
          fontSize: dot.sublabel ? 9    : FONT_SIZE,
        });
      }
    });

    ctx.restore();
  }

  // ── Internals ──────────────────────────────────────────────────

  /** Compute the display dots, applying merge/split interpolation. */
  _resolveDisplay(now) {
    if (!this._tx) return this._dots;

    const { type, startDots, endDots, startMs, duration } = this._tx;
    const raw = (now - startMs) / duration;

    if (raw >= 1) {
      this._tx = null;
      return this._dots;
    }

    const t = easeInOut(raw);

    if (type === 'merge') {
      // Two dots converging toward the single pinch target
      const target = endDots[0];
      return [
        {
          x: lerp(startDots[0].x, target.x, t),
          y: lerp(startDots[0].y, target.y, t),
          label: t < 0.5 ? startDots[0].label : target.label,
          pinch: t >= 0.5,
        },
        {
          x: lerp(startDots[1].x, target.x, t),
          y: lerp(startDots[1].y, target.y, t),
          label: null,   // suppress second label during merge
          pinch: t >= 0.5,
        },
      ];
    } else {
      // Single dot fanning out to two spread targets
      const src = startDots[0];
      return [
        {
          x: lerp(src.x, endDots[0].x, t),
          y: lerp(src.y, endDots[0].y, t),
          label: t >= 0.5 ? endDots[0].label : null,
          pinch: t < 0.5,
        },
        {
          x: lerp(src.x, endDots[1].x, t),
          y: lerp(src.y, endDots[1].y, t),
          label: t >= 0.5 ? endDots[1].label : null,
          pinch: t < 0.5,
        },
      ];
    }
  }

  _startFade(target) {
    this._fadeFrom      = this._opacity;
    this._targetOpacity = target;
    this._fadeStartMs   = performance.now();
  }

  _updateFade(now) {
    if (this._opacity === this._targetOpacity) return;
    const t = Math.min((now - this._fadeStartMs) / FADE_MS, 1);
    this._opacity = lerp(this._fadeFrom, this._targetOpacity, t);
    if (t >= 1) this._opacity = this._targetOpacity;
  }

  /**
   * Draw a label, clamping it so it stays fully on-screen.
   * Prefers right+up offset; flips if it would overflow an edge.
   * @param {object} opts  Optional overrides: { alpha, fontSize }
   */
  _drawLabel(ctx, text, px, py, W, H, dpr, opts = {}) {
    const fontSize = (opts.fontSize ?? FONT_SIZE) * dpr;
    const alpha    = opts.alpha ?? 0.82;
    ctx.font         = `${fontSize}px ui-monospace, Menlo, monospace`;
    ctx.textBaseline = 'middle';

    const tw     = ctx.measureText(text).width;
    const offset = 20 * dpr;

    let tx = px + offset;
    let ty = py - offset;

    // Horizontal clamp
    if (tx + tw > W - 6 * dpr)   tx = px - tw - offset;
    if (tx < 6 * dpr)             tx = 6 * dpr;
    // Vertical clamp
    if (ty - fontSize < 4 * dpr)  ty = py + offset + fontSize * 0.5;
    if (ty > H - 4 * dpr)         ty = py - offset;

    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillText(text, tx, ty);
  }
}
