# Turn Home into a real summary dashboard

As a household member, I want Home to answer "how much do we have left?" and "what do we still
have to pay?" at a glance, plus a quick way to log something and a peek at recent activity and
where the money's going — so I don't have to visit four different screens just to feel caught up.

## Context

`navigation-shell.md` establishes Home as one of four destinations but leaves its content as a
placeholder. This story fills it in as a MercadoPago-style summary dashboard, deliberately
trimmed to what this household actually needs (no currency tabs, no transfer/top-up/alias —
those don't apply here). It depends on `cuentas-pendientes.md` (for "Por pagar"),
`historico-de-movimientos.md` (for the recent-activity preview), and
`categorias-desglose-y-gestion.md` (for the category/person mini-summaries) — this story wires
their data into one screen; it doesn't rebuild any of that logic.

## Acceptance criteria

- [ ] Home shows, top to bottom: a balance card, a two-button action row, a "Por pagar" section,
      a recent-activity preview, a category mini-summary, and a person mini-summary.
- [ ] **Balance card**: the household's remaining budget for the current month, as today (large,
      bold numeral), now on the new gradient-card visual treatment from `wallet-visual-system.md`.
- [ ] **Action row**: two buttons, "Agregar gasto" and "Nueva cuenta", each opening its own
      bottom sheet (add-expense sheet from `navigation-shell.md`; new-Cuenta sheet from
      `cuentas-pendientes.md`) — not a single button with a follow-up choice.
- [ ] **Por pagar**: up to 5 of the household's pending Cuentas, soonest due date first, each
      showing name, category, due date, and expected amount if known. Tapping one opens the
      mark-paid flow from `cuentas-pendientes.md`. If there are more than 5 pending, a "ver
      todas" link leads to the full pending list. If there are none, this section is hidden
      entirely (not shown as an empty box) — there's nothing useful to say when nothing is due.
- [ ] **Recent activity**: the household's most recent expenses (about 10), newest first, with a
      "ver más" link to Histórico (`historico-de-movimientos.md`). If there are no expenses yet,
      shows an empty-state message.
- [ ] **Category mini-summary**: the current month's top categories by spend (e.g. top 3-5) with
      their colors, linking to the full breakdown in Categorías
      (`categorias-desglose-y-gestion.md`).
- [ ] **Person mini-summary**: the current month's spend per household member, linking to the
      same Categorías screen (which hosts the full by-person breakdown per that story).
- [ ] Home's five data sections load independently in parallel, each with its own loading state
      (skeleton/placeholder), rather than one spinner blocking the whole screen until the
      slowest section resolves — the point of "at a glance" is that the balance shows up
      immediately even if, say, the person breakdown is still loading.
- [ ] All of Home's data (balance, pending Cuentas, recent expenses, summaries) refetches after
      any mutation that affects it, made **from any screen**, not only Home itself — e.g. marking
      a Cuenta paid from Home, then editing that resulting Expense's amount from Histórico, then
      returning to Home, must show the updated balance without a manual reload. This means the
      Expense/Cuenta/Category queries share query keys (or an equivalent invalidation mechanism)
      across Home, Histórico, Categorías, and the Cuentas flows, not separate per-screen caches.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` pass.

## Out of scope

- Currency/account tabs (pesos/dólares/reservas/inversiones) — not applicable to this household.
- Transfer, top-up, or "your alias" style actions — not applicable; replaced by "Agregar gasto"
  and "Nueva cuenta".
- Confetti/celebration animation on marking a Cuenta paid or similar micro-interactions — worth
  doing (per the "fun, colorful, with confetti" direction from the review) but tracked as a
  follow-up polish pass via the `animate` skill once this story's functional shell exists, not
  bundled into this story's acceptance criteria.

## Open questions

- None outstanding.
