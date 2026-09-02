# Design note: categorias-desglose-y-gestion

Story: [categorias-desglose-y-gestion.md](stories/categorias-desglose-y-gestion.md). Depends on
`wallet-visual-system.md` (`Category.color`), `navigation-shell.md` (`/categorias` route), and
`cuentas-pendientes.md` (delete/merge must also check Pendientes).

## Load-bearing finding: category IDs are derived from the name

`categoryDocumentId()` builds the Firestore doc ID as
`` `${householdId}_${encodeURIComponent(name.trim().toLowerCase())}` ``, and `findOrCreateCategory`
relies on that determinism for idempotent creation + case-insensitive uniqueness. **Rename can't
be a plain field update** — it would desync the doc ID from the name and break that scheme.
Rename = create a new doc at `categoryDocumentId(newName)` (copying `color`/`createdAt`) → repoint
every referencing Expense/Pendiente → delete the old doc. Collision check is simply "does a doc
already exist at that ID."

**Rename and merge are therefore the same primitive** (repoint references from A to B, delete A) —
merge just targets an *existing* survivor instead of a freshly created doc. Build one shared
batched-repoint helper (chunked to Firestore's 500-write batch limit) and reuse it for both.

## Chart library

**No charting library exists in `package.json`.** Decision: hand-roll a simple SVG donut/bar for
the two breakdowns rather than adding a dependency — both breakdowns are a handful of categories
and members, well within what a small hand-rolled SVG component can do cleanly, consistent with
this repo's "build the minimum viable change" principle.

## Firestore rules

- `isValidCategory`: add `color`, validated against the fixed palette (enum check).
- `allow update`: replace `if false` with a rule scoped to **color-override only** (diff limited
  to `['color']`). Rename does not go through this rule — it's a create-at-new-id + delete, both
  already covered by existing create/delete rules.
- `allow delete`: replace `if false` with a household-membership check. Firestore rules can't
  cheaply express "no Expense/Pendiente references this category" (needs a collection query, not a
  single `get()`), so that guard is enforced app-side (pre-check query, then delete) — small
  TOCTOU race window accepted for v1 given household-scale concurrency.
- **Cross-story requirement:** `cuentas-pendientes.md`'s rules need a narrow extra allowance —
  `category_id`-only updates on a Pendiente regardless of `status`, so merge can repoint paid
  Pendientes too. This is an explicit, intentional exception to "a paid Pendiente can't be edited";
  land it alongside the merge slice (Slice 4 below), not silently assumed.

## Slices (order: 1 → 2 → (3, 4 parallel once 2 lands) → 5 independent → 6 needs all)

1. Manual category color override
2. Category rename (create-at-new-id + repoint + delete-old)
3. Category delete with reference guard (checks Expenses **and** Pendientes)
4. Category merge (reuses Slice 2's repoint helper; extends `pendientes` rules per above)
5. By-category and by-person breakdown (data + hand-rolled chart) — by-person groups by
   snapshotted `authorDisplayName`, not live membership
6. Categorías screen wiring — breakdown as primary content, rename/color/merge/delete as
   secondary per-category actions

## Accepted risk

Delete/merge's app-level pre-check-then-write has a small TOCTOU gap (an Expense could be
created against a category between the check and the delete/merge call). Acceptable for v1 given
this is a 2-person household, not a source of real contention.
