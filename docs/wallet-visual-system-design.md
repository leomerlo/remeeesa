# Design note: wallet-visual-system

Story: [wallet-visual-system.md](stories/wallet-visual-system.md). ADR: [0003](adr/0003-wallet-style-color-palette-replaces-monochrome.md).

## Order of work

Tokens first, then the `Category.color` data model, then screens — every screen change is
unstyleable/untypeable without both. Screens can then proceed independently of each other.

## Design-tokens skill run

`src/index.css` is exactly the from-zero case `design-tokens` targets (flat, chroma-0, single
radius value). Run it against `#7B5CFA` (+ the default green/red/yellow/grey scales, needed for
future status pill badges) and Geist Variable, building Primitive → Semantic → Responsive layers.

**Radius restructuring is the nontrivial part.** Today's `@theme inline` block derives the whole
`--radius-sm…4xl` scale as `calc(var(--radius) * N)` off one root value — that's structurally
incompatible with a two-tier shape language (always-pill controls vs. moderate-radius
containers). Stop deriving container radii from the control radius: keep pill via `rounded-full`
directly on buttons/inputs/badges/chips, and introduce independent container-radius steps
(`--radius-2xl`/`--radius-3xl` ≈ 20–24px) that are not multiples of it. Do this in the same pass
as the color regeneration.

## Category.color

Added to `src/lib/expenses/types.ts` as `readonly color: string`, computed **once** via a new
pure hash function (name → fixed palette) and set only at the two places a `Category` is first
written: `defaultCategoryRecords` (seed) and `findOrCreateCategory`'s create branch (Firestore
impl + in-memory test double). Never recomputed on render — that's what lets a later rename
preserve color and a future override just be a field update.

## Screens, by risk

- **Low risk, pure restyle:** `RemainingBudgetDisplay` (gradient hero, container radius),
  `EditHouseholdPage` (container radius).
- **Medium:** `ExpenseList` → card rows with a leading colored circular icon, price-emphasized
  hierarchy, muted metadata. No new data beyond `category.color`.
- **Highest risk:** `AddExpenseForm`'s category field. No combobox primitive exists yet (only
  `radix-ui`'s `Dialog`/`Slot`/`Label` are used today, no `cmdk`). Needs either a small `cmdk`
  addition or a hand-rolled `Popover` + filtered list. Must preserve the existing
  "free-text still creates via `findOrCreateCategory`" behavior exactly.
- **Additive, low risk:** onboarding/empty-state illustrations — new assets only, no logic touched.

## Testing

Existing tests query by role/label/text and should mostly survive; `ExpenseList.test.tsx` (new
card markup) and `AddExpenseForm.test.tsx` (combobox interaction) need real rework. No test may
assert on styling classes, per this repo's conventions.

## Slices (implementation order: 1 blocks 3/4/5/6; 2 blocks 4/5; 3 and 6 need only 1)

1. Regenerate tokens + restyle shared UI primitives (Button/Input/Label pill shape)
2. Store a deterministic color on Category
3. Restyle hero and container surfaces (RemainingBudgetDisplay, EditHouseholdPage)
4. Restyle ExpenseList as category-colored card rows
5. Replace category `<input list>` with a colored-chip combobox
6. Illustration treatment for onboarding and empty states
