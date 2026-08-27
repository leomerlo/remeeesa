# reméeesa

Household budgeting app. Each expense shows how much budget is left after it. Multiple people in a household share one budget.

## Set up

1. Install dependencies.

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`.

3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`.

4. Start the Vite dev server.

   ```bash
   npm run dev
   ```

The committed template for those variables is `.env.example`.

Creating the Supabase project and enabling Google OAuth are manual steps. Track that work in issue #5. Row Level Security policies are also a manual step. `npm test` and CI do not need a live project. They use a mocked Supabase client.

## Commands

- `npm run dev` starts the Vite dev server.
- `npm test` runs the unit tests.
- `npm run lint` runs ESLint.
- `npm run typecheck` type-checks the project.
