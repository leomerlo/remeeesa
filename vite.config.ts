import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
