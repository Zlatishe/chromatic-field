/* gradient-webgl1.vert.glsl — WebGL1 / GLSL ES 1.00 vertex shader */
attribute vec2 a_position;
varying   vec2 v_uv;

void main() {
  v_uv        = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
