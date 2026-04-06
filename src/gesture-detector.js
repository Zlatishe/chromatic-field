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
const PINCH_THRESHOLD  = 0.05;  // normalized distance
const SPREAD_THRESHOLD = 0.08;  // normalized distance
const MENU_Y_THRESHOLD = 0.85;  // normalized y (0=top, 1=bottom)

export const GESTURE = Object.freeze({
  IDLE:   'IDLE',
  SPREAD: 'SPREAD',
  PINCH:  'PINCH',
  MENU:   'MENU',
});

/**
 * @typedef {Object} GestureResult
 * @property {string}           gesture       — one of GESTURE.*
 * @property {{x,y}|null}       indexTip      — index fingertip position
 * @property {{x,y}|null}       middleTip     — middle fingertip position
 * @property {{x,y}|null}       pinchMidpoint — midpoint of thumb+index when pinching
 * @property {number|null}      scrubX        — horizontal position [0,1] for palette scrub
 */

export class GestureDetector {
  /**
   * Classify gesture from smoothed landmarks.
   * @param {Array<{x,y,z}>|null} landmarks
   * @returns {GestureResult}
   */
  detect(landmarks) {
    if (!landmarks) {
      return { gesture: GESTURE.IDLE, indexTip: null, middleTip: null, pinchMidpoint: null, scrubX: null };
    }

    const thumbTip  = landmarks[IDX.THUMB_TIP];
    const indexTip  = landmarks[IDX.INDEX_TIP];
    const middleTip = landmarks[IDX.MIDDLE_TIP];
    const indexMCP  = landmarks[IDX.INDEX_MCP];
    const middleMCP = landmarks[IDX.MIDDLE_MCP];
    const wrist     = landmarks[IDX.WRIST];

    const pinchDist = distance(thumbTip, indexTip);

    // ── PINCH (and MENU sub-state) ──────────────────────────────
    if (pinchDist < PINCH_THRESHOLD) {
      const pinchMidpoint = {
        x: (thumbTip.x + indexTip.x) * 0.5,
        y: (thumbTip.y + indexTip.y) * 0.5,
      };
      const tip = { x: indexTip.x, y: indexTip.y };

      // MENU: pinching while primary fingertip is in the bottom zone
      if (indexTip.y > MENU_Y_THRESHOLD) {
        return {
          gesture:       GESTURE.MENU,
          indexTip:      tip,
          middleTip:     null,
          pinchMidpoint,
          scrubX:        indexTip.x, // 0 = left palette, 1 = right palette
        };
      }

      return {
        gesture:       GESTURE.PINCH,
        indexTip:      tip,
        middleTip:     null,
        pinchMidpoint,
        scrubX:        null,
      };
    }

    // ── SPREAD ─────────────────────────────────────────────────
    const spreadDist     = distance(indexTip, middleTip);
    const indexExtended  = isExtended(landmarks[IDX.INDEX_TIP],  landmarks[IDX.INDEX_MCP],  wrist);
    const middleExtended = isExtended(landmarks[IDX.MIDDLE_TIP], landmarks[IDX.MIDDLE_MCP], wrist);

    // Accept as SPREAD if: fingers are apart enough AND at least index is extended.
    // (Middle extended check is softer to be more forgiving in practice.)
    if (spreadDist > SPREAD_THRESHOLD && indexExtended) {
      return {
        gesture:       GESTURE.SPREAD,
        indexTip:      { x: indexTip.x,  y: indexTip.y  },
        middleTip:     { x: middleTip.x, y: middleTip.y },
        pinchMidpoint: null,
        scrubX:        null,
      };
    }

    // ── Fallback: hand visible but gesture ambiguous ────────────
    // Treat as SPREAD with current fingertip positions so the gradient
    // keeps responding rather than snapping to IDLE.
    return {
      gesture:       GESTURE.SPREAD,
      indexTip:      { x: indexTip.x,  y: indexTip.y  },
      middleTip:     { x: middleTip.x, y: middleTip.y },
      pinchMidpoint: null,
      scrubX:        null,
    };
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
