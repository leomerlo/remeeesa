import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'

export type FilterTab<T extends string> = {
  readonly value: T
  readonly label: string
}

export type FilterTabsProps<T extends string> = {
  readonly label: string
  readonly value: T
  readonly tabs: readonly FilterTab<T>[]
  readonly onChange: (value: T) => void
  readonly className?: string
}

// The filter on a list screen: plain tabs on a baseline, the selected one
// underlined.
//
// This is the third try. It was a segmented control -- a filled track with
// three pills in it -- which was too heavy: three labels at full contrast
// competing with the rows they filter, for a control usually left on
// "Todos". Then a select, which was quiet but hid two of the three options
// behind a tap. Tabs say all three, at the weight of a label rather than a
// button, and the underline is the whole of the selected state. Per direct
// feedback.
//
// The container's own rule is the baseline the tabs sit on, and it doubles
// as the line closing the toolbar above the list.
export function FilterTabs<T extends string>({
  label,
  value,
  tabs,
  onChange,
  className,
}: FilterTabsProps<T>): ReactElement {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'border-border-subtle flex w-full items-stretch gap-6 border-b',
        className,
      )}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              onChange(tab.value)
            }}
            className={cn(
              // -mb-px pulls each tab's own border onto the container's, so
              // the selected one replaces that segment of the baseline
              // rather than drawing a second line under it.
              'focus-visible:ring-ring/50 -mb-px min-h-11 border-b-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-3',
              selected
                ? 'border-foreground text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
