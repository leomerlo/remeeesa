import { defineConfig, devices } from '@playwright/test'

// The end-to-end suite: the real app, in a real browser, against the local
// Firebase emulators.
//
// It is the only place the Firestore adapter and the rules run together
// with the screens, which is the one combination neither of the other two
// suites can reach: the unit/screen tests use the in-memory adapter, and
// the rules tests write documents without ever rendering anything.
//
// Started by `npm run test:e2e`, which boots the emulators around it.
export default defineConfig({
  testDir: './e2e',
  // One browser, one worker: every spec signs up its own household in the
  // same emulator, and parallel sign-ups race on the auth emulator's own
  // rate limiting.
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI === undefined ? 'list' : 'github',
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI === undefined ? 0 : 1,
  use: {
    baseURL: 'http://localhost:5184',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Its own port, so a dev server already running on 5183 is left alone.
    command: 'vite --mode e2e --port 5184 --strictPort',
    url: 'http://localhost:5184',
    reuseExistingServer: false,
    timeout: 120000,
  },
})
