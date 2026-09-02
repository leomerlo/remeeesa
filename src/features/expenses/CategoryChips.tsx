import type { ReactElement } from 'react'
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
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => {
        const Icon = iconForCategoryName(category.name)
        const isSelected = normalize(category.name) === selected
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => {
              // Tapping the selected chip clears it, so a mis-tap does not
              // strand the form on a category the user has to retype over.
              onChange(isSelected ? '' : category.name)
            }}
            className={cn(
              'focus-visible:ring-ring/50 flex h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3',
              isSelected
                ? 'border-transparent text-white'
                : 'border-border bg-background text-foreground',
            )}
            style={isSelected ? { backgroundColor: category.color } : undefined}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full',
                isSelected ? 'bg-white/25' : '',
              )}
              style={
                isSelected ? undefined : { backgroundColor: category.color }
              }
            >
              <Icon className="size-3.5 text-white" aria-hidden="true" />
            </span>
            {category.name}
          </button>
        )
      })}
    </div>
  )
}
