import { createElement } from 'react'
import type { ReactElement } from 'react'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'

// A category is a solid disc of its own colour with a white icon, the way
// the v1 draws it: the palette holds every swatch under the lightness where
// white stops clearing 3:1, which is what buys one ink for all twenty.
//
// createElement rather than binding the icon to a capitalised const: the
// name is only known at render time, and assigning it reads to the linter
// as defining a component inside another one.
export function CategoryTile({
  name,
  color,
}: {
  readonly name: string
  readonly color: string
}): ReactElement {
  return (
    <span
      className="tile"
      style={{ background: color, color: '#fff' }}
      aria-hidden="true"
    >
      {createElement(iconForCategoryName(name))}
    </span>
  )
}
