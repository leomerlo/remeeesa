# Design note: navigation-shell

Story: [navigation-shell.md](stories/navigation-shell.md). Depends on `wallet-visual-system.md`
(consumed as-is, not rebuilt here).

## Key decisions

- **Bottom-sheet primitive.** `radix-ui` (already a dependency) re-exports `Dialog` only — no
  dedicated drawer/vaul-style primitive. Build the bottom sheet as a styled wrapper over
  `Dialog.Root`/`Portal`/`Overlay`/`Content`, positioned/animated as a bottom sheet with Tailwind
  + `tw-animate-css` (already present). No new UI-library dependency. `Dialog` gives
  overlay-click-to-close/Escape/close-button for free but not native swipe-to-dismiss — the
  story's "swipe-to-close, tapping outside, or a close control" lists swipe as one option among
  several, so outside-tap/close-button/Escape satisfy the AC; swipe is a nice-to-have, not
  required for MVP.
- **Routing.** A layout route (`AppShell`) renders the bottom nav + `<Outlet/>`, nested under
  `/`, `/historico`, `/categorias`, `/household`, shown only when signed in with an active
  household (same gating `HomePage` already does). `/historico` and `/categorias` get thin
  placeholder routes in this story — no content, just real nav destinations for
  `historico-de-movimientos.md` and `categorias-desglose-y-gestion.md` to fill in later.
- **Add-expense inline → sheet.** `ExpenseFormBody` (fields/mutation logic) is reused as-is; only
  its container changes. Both add and edit reuse the *same* sheet component, since
  `AddExpenseForm` already branches on `editExpense`. This story's trigger is a **minimal single
  button** (not the final two-CTA row — that's `home-dashboard.md`'s job) — call this out so it
  isn't silently over-built.
- **Reusability.** The sheet/trigger logic should be exported as a reusable component (e.g.
  `AddExpenseSheet`), not private to `HomePage`, since `historico-de-movimientos.md` wires the
  same sheet from its own screen.

## Files touched, in order

1. `src/components/ui/sheet.tsx` (new bottom-sheet primitive)
2. `src/App.tsx` (route tree → layout route + nested routes)
3. `src/features/navigation/AppShell.tsx` (new — nav bar + `<Outlet/>`) + placeholder routes
4. `src/features/expenses/AddExpenseForm.tsx` (+ possibly `AddExpenseSheet.tsx`)
5. `src/features/home/HomePage.tsx` (drops inline form/link/logout, adds trigger + sheet state)
6. `src/features/household/EditHouseholdPage.tsx` (gains `<LogoutButton>`, moved from Home)
7. Test updates: `AddExpenseForm.test.tsx`, `EditExpenseFlow.test.tsx`, `HomePage.test.tsx`, `App.test.tsx`

## Slices (order: 1 and 2 in parallel → 3 → 4)

1. Bottom-sheet primitive component
2. Navigation shell, routing, and Ajustes
3. Add-expense as a bottom sheet
4. Edit-expense reuses the same sheet
