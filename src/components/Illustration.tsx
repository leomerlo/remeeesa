import type { ReactElement } from 'react'

export type IllustrationProps = {
  readonly src: string
  readonly className?: string
}

// Every illustration in this app sits next to text that already says the same
// thing ("Todavía no hay gastos", "Presupuesto restante"), so they are purely
// decorative: empty alt plus aria-hidden, rather than describing the same
// thing twice to a screen reader. Kept as one component so that stays true
// everywhere by construction instead of per call site.
//
// object-contain is not optional: call sites size these with both a width and
// a height (h-32 w-40 and friends) and the artwork is not that aspect ratio,
// so without it the mascot would stretch.
export function Illustration({
  src,
  className,
}: IllustrationProps): ReactElement {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      decoding="async"
      className={
        className === undefined
          ? 'object-contain'
          : `object-contain ${className}`
      }
    />
  )
}
