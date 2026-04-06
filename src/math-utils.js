/**
 * math-utils.js — Shared math helpers
 */

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function easeOut(t) {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

export function easeInOut(t) {
  t = clamp(t, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Exponential moving average — smooths jitter.
 * @param {number} current  New raw value
 * @param {number} previous Previous smoothed value
 * @param {number} alpha    0 = no update, 1 = instant snap (PRD: ~0.3)
 */
export function ema(current, previous, alpha = 0.3) {
  return alpha * current + (1 - alpha) * previous;
}

export function mapRange(val, inMin, inMax, outMin, outMax) {
  const t = clamp((val - inMin) / (inMax - inMin), 0, 1);
  return lerp(outMin, outMax, t);
}

export function lerpColor(a, b, t) {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
  };
}
