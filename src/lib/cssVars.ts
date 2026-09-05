import type { CSSProperties } from 'react'

// The only sanctioned way to get a runtime value into CSS.
//
// House rule: no component writes a style declaration inline. Anything that
// looks like styling -- a colour, a radius, a gradient -- belongs in a class,
// Tailwind or custom. But some values genuinely are not knowable until
// render: a category's colour is picked by the household, a progress bar's
// width is a percentage of a budget. Those are *data*, and this is how data
// crosses into CSS: the component sets a custom property, and a class reads
// it (`bg-[var(--swatch-color)]`). The declaration still lives in the class;
// only the value comes from JS.
//
// The cast is here, named and greppable, instead of at every call site --
// React's CSSProperties does not model custom properties.
export function cssVars(
  vars: Readonly<Record<`--${string}`, string>>,
): CSSProperties {
  return vars as CSSProperties
}
