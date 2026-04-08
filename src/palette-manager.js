/**
 * palette-manager.js — Palette selection, color-count cycling, menu scrub.
 *
 * Emits typed change events so callers can choose the right transition:
 *  'palette' → 800ms ease-out color lerp (transitionToColors)
 *  'count'   → 400ms animated add/remove (setColorCount)
 */

import { PALETTES, DEFAULT_PALETTE_INDEX, DEFAULT_COLOR_COUNT } from './palettes.js';

export class PaletteManager {
  constructor() {
    this.palettes     = PALETTES;
    this.currentIndex = DEFAULT_PALETTE_INDEX;
    this.colorCount   = DEFAULT_COLOR_COUNT;
    /** @type {Array<(palette, count, type:'palette'|'count')=>void>} */
    this._listeners   = [];
  }

  // ── Accessors ─────────────────────────────────────────────────

  get current()       { return this.palettes[this.currentIndex]; }
  get currentColors() { return this.current.colors[this.colorCount]; }

  // ── Change API ─────────────────────────────────────────────────

  /**
   * Register a change listener.
   * @param {(palette, count, type:'palette'|'count') => void} fn
   * @returns {() => void} unsubscribe
   */
  onChange(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(f => f !== fn); };
  }

  /** Cycle color count 3 → 4 → 5 → 3 with 'count' event type. */
  cycleColorCount() {
    const seq = [3, 4, 5];
    this.colorCount = seq[(seq.indexOf(this.colorCount) + 1) % seq.length];
    this._emit('count');
  }

  /**
   * Set colour count directly (3, 4, or 5). No-op if already at that count.
   * @param {3|4|5} n
   */
  setColorCount(n) {
    if (![3, 4, 5].includes(n) || n === this.colorCount) return;
    this.colorCount = n;
    this._emit('count');
  }

  /** Go to next palette with 'palette' event type. */
  nextPalette() {
    this.currentIndex = (this.currentIndex + 1) % this.palettes.length;
    this._emit('palette');
  }

  /** Go to previous palette with 'palette' event type. */
  prevPalette() {
    this.currentIndex = (this.currentIndex - 1 + this.palettes.length) % this.palettes.length;
    this._emit('palette');
  }

  /**
   * Map normalised horizontal position [0,1] to a palette index.
   * Returns true if the palette changed.
   * @param {number} normalizedX
   */
  scrubToIndex(normalizedX) {
    const n   = this.palettes.length;
    const idx = Math.min(Math.floor(normalizedX * n), n - 1);
    if (idx === this.currentIndex) return false;
    this.currentIndex = idx;
    this._emit('palette');
    return true;
  }

  // ── Internal ──────────────────────────────────────────────────

  /** @param {'palette'|'count'} type */
  _emit(type) {
    this._listeners.forEach(fn => fn(this.current, this.colorCount, type));
  }
}
