# Design note: home-dashboard

Story: [home-dashboard.md](stories/home-dashboard.md). Depends on ALL of
`wallet-visual-system.md`, `navigation-shell.md`, `cuentas-pendientes.md`,
`historico-de-movimientos.md`, `categorias-desglose-y-gestion.md` — this story aggregates their
data, doesn't rebuild it.

## The load-bearing piece: shared query-key/invalidation strategy

Today's pattern (`AddExpenseForm`, `ExpenseList`) is: each mutation site hand-enumerates the
exact query keys it knows about and invalidates each individually. That doesn't scale once Home,
Cuentas, and Categorías all read the same underlying `expenses`/`cuentas`/`categories` data from
different screens — every mutation site would otherwise need to know every other screen's exact
key shape, which is exactly what this story's cross-screen refetch requirement rules out.

**Fix:** give each entity type a hierarchical, household-scoped key factory (e.g.
`['expenses', householdId, ...]`, `['cuentas', householdId, ...]`, `['categories', householdId,
...]`) and have mutation sites invalidate by the **entity-type + householdId prefix** (React
Query does prefix matching by default), not by enumerating leaf keys. A new Home query then just
keys itself under the right prefix to automatically participate — no mutation site needs to
change when Home is added. This also resolves `historico-de-movimientos.md`'s Slice 5
requirement (a Histórico edit reflecting on Home's balance) without that story building its own
mechanism.

## Composition

`HomePage` becomes a thin shell composing six independent sections, each with its own `useQuery`
and its own loading skeleton (no `Promise.all`/parent-level gate — the point of "at a glance" is
the balance showing up even if, say, the person breakdown is still loading):

1. **Balance card** — relocate/restyle the existing `RemainingBudgetDisplay` onto the gradient
   treatment; logic unchanged.
2. **Action row** — two buttons opening the add-expense sheet (`navigation-shell.md`) and the
   new-Cuenta sheet (`cuentas-pendientes.md`). No new sheet logic, just wiring.
3. **Por pagar** — query `cuentas` where `status: pending`, order by `dueDate` asc, limit ~6 (to
   detect the "more than 5" case); absent entirely when zero pending.
4. **Recent activity** — new query for ~10 most recent expenses across all time (not the existing
   month-scoped query); empty state at zero.
5. **Category / person mini-summaries** — reuse `categorias-desglose-y-gestion.md`'s aggregation
   logic, sliced to top 3-5 / all members.

## Slices (order: 1 first — everything else invalidates against it; 2-6 then independent/parallel)

1. Shared cross-screen query-key & invalidation strategy (migrates existing mutation sites too)
2. Balance card on Home (gradient treatment)
3. Action row ("Agregar gasto" / "Nueva cuenta")
4. Por pagar section
5. Recent-activity preview
6. Category and person mini-summaries
