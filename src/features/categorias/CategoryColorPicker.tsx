import type { ReactElement } from 'react'
import { Check } from 'lucide-react'
import { cssVars } from '@/lib/cssVars'
import { CATEGORY_COLOR_PALETTE } from '@/lib/expenses'

export type CategoryColorPickerProps = {
  readonly value: string
  readonly onChange: (color: string) => void
  readonly disabled?: boolean
}

// A radiogroup rather than eight buttons: arrow keys move between swatches and
// only the selected one is a tab stop, which is what a screen reader user
// expects from "pick one of these" and what eight tab stops would not give.
export function CategoryColorPicker({
  value,
  onChange,
  disabled = false,
}: CategoryColorPickerProps): ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label="Color de la categoría"
      className="flex flex-wrap gap-3"
    >
      {CATEGORY_COLOR_PALETTE.map((color) => {
        const selected = color === value
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Color ${color}`}
            disabled={disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(color)
            }}
            className="focus-visible:ring-ring/50 flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-3 disabled:opacity-50 bg-[var(--swatch-color)]"
            style={cssVars({ '--swatch-color': color })}
          >
            {selected ? (
              <Check className="size-5 text-white" aria-hidden="true" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
