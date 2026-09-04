# Redesign to a wallet-style visual system

As a household member, I want the app to look and feel like a modern wallet app (colorful,
playful, MercadoPago-inspired) instead of the current strict monochrome, so that it's fun to use
day to day and expenses are recognizable at a glance by category color.

## Context

The app currently follows a monochrome, near-black-and-white design system (see
`bootstrap-stack.md`'s "Visual style reference" — now superseded, see
[ADR-0003](../adr/0003-wallet-style-color-palette-replaces-monochrome.md)). This story replaces
that system with a colorful "wallet" visual language and restyles the screens/components that
exist today to match. It does not add new screens or functionality — that's covered by
`navigation-shell.md` and later stories; this is a like-for-like restyle of what's already built
(`RemainingBudgetDisplay`, `AddExpenseForm`, `ExpenseList`, `OnboardingForm`,
`EditHouseholdPage`, and the shared `button`/`input`/`label` components).

## Acceptance criteria

- [ ] The design token system (`src/index.css`) is regenerated via the `design-tokens` skill
      from a violet/purple primary color (~`#7B5CFA`) and the existing Geist Variable font,
      producing a full layered scale (primitive → semantic → responsive) rather than the current
      flat monochrome (oklch chroma 0) tokens.
- [ ] Hero surfaces (the remaining-budget display) use a gradient from the primary violet to a
      lighter lavender-pink (~`#C4B5FD`), not a flat fill.
- [ ] Shape language has two levels instead of one shared `--radius: 9999px`: buttons, badges,
      status chips, category tags, and inputs stay full pill/stadium; cards and containers (the
      budget display, expense rows once restyled as cards, the household page) use a moderate
      radius (`rounded-2xl`/`rounded-3xl`), not a full pill.
- [ ] `Category` gains a stored `color` field, set once at creation time by hashing the
      category's name against a fixed palette (not recomputed on the fly on every render) — no
      manual color picker in this story, but storing it (rather than deriving it purely from the
      current name) is what lets `categorias-desglose-y-gestion.md` add a manual override later
      as a simple field update, and means a later rename never silently changes the color.
- [ ] `ExpenseList` is restyled to show each expense as a card-style row: a leading colored
      circular icon for the expense's category, the expense name and price with clear visual
      hierarchy (price emphasized), and category/date/author as smaller muted text — replacing
      the current plain stacked `<span>` layout.
- [ ] `AddExpenseForm`'s category field is replaced with a proper selectable control (e.g. a
      combobox/command menu showing existing categories as colored chips, with free-text entry
      still creating a new category) instead of a native `<input list>`/`<datalist>`.
- [ ] Onboarding (`OnboardingForm`) and any empty states (e.g. "no expenses this month") get a
      semi-3D illustration treatment in place of the current plain text, in keeping with the
      fun/young/jovial tone.
- [ ] All existing tests are updated to match the new markup/structure where they assert on it;
      no test asserts on styling classes directly (per this repo's testing conventions —
      behavior through public interfaces, not implementation details).
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` pass with the new system in place.

## Out of scope

- Any new screen, route, or functional capability (navigation restructure is
  `navigation-shell.md`; new features are their own stories).
- Manual category color override (categories only get the auto-assigned color in this story).
- Confetti/celebration micro-interactions and other `animate`-skill work tied to specific new
  actions (e.g. marking a Pendiente paid) — those land with the stories that introduce those actions.
- Dark mode.

## Open questions

- None outstanding.
