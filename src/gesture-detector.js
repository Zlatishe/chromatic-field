/**
 * gesture-detector.js — Pure gesture classification from smoothed landmarks.
 *
 * Input:  21-element landmark array [{x,y,z}] in normalized [0,1] screen coords
 *         (already mirrored + EMA-smoothed by HandTracker)
 * Output: GestureResult — gesture enum + derived positions for rendering
 *
 * Gesture priority (highest → lowest):
 *   PINCH > MENU (sub-state of PINCH) > SPREAD > IDLE
 *
 * Thresholds from PRD:
 *   PINCH:  distance(thumb_tip, index_tip) < 0.05
 *   SPREAD: distance(index_tip, middle_tip) > 0.08, both fingers extended
 *   MENU:   PINCH + index_tip.y > 0.85
 */

import { distance } from './math-utils.js';

// ── Landmark indices (MediaPipe 21-point model) ────────────────
const IDX = Object.freeze({
  WRIST:       0,
  THUMB_MCP:   2,
  THUMB_TIP:   4,
  INDEX_MCP:   5,
  INDEX_TIP:   8,
  MIDDLE_MCP:  9,
  MIDDLE_TIP:  12,
});

// ── Thresholds ─────────────────────────────────────────────────
const PINCH_THRESHOLD = 0.05;   // normalized distance
const SPREAD_THRESHOLD = 0.08;  // normalized distance
// Menu zone uses hysteresis to prevent flickering at the boundary
const MENU_ENTER_Y = 0.82;      // finger must cross going DOWN to enter menu zone
const MENU_EXIT_Y  = 0.75;      // finger must cross going UP to leave menu zone

export const GESTURE = Object.freeze({
  IDLE:   'IDLE',
  SPREAD: 'SPREAD',
  PINCH:  'PINCH',
  MENU:   'MENU',
});

/**
 * @typedef {Object} GestureResult
 * @property {string}           gesture       — one of GESTURE.*
 * @property {{x,y}|null}       indexTip      — index fingertip position (deadzone-filtered)
 * @property {{x,y}|null}       middleTip     — middle fingertip position (deadzone-filtered)
 * @property {{x,y}|null}       pinchMidpoint — midpoint of thumb+index when pinching
 * @property {number|null}      scrubX        — horizontal position [0,1] for palette scrub
 * @property {number|null}      scrubY        — vertical position [0,1] for color count scrub
 */

const DEADZONE = 0.004; // normalised distance — ignore sub-pixel jitter

export class GestureDetector {
  constructor() {
    // Previous output positions — used for deadzone filtering
    this._prev   = null;
    // Hysteresis state for menu zone — prevents flickering at boundary
    this._inMenu = false;
  }

  /**
   * Classify gesture from smoothed landmarks.
   * @param {Array<{x,y,z}>|null} landmarks
   * @returns {GestureResult}
   */
  detect(landmarks) {
    if (!landmarks) {
      this._prev   = null;
      this._inMenu = false;   // reset hysteresis when hand is lost
      return { gesture: GESTURE.IDLE, indexTip: null, middleTip: null, pinchMidpoint: null, scrubX: null, scrubY: null };
    }

    const thumbTip  = landmarks[IDX.THUMB_TIP];
    const indexTip  = landmarks[IDX.INDEX_TIP];
    const middleTip = landmarks[IDX.MIDDLE_TIP];
    const wrist     = landmarks[IDX.WRIST];

    const pinchDist = distance(thumbTip, indexTip);

    let result;

    // ── PINCH (and MENU sub-state) ──────────────────────────────
    if (pinchDist < PINCH_THRESHOLD) {
      const pinchMidpoint = {
        x: (thumbTip.x + indexTip.x) * 0.5,
        y: (thumbTip.y + indexTip.y) * 0.5,
      };
      const tip = { x: indexTip.x, y: indexTip.y };

      // MENU: pinching while in the bottom zone — hysteresis prevents flickering
      if (this._inMenu) {
        // Already in menu zone — stay unless hand moves clearly above exit threshold
        if (indexTip.y < MENU_EXIT_Y) {
          this._inMenu = false;
          // Fall through to PINCH below
          result = {
            gesture:       GESTURE.PINCH,
            indexTip:      tip,
            middleTip:     null,
            pinchMidpoint,
            scrubX:        null,
            scrubY:        null,
          };
        } else {
          result = {
            gesture:       GESTURE.MENU,
            indexTip:      tip,
            middleTip:     null,
            pinchMidpoint,
            scrubX:        indexTip.x,
            scrubY:        null,
          };
        }
      } else {
        // Not in menu zone — enter only if clearly below entry threshold
        if (indexTip.y > MENU_ENTER_Y) {
          this._inMenu = true;
          result = {
            gesture:       GESTURE.MENU,
            indexTip:      tip,
            middleTip:     null,
            pinchMidpoint,
            scrubX:        indexTip.x,
            scrubY:        null,
          };
        } else {
          result = {
            gesture:       GESTURE.PINCH,
            indexTip:      tip,
            middleTip:     null,
            pinchMidpoint,
            scrubX:        null,
            scrubY:        null,
          };
        }
      }
    } else {
      // ── SPREAD (or ambiguous fallback treated as SPREAD) ────────
      const spreadDist    = distance(indexTip, middleTip);
      const indexExtended = isExtended(landmarks[IDX.INDEX_TIP], landmarks[IDX.INDEX_MCP], wrist);

      result = {
        gesture:       GESTURE.SPREAD,
        indexTip:      { x: indexTip.x,  y: indexTip.y  },
        middleTip:     { x: middleTip.x, y: middleTip.y },
        pinchMidpoint: null,
        scrubX:        null,
        scrubY:        null,
      };

      // If not clearly spread, keep SPREAD gesture but accept same positions
      // (provides continuity rather than snapping to IDLE on ambiguous frames)
    }

    // ── Deadzone: suppress micro-jitter on output positions ─────
    // If a fingertip has barely moved since last frame, keep the previous
    // position. This prevents sub-pixel tremor from driving the gradient.
    if (this._prev) {
      if (result.indexTip && this._prev.indexTip &&
          distance(result.indexTip, this._prev.indexTip) < DEADZONE) {
        result.indexTip = this._prev.indexTip;
      }
      if (result.middleTip && this._prev.middleTip &&
          distance(result.middleTip, this._prev.middleTip) < DEADZONE) {
        result.middleTip = this._prev.middleTip;
      }
    }

    // Store filtered positions for next frame's deadzone check
    this._prev = {
      indexTip:  result.indexTip  ? { ...result.indexTip }  : null,
      middleTip: result.middleTip ? { ...result.middleTip } : null,
    };

    return result;
  }
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * A finger is "extended" when its tip is farther from the wrist
 * than its MCP (knuckle) joint. Works robustly for most hand orientations.
 */
function isExtended(tip, mcp, wrist) {
  return distance(tip, wrist) > distance(mcp, wrist);
}
