import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0, // never inline WASM
  },
  assetsInclude: ['**/*.glsl'],
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
});
