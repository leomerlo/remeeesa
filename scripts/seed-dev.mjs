// Seeds the dev Firebase project with a household of realistic data, for
// manual testing against real Firestore and its rules:
//
//   npm run seed:dev              # household mid-month (default)
//   npm run seed:dev -- nueva     # brand-new household, nothing logged
//
// Reads VITE_FIREBASE_* and SEED_PASSWORD from .env.preview only: the
// Firebase project behind Vercel's preview deploys, which is where seeds go.
// .env.local stays the app's local config and is never read here. The
// seeder refuses production's project id.
// Each run signs up a fresh user and prints its email; log in with it.
//
// Vite loads the TypeScript seed so it shares the app's code and `@/` paths.
import { createServer } from 'vite'

const scenario = process.argv[2] === 'nueva' ? 'nueva' : 'completa'
process.loadEnvFile('.env.preview')
const env = process.env

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
  logLevel: 'error',
})
try {
  const { seedFirebase } = await server.ssrLoadModule(
    '/src/demo/seedFirebase.ts',
  )
  const { email, projectId } = await seedFirebase({ env, scenario })
  console.log(`Seeded "${scenario}" into ${projectId}.`)
  console.log(`Log in with ${email} and your SEED_PASSWORD.`)
} finally {
  await server.close()
}
