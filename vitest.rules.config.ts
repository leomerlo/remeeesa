import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The rules suite, run against a live Firestore emulator -- the one thing
// the ordinary suite cannot do. Everything else in this project tests
// against the in-memory adapter, which has no rules at all, so a rule that
// forbids what the app actually writes passes every test and fails only in
// production. That happened twice in one day (editing a card's brand,
// deleting a card), which is why this exists.
//
// Its own config because it needs none of the app setup: no jsdom, no
// localStorage, no fake Date -- just Node talking to the emulator. Run it
// with `npm run test:rules`, which starts the emulator around it.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.rules-test.ts'],
    // One emulator, one project: parallel files would write over each
    // other's documents.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
