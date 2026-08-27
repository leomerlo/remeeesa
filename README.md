# reméeesa

Household budgeting app. Each expense shows how much budget is left after it. Multiple people in a household share one budget.

## Set up

1. Install dependencies.

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`.

3. Set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID` in `.env`.

4. Start the Vite dev server.

   ```bash
   npm run dev
   ```

The committed template for those variables is `.env.example`.

Creating the Firebase project and enabling Google sign-in are manual steps. Track that work in issue #5. Firestore security rules land with the household and expense schemas. `npm test` and CI do not need a live project. They use a mocked Firebase client.

## Commands

- `npm run dev` starts the Vite dev server.
- `npm test` runs the unit tests.
- `npm run lint` runs ESLint.
- `npm run typecheck` type-checks the project.
