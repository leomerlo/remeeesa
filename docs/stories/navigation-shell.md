# Restructure navigation into Home, Histórico, Categorías, and Ajustes

As a household member, I want the app organized into clear sections with navigation between
them, instead of one long scrolling page, so that I can quickly get to what I need (log a
expense, check history, see spending by category, manage the household) without scrolling past
everything else.

## Context

Today `HomePage` is a single vertical scroll containing the household name, an "Edit household"
text link, the remaining-budget display, an always-visible add-expense form, the current
month's expense list, and logout — all in one column, with no navigation. This story replaces
that with four destinations — **Home** (dashboard, see `home-dashboard.md`), **Histórico** (full
movement history, see `historico-de-movimientos.md`), **Categorías** (breakdown and management,
see `categorias-desglose-y-gestion.md`), and **Ajustes** (the existing household page) — plus a
consistent bottom-sheet pattern for quick actions. This story builds the shell (routes,
navigation, the sheet mechanism) that those other stories' content plugs into; it does not build
the Home/Histórico/Categorías content itself.

## Acceptance criteria

- [ ] A persistent bottom navigation bar with 4 destinations — Home, Histórico, Categorías,
      Ajustes — replaces the current single-scroll layout, for any signed-in member with an
      active household. It is not shown during onboarding/join (no household yet).
- [ ] Home (`/`) is the default route after sign-in. In this story, Home keeps showing what it
      shows today — the remaining-budget display and the current month's expense list (now
      restyled per `wallet-visual-system.md`) — just wrapped in the new navigation shell instead
      of a bare scroll. `home-dashboard.md` later replaces this content with the full summary
      dashboard (Por pagar, recent-activity preview, mini-summaries); this story does not build
      that yet.
- [ ] "Ajustes" replaces the current inline "Edit household" text link; it routes to the existing
      `/household` page (`EditHouseholdPage`) unchanged in content — member list, invite link,
      edit budget, leave household all stay exactly as they are today, just reached differently.
- [ ] Adding an expense opens as a bottom sheet overlaid on the current screen (no route change,
      no full-page navigation) rather than the always-visible inline form. Closing the sheet
      (save, cancel, or dismiss) returns to whatever screen was underneath it.
- [ ] The bottom sheet is built with a component already available via the `radix-ui` dependency
      (e.g. `Dialog`/a drawer primitive) — no new UI library dependency is introduced for this.
- [ ] Editing an existing expense (previously inline in `AddExpenseForm` via `editExpense` state)
      also opens in the same bottom sheet pattern, pre-filled, triggered from Home's expense list
      (the only place expenses are shown in this story). `historico-de-movimientos.md` is
      responsible for wiring the same shared sheet when it adds that screen.
- [ ] Dismissing the add/edit sheet with unsaved input (swipe-to-close, tapping outside, or a
      close control) discards the draft immediately, with no confirmation prompt — consistent
      with this being a quick, low-stakes action the member can just redo.
- [ ] Logout remains reachable (e.g. from Ajustes) — it doesn't need to stay on every screen like
      it does today.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` pass, and existing tests covering
      add/edit-expense flows are updated for the sheet-based interaction instead of the
      always-inline form.

## Out of scope

- The actual content of Home, Histórico, and Categorías (their own stories).
- The two-CTA row ("Agregar gasto" / "Nuevo pendiente") on Home — that's `home-dashboard.md`, since
  "Nuevo pendiente" depends on the Pendiente entity from `cuentas-pendientes.md`.
- Deep-linking to a specific sheet state via URL.

## Open questions

- None outstanding.
