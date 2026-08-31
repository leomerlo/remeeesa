# See spending by category and by person, and manage categories

As a household member, I want to see how much we spent in each category and how much each of us
personally spent, so that I understand where the money actually goes, not just the total — and I
want to fix a category's name or color if it's wrong, without it turning into a whole admin
screen.

## Context

Today categories only exist implicitly — created by typing a new name on an expense
(`add-expense.md`), with no view of totals per category and no way to rename, merge, or delete
one (explicitly out of scope there). Now that every `Category` carries a color
(`wallet-visual-system.md`), a breakdown becomes genuinely useful — and worth showing "who spent
what" too, since that was raised directly during the review (e.g. attributing a shared coffee to
whoever paid). This story is the "Categorías" destination from `navigation-shell.md`. It also
depends on `cuentas-pendientes.md`, since deleting/merging a category must account for pending
Cuentas referencing it, not just Expenses. This story bundles two related but distinct jobs
(category data hygiene, and the by-category/by-person analytics) into one vertical slice
deliberately, since both need the same `color` field from `wallet-visual-system.md` — split it
into two if it proves too large during implementation.

## Acceptance criteria

- [ ] A member can see, for the current month, total spending per category (name, color, amount,
      and share of the month's total), sorted by amount descending.
- [ ] A member can see, for the current month, total spending per member (display name and
      amount) — "who spent what" this month. This groups by each Expense's snapshotted
      `authorDisplayName`, not live household membership — a member who left mid-month still
      shows up with what they spent while they were in the household (consistent with
      `CONTEXT.md`'s Expense definition).
- [ ] Both breakdowns are visual (e.g. a donut/bar chart using each category's color), not just a
      table of numbers — this is the payoff of category colors existing at all.
- [ ] From this screen, a member can rename an existing category. Renaming never changes its
      stored `color` (see `wallet-visual-system.md` — color is fixed at creation, not recomputed
      from the name), so a rename can't accidentally undo a manual color override or shuffle an
      unrelated category's look. The same trim + case-insensitive uniqueness rule from
      `add-expense.md` applies: a rename that collides with a *different* existing category's
      name is rejected with a message pointing at merge (below) instead.
- [ ] From this screen, a member can override a category's stored color with a manual choice from
      a fixed palette (updates the `color` field added in `wallet-visual-system.md` in place —
      no separate override flag; the stored color is simply no longer only the hash default).
- [ ] From this screen, a member can merge two categories into one (picks a survivor): every
      Expense **and every Cuenta** (`cuentas-pendientes.md`) referencing the merged-away category
      is repointed to the survivor, and the merged-away category is removed from the household's
      list. Repointing happens across as many batched writes as needed (Firestore's 500-write
      batch limit) rather than assuming one atomic operation — a category with a very large
      history merges correctly even if it takes multiple batches.
- [ ] From this screen, a member can delete a category only if it has **no Expenses and no
      Cuentas** (pending or paid) referencing it — checking Expenses alone isn't enough, since a
      category could be Expense-free but still have a pending Cuenta pointing at it. A category
      that fails this check cannot be deleted directly — merge it into another category first
      (previous bullet) if it needs to go away.
- [ ] Category rename/merge/delete are secondary actions on this screen (e.g. per-category edit
      affordance), not a separate destination — the breakdown view is the primary content.
- [ ] Firestore security rules allow these category mutations for any household member,
      consistent with the household's equal-permissions model. The current rules'
      `isValidCategory` only allows `household_id`/`name`/`created_at` and hard-disallow
      update/delete entirely — this story needs to add `color` to the allowed fields and replace
      the blanket `allow update, delete: if false` with real household-membership checks.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` pass.

## Out of scope

- Per-category budgets (still a single total household budget, per `create-household-and-invite.md`).
- Historical (non-current-month) breakdowns — this screen mirrors Home's "this month" scope for
  now; viewing breakdown for a past month is a future extension once Histórico's month grouping
  is in place and proves the need.
- Bulk category management beyond rename/merge/delete (e.g. reordering, grouping categories into
  parent categories).

## Open questions

- None outstanding.
