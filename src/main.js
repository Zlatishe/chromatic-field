/**
 * main.js — Application entry point.
 *
 * Boot order:
 *  1. Gradient renderer  → ambient gradient visible immediately
 *  2. UI                 → permission card + bottom bar
 *  3. Camera             → on user consent
 *  4. HandTracker        → loads MediaPipe model in background
 *  5. GestureDetector + StateMachine wired
 *
 * Master render loop (single RAF):
 *  Every frame:    gradient render, overlay render, DEV fps display
 *  Every 2nd frame: MediaPipe inference (~15 fps)
 *
 * State → subsystem wiring:
 *  IDLE   → release all sources (ambient drift), clear overlay
 *  SPREAD → bind sources[0]=indexTip, sources[1]=middleTip
 *  PINCH  → bind sources[0]=pinchMidpoint, release sources[1+]
 *  MENU   → bind pinch, expand bar + scrub track, live palette preview
 *  MENU→SPREAD/PINCH → confirm palette, collapse bar
 */

import { GradientRenderer }           from './gradient-renderer.js';
import { OverlayRenderer }            from './overlay-renderer.js';
import { Camera }                     from './camera.js';
import { HandTracker }                from './hand-tracker.js';
import { GestureDetector, GESTURE }   from './gesture-detector.js';
import { StateMachine }               from './state-machine.js';
import { PaletteManager }             from './palette-manager.js';
import { UI }                         from './ui.js';
import { PALETTES, DEFAULT_PALETTE_INDEX, DEFAULT_COLOR_COUNT } from './palettes.js';

// ── DOM refs ──────────────────────────────────────────────────
const gradientCanvas = document.getElementById('gradient-canvas');
const overlayCanvas  = document.getElementById('overlay-canvas');
const videoEl        = document.getElementById('camera-feed');

// ── Subsystems ────────────────────────────────────────────────
const renderer = new GradientRenderer(gradientCanvas);
const overlay  = new OverlayRenderer(overlayCanvas);
const ui       = new UI();
const palettes = new PaletteManager();
const camera   = new Camera(videoEl);
const detector = new GestureDetector();
const fsm      = new StateMachine();
let   tracker  = null;   // created after camera grants access

// ── Frame loop counter ────────────────────────────────────────
let frameCount = 0;

// ── Menu scrub state ──────────────────────────────────────────
let _lastScrubIdx = -1;

// ─────────────────────────────────────────────────────────────
//  DEV FPS COUNTER  (T8.3 — stripped in production builds)
// ─────────────────────────────────────────────────────────────
let _fpsEl         = null;
let _renderFrames  = 0;
let _trackFrames   = 0;
let _fpsWindowStart = 0;

if (import.meta.env.DEV) {
  _fpsEl = document.createElement('div');
  Object.assign(_fpsEl.style, {
    position:   'fixed',
    top:        '8px',
    right:      '10px',
    fontSize:   '10px',
    fontFamily: 'monospace',
    color:      'rgba(255,255,255,0.55)',
    zIndex:     '999',
    pointerEvents: 'none',
    letterSpacing: '0.08em',
  });
  document.body.appendChild(_fpsEl);
  _fpsWindowStart = performance.now();
}

function _tickFps(isTrackFrame) {
  if (!import.meta.env.DEV || !_fpsEl) return;
  _renderFrames++;
  if (isTrackFrame) _trackFrames++;

  const now     = performance.now();
  const elapsed = now - _fpsWindowStart;
  if (elapsed >= 1000) {
    const rfps = Math.round(_renderFrames  / (elapsed / 1000));
    const tfps = Math.round(_trackFrames   / (elapsed / 1000));
    _fpsEl.textContent = `R: ${rfps}fps  T: ${tfps}fps`;
    _renderFrames  = 0;
    _trackFrames   = 0;
    _fpsWindowStart = now;
  }
}

// ═════════════════════════════════════════════════════════════
//  BOOT
// ═════════════════════════════════════════════════════════════
async function boot() {
  // 1 — WebGL check (WebGL2 preferred, WebGL1 fallback handled by GradientRenderer)
  const testGL = document.createElement('canvas');
  if (!testGL.getContext('webgl2') && !testGL.getContext('webgl')) {
    ui.showWebGLError();
    return;
  }

  // 2 — Gradient + overlay running immediately
  renderer.init();
  overlay.resize();

  // 3 — Bottom bar default state
  ui.updatePalette(PALETTES[DEFAULT_PALETTE_INDEX], DEFAULT_COLOR_COUNT);

  // 4 — Wire palette-manager change events (T7.4)
  //     'palette' → 800ms ease-out color lerp
  //     'count'   → 400ms animated add/remove
  palettes.onChange((palette, count, type) => {
    if (type === 'count') {
      renderer.setColorCount(palette.colors[count], 400);
    } else {
      renderer.transitionToColors(palette.colors[count], 800);
    }
    ui.updatePalette(palette, count);
  });

  // 5 — Touch fallback (works before camera is active)
  wireTouchFallback();

  // 6 — Permission card
  ui.showPermissionCard();
  ui.onEnableCamera(handleEnableCamera);

  // 7 — Master render loop
  requestAnimationFrame(masterLoop);
}

// ═════════════════════════════════════════════════════════════
//  CAMERA PERMISSION FLOW
// ═════════════════════════════════════════════════════════════
async function handleEnableCamera() {
  ui.hidePermissionCard();
  ui.showLoading('LOADING HAND MODEL...');

  // Request camera access
  let camResult;
  try {
    camResult = await camera.requestAccess();
  } catch (err) {
    console.error('Camera error:', err);
    ui.updateLoading('CAMERA ERROR');
    return;
  }

  if (camResult === 'denied') {
    ui.showPermissionCard();
    ui.showDenyMessage();
    ui.hideLoading();
    return;
  }

  // Camera granted → load MediaPipe in background
  tracker = new HandTracker(videoEl);
  try {
    await tracker.init();
  } catch (err) {
    console.error('MediaPipe init failed:', err);
    ui.updateLoading('MODEL LOAD FAILED');
    return;
  }

  // Model ready — wire result callback + update status
  tracker.onResult = handleLandmarks;
  ui.updateLoading('SHOW YOUR HAND');
}

// ═════════════════════════════════════════════════════════════
//  LANDMARK PIPELINE: tracker → gesture → FSM
// ═════════════════════════════════════════════════════════════
function handleLandmarks(landmarks) {
  const result = detector.detect(landmarks);

  if (result.gesture === GESTURE.IDLE) {
    fsm.forceTransition(GESTURE.IDLE, result);
  } else {
    fsm.update(result.gesture, result);
    // Feed live position data to overlay every tracker frame
    updateOverlay(result);
  }
}

// ═════════════════════════════════════════════════════════════
//  STATE MACHINE → SUBSYSTEM REACTIONS
// ═════════════════════════════════════════════════════════════
fsm.onTransition((from, to, data) => {
  switch (to) {

    case GESTURE.IDLE:
      renderer.releaseAllSources();
      overlay.clearDots();
      ui.collapseBar();
      ui.clearSwatchHighlight();
      break;

    case GESTURE.SPREAD:
      // Hide loading indicator on first-ever hand detection
      ui.hideLoading();

      if (data?.indexTip && data?.middleTip) {
        renderer.bindSources([data.indexTip, data.middleTip]);
      }

      // Coming from MENU: palette confirmed, collapse bar
      if (from === GESTURE.MENU) {
        ui.collapseBar();
        ui.clearSwatchHighlight();
        _lastScrubIdx = -1;
      }
      break;

    case GESTURE.PINCH:
      ui.hideLoading();

      if (data?.pinchMidpoint) {
        renderer.bindSources([data.pinchMidpoint]);
        renderer.releaseSourcesFrom(1);
      }

      // Coming from MENU: palette confirmed, collapse bar
      if (from === GESTURE.MENU) {
        ui.collapseBar();
        ui.clearSwatchHighlight();
        _lastScrubIdx = -1;
      }
      break;

    case GESTURE.MENU:
      ui.hideLoading();
      ui.expandBar();
      ui.showMenuTrack(palettes.palettes.length, palettes.currentIndex);
      break;
  }
});

// ═════════════════════════════════════════════════════════════
//  LIVE OVERLAY UPDATE (called every tracker frame, not just on transition)
// ═════════════════════════════════════════════════════════════
function updateOverlay(result) {
  const { gesture, indexTip, middleTip, pinchMidpoint } = result;

  switch (gesture) {
    case GESTURE.SPREAD:
      if (indexTip && middleTip) {
        overlay.setDots([
          { ...indexTip,  label: `[ X: ${fmt(indexTip.x)} // Y: ${fmt(indexTip.y)} ]` },
          { ...middleTip, label: '[ SPREAD ]' },
        ]);
        renderer.bindSources([indexTip, middleTip]);
      }
      break;

    case GESTURE.PINCH:
      if (pinchMidpoint) {
        overlay.setDots([
          { ...pinchMidpoint,
            label: `[ X: ${fmt(pinchMidpoint.x)} // Y: ${fmt(pinchMidpoint.y)} ]`,
            pinch: true },
        ]);
        renderer.bindSources([pinchMidpoint]);
      }
      break;

    case GESTURE.MENU:
      if (pinchMidpoint) {
        overlay.setDots([
          { ...pinchMidpoint, label: '[ MENU ]', pinch: true },
        ]);
        renderer.bindSources([pinchMidpoint]);
        handleMenuScrub(result.scrubX);
      }
      break;
  }
}

// ═════════════════════════════════════════════════════════════
//  PALETTE SCRUB (MENU state)
// ═════════════════════════════════════════════════════════════
function handleMenuScrub(scrubX) {
  if (scrubX === null) return;

  // Update scrub cursor position on the bar track
  ui.updateMenuCursor(scrubX);

  // Map to palette index
  const n   = palettes.palettes.length;
  const idx = Math.min(Math.floor(scrubX * n), n - 1);
  if (idx === _lastScrubIdx) return;

  _lastScrubIdx         = idx;
  palettes.currentIndex = idx;

  // Highlight the matching swatch
  ui.highlightSwatch(idx % palettes.currentColors.length);

  // Live preview — 400ms transition per PRD; bypass onChange (direct call)
  renderer.transitionToColors(palettes.currentColors, 400);
  ui.updatePalette(palettes.current, palettes.colorCount);
}

// ═════════════════════════════════════════════════════════════
//  TOUCH FALLBACK (T6.4 / T6.5)
// ═════════════════════════════════════════════════════════════
function wireTouchFallback() {
  ui.onBarSwipe(
    () => { palettes.nextPalette(); },   // onChange fires transitionToColors + ui.updatePalette
    () => { palettes.prevPalette(); }
  );

  ui.onColorCountTap(() => { palettes.cycleColorCount(); });
}

// ═════════════════════════════════════════════════════════════
//  DESKTOP MOUSE TEST (no camera, development only)
// ═════════════════════════════════════════════════════════════
function enableMouseTest() {
  window.addEventListener('mousemove', e => {
    const pos = {
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    };
    const mirror = { x: 1 - pos.x, y: 1 - pos.y };
    renderer.bindSources([pos, mirror]);
    overlay.setDots([
      { ...pos,    label: `[ X: ${fmt(pos.x)} // Y: ${fmt(pos.y)} ]` },
      { ...mirror, label: '[ SPREAD ]' },
    ]);
  });
  window.addEventListener('mouseleave', () => {
    renderer.releaseAllSources();
    overlay.clearDots();
  });
}

// ═════════════════════════════════════════════════════════════
//  MASTER RENDER LOOP
// ═════════════════════════════════════════════════════════════
function masterLoop(timestamp) {
  frameCount++;

  // MediaPipe inference every 2nd frame (~15 fps on 30 fps loop)
  const isTrackFrame = (frameCount % 2 === 0) && tracker;
  if (isTrackFrame) {
    tracker.processFrame(timestamp);
  }

  // Gradient + overlay render every frame
  renderer.renderFrame(timestamp);
  overlay.render();

  // DEV fps telemetry (tree-shaken in production)
  _tickFps(!!isTrackFrame);

  requestAnimationFrame(masterLoop);
}

// ═════════════════════════════════════════════════════════════
//  RESIZE
// ═════════════════════════════════════════════════════════════
window.addEventListener('resize', () => {
  renderer.resize();
  overlay.resize();
});

// ═════════════════════════════════════════════════════════════
//  HELPERS
// ═════════════════════════════════════════════════════════════
/** Format normalised [0,1] as a two-decimal percentage string. */
function fmt(v) { return (v * 100).toFixed(2); }

// ═════════════════════════════════════════════════════════════
//  GO
// ═════════════════════════════════════════════════════════════

// On non-touch desktop: mouse drives gradient for testing
if (!('ontouchstart' in window) && !navigator.maxTouchPoints) {
  enableMouseTest();
}

boot();
