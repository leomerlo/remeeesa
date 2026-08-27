# Bootstrap the project stack — design note

Story: [docs/stories/bootstrap-stack.md](stories/bootstrap-stack.md)

## Order of work

1. **Scaffold app** — `npm create vite@latest . -- --template react-ts` at the repo root; commit base Vite/React/TS files.
2. **TS strict + lint + format** — set `"strict": true` in `tsconfig`, add ESLint (`@typescript-eslint/recommended`, `eslint-plugin-react-hooks`) + Prettier, `npm run lint`/`typecheck` scripts.
3. **Vitest + RTL** — install, configure `vitest.config.ts` (jsdom env), add a sample component with a colocated `*.test.tsx`.
4. **Firebase project + client wrapper** — manual project creation, `.env`/`.env.example`, `src/lib/firebase.ts` exporting a typed, mockable client (Auth + Firestore).
5. **Firebase Auth providers** — manual: enable email/password, create a Google OAuth client in GCP console, register the authorized domains, enable the Google provider in Firebase Auth. No app UI yet.
6. **TanStack React Query** — install, wire `QueryClientProvider` at the app root.
7. **shadcn/ui + theme** — install Tailwind, `components.json`, shadcn CLI init, customize theme tokens (pill radius, monochrome palette, bold numeral weights) per the [visual style reference](stories/bootstrap-stack.md#visual-style-reference).
8. **Husky + lint-staged** — pre-commit hook: lint-staged on staged files, plus full typecheck/test, blocking on failure.
9. **GitHub Actions CI** — workflow running typecheck/lint/test on PRs and pushes to `main`/`dev`.
10. **README** — document setup, env vars, scripts.

## Tickets

1. Scaffold Vite + React + TypeScript strict app
2. Configure ESLint + Prettier
3. Configure Vitest + React Testing Library
4. [Manual] Create Firebase project and enable Auth providers
5. Add typed, mockable Firebase client wrapper
6. Wire TanStack React Query provider
7. Set up shadcn/ui with custom monochrome/pill theme
8. Configure Husky + lint-staged pre-commit hook
9. Add GitHub Actions CI workflow
10. Write README setup documentation

See the GitHub issues for full acceptance criteria and dependencies.
