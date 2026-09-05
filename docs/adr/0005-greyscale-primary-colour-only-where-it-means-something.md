---
status: accepted
---

# Greyscale primary; colour only where it carries meaning

ADR-0003 moved the app off a monochrome palette onto a "wallet" aesthetic built around a violet
primary (`#7B5CFA`), with real colour rather than accents. That decision holds for what it was
actually for: a colour per Category, so an expense is recognisable at a glance.

What it did not anticipate is how much *other* meaningful colour the app grew afterwards — green
and amber for paid vs pending, wine for a budget running out and for a bill about to come due, a
badge in each category's own colour on every row. On top of all of that, a violet button, a
violet link, a violet focus ring and a lavender page ground were one more colour competing with
the ones that mean something, and the primary was the loudest thing on screen while saying the
least.

## Decision

The action roles are greyscale. `--surface-action` is near-black (grey-900), and `--text-action`,
`--icon-action`, `--border-action` and `--border-focus` follow it. `--surface-page` drops its
lavender tint for the neutral one. The budget hero card starts charcoal instead of violet and
still warms toward wine as the month's budget goes, so the only colour on it is the warning.

Colour is left to the things that carry information:

- each Category's own colour, on its icon disc and its badge
- green and amber, for what is paid against what is still pending
- wine, for a budget at its limit and for a bill about to come due

The violet ramp stays in the Primitive layer, ADR-0003's `#7B5CFA` untouched at `purple-400`.
Nothing points at it any more. It is left in place because the app icon and the installed PWA's
theme colour are still that violet, and because reversing this is then a matter of repointing
about ten semantic tokens rather than rebuilding a scale.

## Consequences

- The app reads as neutral with meaningful colour on it, rather than as a violet app with
  meaningful colour fighting the violet.
- Contrast improves rather than regresses: near-black on the page is far past AA where the violet
  needed darkening to reach it at all (see `src/lib/a11y/tokens.test.ts`, which still gates every
  pair).
- The brand is now carried by the mascot, the wordmark and the app icon rather than by a fill
  colour repeated on every control.
