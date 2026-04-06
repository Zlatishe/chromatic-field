/**
 * state-machine.js — Gesture FSM with 200ms debounce.
 *
 * States:  IDLE → SPREAD ↔ PINCH → MENU → SPREAD
 *          Any state → IDLE on hand-lost
 *
 * Debounce prevents flickering on ambiguous gesture boundaries.
 * Each transition fires onTransition(from, to, data) listeners.
 */

import { GESTURE } from './gesture-detector.js';
export { GESTURE };

const DEBOUNCE_MS = 200;

// Valid transitions — defines which state changes are legal.
// Missing entries block the transition (snapping prevention).
const VALID_TRANSITIONS = new Set([
  `${GESTURE.IDLE}→${GESTURE.SPREAD}`,
  `${GESTURE.SPREAD}→${GESTURE.IDLE}`,
  `${GESTURE.SPREAD}→${GESTURE.PINCH}`,
  `${GESTURE.PINCH}→${GESTURE.SPREAD}`,
  `${GESTURE.PINCH}→${GESTURE.MENU}`,
  `${GESTURE.PINCH}→${GESTURE.IDLE}`,
  `${GESTURE.MENU}→${GESTURE.SPREAD}`,   // fingers open (palette confirmed)
  `${GESTURE.MENU}→${GESTURE.PINCH}`,    // hand drifts back above menu zone
  `${GESTURE.MENU}→${GESTURE.IDLE}`,
]);

export class StateMachine {
  constructor() {
    this.state          = GESTURE.IDLE;
    this._pending       = null;   // pending target state
    this._debounceTimer = null;
    this._listeners     = [];

    // Per-state data payload — passed to transition listeners
    this.data = null;
  }

  // ── Public API ─────────────────────────────────────────────────

  /** Register a transition listener. */
  onTransition(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(f => f !== fn);
    };
  }

  /**
   * Feed the latest detected gesture into the state machine.
   * Handles debouncing and transition validation.
   *
   * @param {string} gesture  — one of GESTURE.*
   * @param {object} data     — GestureResult payload
   */
  update(gesture, data) {
    // Always update current data for listeners (even without state change)
    if (gesture === this.state) {
      this.data = data;
      // Cancel any pending transition to a different state if gesture
      // has settled back to current state
      if (this._pending && this._pending !== this.state) {
        clearTimeout(this._debounceTimer);
        this._pending = null;
      }
      return;
    }

    // Skip invalid transitions
    const key = `${this.state}→${gesture}`;
    if (!VALID_TRANSITIONS.has(key)) return;

    // If already debouncing toward the same target, do nothing
    if (gesture === this._pending) return;

    // Cancel previous debounce if target changed
    clearTimeout(this._debounceTimer);
    this._pending = gesture;

    this._debounceTimer = setTimeout(() => {
      const from    = this.state;
      this.state    = gesture;
      this.data     = data;
      this._pending = null;
      this._listeners.forEach(fn => fn(from, gesture, data));
    }, DEBOUNCE_MS);
  }

  /**
   * Force an immediate state change (no debounce).
   * Used for IDLE when hand is definitively lost.
   */
  forceTransition(gesture, data = null) {
    clearTimeout(this._debounceTimer);
    this._pending = null;

    const key = `${this.state}→${gesture}`;
    if (!VALID_TRANSITIONS.has(key) && gesture !== GESTURE.IDLE) return;

    const from = this.state;
    this.state = gesture;
    this.data  = data;
    this._listeners.forEach(fn => fn(from, gesture, data));
  }

  get current() { return this.state; }
}
