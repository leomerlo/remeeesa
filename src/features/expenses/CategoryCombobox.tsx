import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Category } from '@/lib/expenses'

export type CategoryComboboxProps = {
  readonly id: string
  readonly categories: readonly Category[]
  readonly value: string
  readonly onChange: (value: string) => void
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function findMatchingCategory(
  categories: readonly Category[],
  value: string,
): Category | undefined {
  const normalized = normalize(value)
  if (normalized === '') {
    return undefined
  }
  return categories.find((category) => normalize(category.name) === normalized)
}

function filterCategories(
  categories: readonly Category[],
  value: string,
): readonly Category[] {
  const normalized = normalize(value)
  if (normalized === '') {
    return categories
  }
  return categories.filter((category) =>
    category.name.toLowerCase().includes(normalized),
  )
}

// Hand-rolled combobox: role="combobox" lives on the actual text input (the
// modern ARIA 1.2 pattern), so free typing keeps working exactly like the old
// `<input list>` while a Popover.Content renders the filtered options as a
// role="listbox". Popover.Trigger is intentionally not used — its click-only
// open semantics don't fit typing-to-filter, so `open` is controlled directly
// from input focus/change/keydown, and Popover.Anchor only supplies
// positioning. Selecting an option never blurs the input (mousedown on each
// option is prevented) so focus, and screen reader context, never jumps away.
export function CategoryCombobox({
  id,
  categories,
  value,
  onChange,
}: CategoryComboboxProps): ReactElement {
  const listboxId = `${id}-listbox`
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const optionRefs = useRef<(HTMLLIElement | null)[]>([])

  const filtered = useMemo(
    () => filterCategories(categories, value),
    [categories, value],
  )
  const selectedColor = findMatchingCategory(categories, value)?.color ?? null

  // Keep the keyboard-highlighted option visible: the popup scrolls
  // (`max-h-60 overflow-y-auto`), and arrow-key navigation alone doesn't
  // bring a highlighted option that's past the fold into view.
  useEffect(() => {
    if (activeIndex < 0) {
      return
    }
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, open])

  function optionId(index: number): string {
    return `${listboxId}-option-${String(index)}`
  }

  function openList(): void {
    setOpen(true)
  }

  function closeList(): void {
    setOpen(false)
    setActiveIndex(-1)
  }

  function selectCategory(category: Category): void {
    onChange(category.name)
    closeList()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        openList()
        setActiveIndex(filtered.length === 0 ? -1 : 0)
        return
      }
      setActiveIndex((previous) =>
        filtered.length === 0 ? -1 : (previous + 1) % filtered.length,
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openList()
        setActiveIndex(filtered.length === 0 ? -1 : filtered.length - 1)
        return
      }
      setActiveIndex((previous) =>
        filtered.length === 0
          ? -1
          : (previous - 1 + filtered.length) % filtered.length,
      )
    } else if (event.key === 'Enter') {
      if (open) {
        const active = activeIndex >= 0 ? filtered[activeIndex] : undefined
        if (active !== undefined) {
          event.preventDefault()
          selectCategory(active)
        } else {
          // Free text: let Enter submit the form as usual, but don't leave
          // the suggestion list open underneath the now-cleared field.
          closeList()
        }
      }
    } else if (event.key === 'Escape') {
      // Radix's DismissableLayer also closes the popover on Escape (via a
      // capture-phase document listener that runs before this bubble-phase
      // handler), so `closeList` here is usually a harmless no-op repeat.
      // Kept explicit so Escape-closes-without-changing-value stays correct
      // even if the popover is ever driven a different way than
      // `onOpenChange`.
      if (open) {
        event.preventDefault()
        closeList()
      }
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          openList()
        } else {
          closeList()
        }
      }}
    >
      <PopoverAnchor asChild>
        <div className="relative w-full">
          {selectedColor !== null ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-2.5 -translate-y-1/2 rounded-full"
              style={{ backgroundColor: selectedColor }}
            />
          ) : null}
          <Input
            id={id}
            name={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && activeIndex >= 0 ? optionId(activeIndex) : undefined
            }
            autoComplete="off"
            value={value}
            className={selectedColor !== null ? 'pl-7' : undefined}
            onChange={(event) => {
              onChange(event.target.value)
              setActiveIndex(-1)
              openList()
            }}
            onFocus={openList}
            onKeyDown={onKeyDown}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        // Radix's PopoverContent defaults to role="dialog", which would wrap
        // the role="listbox" below in conflicting dialog semantics. This
        // popup is a suggestion list, not a dialog, so clear it — the
        // input's aria-controls points straight at the listbox.
        role={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
        }}
        className="max-h-60 overflow-y-auto p-1"
      >
        <ul id={listboxId} role="listbox" aria-label="Categorías">
          {filtered.length === 0 ? (
            <li className="px-2.5 py-1.5 text-sm text-muted-foreground">
              No hay categorías que coincidan
            </li>
          ) : (
            filtered.map((category, index) => (
              <li
                key={category.id}
                ref={(element) => {
                  optionRefs.current[index] = element
                }}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-full px-2.5 py-1.5 text-sm',
                  index === activeIndex && 'bg-muted text-foreground',
                )}
                onMouseEnter={() => {
                  setActiveIndex(index)
                }}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onClick={() => {
                  selectCategory(category)
                }}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="truncate">{category.name}</span>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
