#version 300 es

// Fullscreen quad — 6 vertices (2 triangles) passed as a VBO
in vec2 a_position;

// UV coordinates [0,1] passed to fragment shader
out vec2 v_uv;

void main() {
  // Map clip space [-1,1] to UV [0,1]
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
