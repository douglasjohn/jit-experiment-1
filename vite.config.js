import { defineConfig } from 'vite';

export default defineConfig({
  // ── Base path ──────────────────────────────────────────────────────────────
  // For local dev and custom domains: keep as '/'.
  // For GitHub Pages at https://USERNAME.github.io/REPO-NAME/ :
  //   change to '/REPO-NAME/'   (e.g. '/eye-tracking-experiment/')
  // For a GitHub user/org page at https://USERNAME.github.io/ :
  //   keep as '/'
  base: '/jit-experiment-1/',

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
});
