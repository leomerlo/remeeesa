import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Which HTML file this build produces. Vite builds index.html by default,
// which is what keeps src/demo/ -- and now src/beta/ -- out of the
// production bundle: neither is ever an input. `BUILD_TARGET=beta` swaps the
// input for beta.html so the beta's own Vercel project can publish it from
// this same branch, with no second repo and no long-lived branch to merge.
// See docs/adr/0007.
const BETA_BUILD = process.env.BUILD_TARGET === 'beta'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  ...(BETA_BUILD
    ? {
        build: {
          rollupOptions: {
            input: fileURLToPath(new URL('./beta.html', import.meta.url)),
          },
        },
      }
    : {}),
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
