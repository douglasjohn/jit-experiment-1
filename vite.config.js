import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // For local development the tracker package loads the model from the
  // origin root at /web/model.json, so dev must use a root base path.
  base: command === 'serve' ? '/' : '/jit-experiment-1/',

  build: {
    outDir:    'dist',
    assetsDir: 'assets',
    // Raise the chunk-size warning limit — the tracker worker can be large
    chunkSizeWarningLimit: 1000,
  },

  // The public/ folder is served as-is (no hashing).
  // Place the WebEyeTrack web/ directory here:
  //   public/
  //   └── web/
  //       ├── model.json
  //       └── worker.js   (+ any other tracker assets)
  publicDir: 'public',
}));
