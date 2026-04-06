/* gradient-webgl1.frag.glsl — WebGL1 / GLSL ES 1.00 fragment shader
 *
 * Differences from WebGL2 version:
 *  - No #version directive (implicit 1.00)
 *  - `varying` instead of `in`
 *  - gl_FragColor instead of `out vec4`
 *  - pow() with negative exponent is undefined in GLSL ES 1.00 →
 *    rewritten as  1.0 / pow(dist2, 1.25)
 *  - Unused slots parked at (-100,-100) by JS; weight ≈ negligible
 */
precision highp float;

varying vec2 v_uv;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_grainIntensity;
uniform vec2  u_positions[5];
uniform vec3  u_colors[5];

float random(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  vec2  uv     = vec2(v_uv.x, 1.0 - v_uv.y);
  float aspect = u_resolution.x / u_resolution.y;

  vec3  colorSum  = vec3(0.0);
  float weightSum = 0.0;

  for (int i = 0; i < 5; i++) {
    vec2  diff  = uv - u_positions[i];
    diff.x     *= aspect;
    float dist2 = max(dot(diff, diff), 1.0e-6);
    float w     = 1.0 / pow(dist2, 1.25);   /* avoids negative-exponent UB */
    colorSum   += u_colors[i] * w;
    weightSum  += w;
  }

  vec3 color = colorSum / weightSum;

  vec2  grainSeed = gl_FragCoord.xy + vec2(floor(u_time * 15.0) * 1.7);
  float grain     = random(grainSeed);
  color = mix(color, vec3(grain), u_grainIntensity);

  gl_FragColor = vec4(color, 1.0);
}
