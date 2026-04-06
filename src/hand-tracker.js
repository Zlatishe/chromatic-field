/**
 * hand-tracker.js — MediaPipe HandLandmarker integration.
 *
 * Responsibilities:
 *  - Load HandLandmarker from local WASM + model assets
 *  - Run VIDEO-mode inference against the hidden camera feed
 *  - Mirror x coordinates (front camera is mirrored)
 *  - Apply per-landmark EMA smoothing (alpha = 0.3) to reduce jitter
 *  - Track "hand lost" timeout (500ms) before emitting null landmarks
 *  - Call onResult(landmarks | null) each time state changes
 *
 * Frame budget: processFrame() is called by the master loop every 2nd RAF
 * frame (~15fps inference on a 30fps render loop).
 */

import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { ema } from './math-utils.js';

// ── Constants ──────────────────────────────────────────────────
const WASM_PATH        = '/mediapipe/wasm';
const MODEL_PATH       = '/mediapipe/hand_landmarker.task';
const EMA_ALPHA        = 0.3;   // smoothing (0 = frozen, 1 = raw)
const HAND_LOST_MS     = 500;   // ms before IDLE transition fires

// Key landmark indices (from MediaPipe 21-point hand model)
export const LM = Object.freeze({
  WRIST:      0,
  THUMB_MCP:  2,
  THUMB_TIP:  4,
  INDEX_MCP:  5,
  INDEX_TIP:  8,
  MIDDLE_MCP: 9,
  MIDDLE_TIP: 12,
});

export class HandTracker {
  /**
   * @param {HTMLVideoElement} videoEl — the hidden camera feed element
   */
  constructor(videoEl) {
    this.video     = videoEl;
    this._landmarker = null;

    // Smoothed landmark array (21 × {x,y,z}) or null if no hand
    this.smoothed  = null;

    // Timestamp when hand was first lost (null while hand is visible)
    this._lostAt   = null;

    // Whether we already emitted null (avoid repeated null callbacks)
    this._emittedNull = true;

    /**
     * Called with the smoothed 21-landmark array, or null when hand
     * has been absent for > HAND_LOST_MS.
     * @type {((landmarks: Array<{x,y,z}>|null) => void) | null}
     */
    this.onResult  = null;
  }

  // ── Initialisation ────────────────────────────────────────────

  /**
   * Async — loads WASM + model. Must complete before processFrame().
   */
  async init() {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

    this._landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
        delegate: 'GPU',          // falls back to CPU automatically
      },
      numHands:                    1,
      runningMode:                 'VIDEO',
      minHandDetectionConfidence:  0.5,
      minHandPresenceConfidence:   0.5,
      minTrackingConfidence:       0.5,
    });
  }

  // ── Per-frame processing ───────────────────────────────────────

  /**
   * Run inference on the current video frame.
   * Call this every 2nd RAF frame from the master render loop.
   * @param {number} timestamp — performance.now() / RAF timestamp (ms)
   */
  processFrame(timestamp) {
    if (!this._landmarker) return;
    if (!this.video || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const results = this._landmarker.detectForVideo(this.video, timestamp);

    if (results.landmarks && results.landmarks.length > 0) {
      // Hand found — reset lost timer
      this._lostAt      = null;
      this._emittedNull = false;

      const raw = results.landmarks[0]; // single hand

      // 1. Mirror x: front camera is naturally mirrored
      const mirrored = raw.map(lm => ({
        x: 1.0 - lm.x,
        y: lm.y,
        z: lm.z,
      }));

      // 2. EMA smoothing per landmark
      if (!this.smoothed) {
        // First detection — snap immediately
        this.smoothed = mirrored.map(lm => ({ ...lm }));
      } else {
        this.smoothed = mirrored.map((lm, i) => ({
          x: ema(lm.x, this.smoothed[i].x, EMA_ALPHA),
          y: ema(lm.y, this.smoothed[i].y, EMA_ALPHA),
          z: ema(lm.z, this.smoothed[i].z, EMA_ALPHA),
        }));
      }

      this.onResult?.(this.smoothed);

    } else {
      // No hand in this frame
      const now = performance.now();

      if (this._lostAt === null) {
        this._lostAt = now; // start the lost timer
      }

      if (!this._emittedNull && now - this._lostAt > HAND_LOST_MS) {
        // Hand has been absent long enough — transition to IDLE
        this.smoothed     = null;
        this._emittedNull = true;
        this.onResult?.(null);
      }
      // Within the 500ms grace period: keep last smoothed landmarks,
      // don't re-emit — gesture continuity is preserved.
    }
  }

  // ── Teardown ───────────────────────────────────────────────────

  destroy() {
    this._landmarker?.close();
    this._landmarker = null;
  }
}
