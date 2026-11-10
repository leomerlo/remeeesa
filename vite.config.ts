import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// What this build produces: the app at index.html, and the old one at
// v1/index.html, which is served at /v1/.
//
// Those two were the other way round until the redesign shipped -- see
// docs/adr/0008. The old entry is still built on purpose: it is the way
// back if
// something in the new app turns out to be wrong, and it reads and writes
// the same household. Nothing else in the repo is ever an input, which is
// what keeps src/demo/ and src/beta/demo/ out of every bundle.
// src/demo/productionIsolation.test.ts holds that -- which it does by
// reading the file names out of this very block, so they stay written out
// in full here rather than coming from a helper.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        v1: fileURLToPath(new URL('./v1/index.html', import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/vitest.setup.ts',
    // Scope to the app's own tests. Without this, Vitest's default *.test.*
    // glob also picks up test files bundled with .claude/ skills (e.g.
    // design-tokens' generate-scale.test.mjs, written for Node's test
    // runner, not Vitest), which fails with "No test suite found".
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
