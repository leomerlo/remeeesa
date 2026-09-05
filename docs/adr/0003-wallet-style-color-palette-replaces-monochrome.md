---
status: superseded in part by 0005
---

# Wallet-style color palette replaces the monochrome design system

`bootstrap-stack.md`'s acceptance criteria committed the app to a monochrome, near
black-and-white palette (oklch chroma 0 throughout `index.css`, modeled on the "mibu"
reference at `docs/design/design-reference.png`), with color reserved for small accents only.

As part of a usability/functionality review (2026-08-31), we're moving the visual direction to a
"wallet" aesthetic in the style of MercadoPago: real color, not accents — most visibly, each
Category gets its own color so expenses are recognizable at a glance, the way MercadoPago's
category icons work. This supersedes `bootstrap-stack.md`'s monochrome constraint and
`design-reference.png`'s role as the visual source of truth for color. The `design-tokens` skill
(added by the ai_workflow_template sync) generates a token system from a primary color + font,
which is the intended path to build the new palette once those are chosen.

## Shape language (resolved)

The old system used a single radius token (`--radius: 9999px`) applied everywhere — every
control and every container was a full stadium pill. That's replaced by two levels:

- **Pill/stadium** (full radius): buttons, badges/status chips, category tags, inputs.
- **Moderate rounded corners** (~20px, i.e. `rounded-2xl`/`rounded-3xl`): cards and containers —
  the balance card, transaction group cards, the card-detail surface.

A full pill on a large content container reads wrong once containers become filled/gradient
cards rather than flat list rows; a moderate radius is what the reference mockup uses for those
surfaces.

## Primary color and mood (resolved)

Reference: a fintech wallet mockup supplied during the review (onboarding screen, home balance
screen, card-detail screen). Direction: **fun, young, jovial** — the opposite pole from
`bootstrap-stack.md`'s "minimal, confident, slightly playful" monochrome tone.

- **Primary color**: violet/purple (~`#7B5CFA`), used as a gradient (violet → lighter
  lavender-pink, ~`#C4B5FD`) on hero surfaces (balance card, onboarding).
- Semi-3D illustrations for onboarding/empty states (coins, card), not the old flat single-line
  hand-drawn style.
- Each Category gets its own solid color, shown as a filled circular icon leading each
  transaction row (not an emoji-on-white icon).
- Status is communicated via small filled pill badges (e.g. green "Success", red "Failed").
- Balance stays a large, bold, high-contrast numeral (this part carries over unchanged from the
  old direction).

`design-tokens` will generate the full layered scale from this primary color and Geist Variable
(kept as-is — already integrated, and the fun/young/jovial tone is carried by color and
illustration, not typeface).

## Implementation posture (resolved)

This is a full rebuild, not an incremental patch. Nothing about matching today's markup/CSS
structure is a constraint — where the reference mockup calls for a different structure (card
layout, gradient surfaces, icon treatment, spacing) than what exists today, rebuild the component
from zero rather than adapting the old one. No old-system styling code (classes, one-off
inline styles, structural assumptions built around the monochrome/pill-everywhere system) should
survive in a component once it's been redesigned. The only things that must survive a rebuild are
behavior and accessibility (what a component does, its accessible name/role/label) — never its
old visual implementation. Every remaining visual ticket in this feature (#62-65) should be read
with this posture, not as a minimal-diff restyle.
