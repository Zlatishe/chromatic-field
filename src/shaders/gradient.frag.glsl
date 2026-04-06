#version 300 es
precision highp float;

// ── Varyings / outputs ────────────────────────────────────────
in  vec2 v_uv;
out vec4 outColor;

// ── Uniforms ──────────────────────────────────────────────────
uniform vec2  u_resolution;
uniform float u_time;
uniform float u_grainIntensity;

// Positions: unused slots are parked at (-100, -100) by JS —
// their weight ≈ 1/pow(~200, 1.25) ≈ 0.001, safely negligible.
// This removes the per-fragment conditional branch that hurts GPU throughput.
uniform vec2 u_positions[5];
uniform vec3 u_colors[5];

// ── Helpers ───────────────────────────────────────────────────

// T8.4 — pseudo-random for animated grain
float random(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453123);
}

// ── Main ──────────────────────────────────────────────────────
void main() {
  // Screen UV, Y flipped (WebGL origin = bottom-left)
  vec2 uv     = vec2(v_uv.x, 1.0 - v_uv.y);
  float aspect = u_resolution.x / u_resolution.y;

  vec3  colorSum  = vec3(0.0);
  float weightSum = 0.0;

  // T8.4 optimisation:
  //   Original: dist = sqrt(dot(diff,diff)); weight = pow(dist, -2.5)
  //   Rewritten: weight = pow(dist2, -1.25)   ← avoids sqrt entirely
  //   Loop runs unconditionally — unused slots contribute < 0.1%
  for (int i = 0; i < 5; i++) {
    vec2  diff  = uv - u_positions[i];
    diff.x     *= aspect;                            // portrait aspect correction
    float dist2 = max(dot(diff, diff), 1.0e-6);
    float w     = pow(dist2, -1.25);                 // = 1 / dist^2.5
    colorSum   += u_colors[i] * w;
    weightSum  += w;
  }

  vec3 color = colorSum / weightSum;

  // Grain — animated via time bucket so grain film changes at ~15fps
  vec2  grainSeed = gl_FragCoord.xy + vec2(floor(u_time * 15.0) * 1.7);
  float grain     = random(grainSeed);
  color = mix(color, vec3(grain), u_grainIntensity);

  outColor = vec4(color, 1.0);
}
