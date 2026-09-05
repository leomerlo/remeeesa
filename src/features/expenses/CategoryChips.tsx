import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { cssVars } from '@/lib/cssVars'
import { cn } from '@/lib/utils'
import type { Category } from '@/lib/expenses'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'

export type CategoryChipsProps = {
  readonly categories: readonly Category[]
  readonly value: string
  readonly onChange: (name: string) => void
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

// The household's existing categories as one tap each, carrying the colour
// and icon they already have everywhere else in the app. The freeform text
// field stays below for a genuinely new name -- but typing out "Servicios"
// every single time, into a box that looked identical to "Comentario", was
// the slowest part of adding an expense.
export function CategoryChips({
  categories,
  value,
  onChange,
}: CategoryChipsProps): ReactElement | null {
  if (categories.length === 0) {
    return null
  }

  const selected = normalize(value)

  return (
    // One scrollable row instead of wrapping -- per direct feedback, a
    // household with enough categories to wrap onto several lines pushed
    // the rest of the form down further than a swipeable row does.
    // Scrollbar hidden: the row itself, plus a partially-cut-off chip at
    // the edge, is the affordance.
    <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {categories.map((category) => {
        const Icon = iconForCategoryName(category.name)
        const isSelected = normalize(category.name) === selected
        return (
          <Button
            key={category.id}
            type="button"
            aria-pressed={isSelected}
            variant={isSelected ? 'default' : 'outline'}
            onClick={() => {
              // Tapping the selected chip clears it, so a mis-tap does not
              // strand the form on a category the user has to retype over.
              onChange(isSelected ? '' : category.name)
            }}
            // A chip is the secondary button with one difference: selected,
            // it fills with the category's own colour rather than the
            // action colour, so a row of them reads as the palette it is.
            className={cn(
              'shrink-0 gap-2 px-3',
              isSelected && 'border-transparent bg-[var(--swatch-color)]',
            )}
            style={cssVars({ '--swatch-color': category.color })}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full',
                // On a selected chip the colour is already the chip itself,
                // so the disc reads as a lighter well in it rather than a
                // second block of the same colour.
                isSelected ? 'bg-white/25' : 'bg-[var(--swatch-color)]',
              )}
            >
              <Icon className="size-3.5 text-white" aria-hidden="true" />
            </span>
            {category.name}
          </Button>
        )
      })}
    </div>
  )
}
