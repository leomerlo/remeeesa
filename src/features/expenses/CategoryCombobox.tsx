import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { cssVars } from '@/lib/cssVars'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Category } from '@/lib/expenses'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import type { LucideIcon } from 'lucide-react'

export type CategoryComboboxProps = {
  readonly id: string
  readonly categories: readonly Category[]
  readonly value: string
  readonly onChange: (value: string) => void
  // Without a hint this reads as an unlabelled box floating between
  // "Categoría" and the field below it.
  readonly placeholder?: string
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

// The category's colour and icon, the same pair it carries on every
// movement row -- so picking one here looks like the thing you will see
// afterwards, not a generic list entry.
// The icon arrives as a prop rather than being resolved from the name in
// here: react-hooks/static-components reads a component resolved inside a
// component body as a component created during render.
function CategorySwatch({
  CategoryIcon,
  color,
}: {
  readonly CategoryIcon: LucideIcon
  readonly color: string
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--swatch-color)]"
      style={cssVars({ '--swatch-color': color })}
    >
      <CategoryIcon className="size-3.5 text-white" aria-hidden="true" />
    </span>
  )
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
//
// This is the only category control on every form -- the scrollable row of
// category pills that used to sit above it is gone (per direct feedback: one
// control, not two that set the same field). Anything typed that matches no
// existing category is created on submit, so the same box both picks and
// creates.
export function CategoryCombobox({
  id,
  categories,
  value,
  onChange,
  placeholder,
}: CategoryComboboxProps): ReactElement {
  const listboxId = `${id}-listbox`
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const optionRefs = useRef<(HTMLLIElement | null)[]>([])
  const anchorRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => filterCategories(categories, value),
    [categories, value],
  )
  const selectedCategory = findMatchingCategory(categories, value) ?? null

  // Keep the keyboard-highlighted option visible: the popup scrolls
  // (`max-h-60 overflow-y-auto`), and arrow-key navigation alone doesn't
  // bring a highlighted option that's past the fold into view.
  useEffect(() => {
    if (activeIndex < 0) {
      return
    }
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, open])

  // The input sits outside the popup (it is the anchor, not the content),
  // so every interaction with it counts as "outside" to Radix's dismiss
  // layer. On a touch screen that layer defers the outside-pointerdown to
  // the following `click` -- which is the same tap that just opened the
  // list, so the list opened and closed again within the one tap and there
  // was never a moment to pick an existing category.
  function isInsideAnchor(target: EventTarget | null): boolean {
    return (
      target instanceof Node && anchorRef.current?.contains(target) === true
    )
  }

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
        <div ref={anchorRef} className="relative w-full">
          {selectedCategory !== null ? (
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2">
              <CategorySwatch
                CategoryIcon={iconForCategoryName(selectedCategory.name)}
                color={selectedCategory.color}
              />
            </span>
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
            {...(placeholder === undefined ? {} : { placeholder })}
            value={value}
            className={selectedCategory !== null ? 'pl-10' : undefined}
            onChange={(event) => {
              onChange(event.target.value)
              setActiveIndex(-1)
              openList()
            }}
            onFocus={openList}
            // Focus alone is not enough: tapping a field that is already
            // focused fires no focus event, so the list would stay shut.
            onClick={openList}
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
        onPointerDownOutside={(event) => {
          if (isInsideAnchor(event.detail.originalEvent.target)) {
            event.preventDefault()
          }
        }}
        onFocusOutside={(event) => {
          if (isInsideAnchor(event.detail.originalEvent.target)) {
            event.preventDefault()
          }
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
                  'flex cursor-pointer items-center gap-2.5 rounded-full px-2.5 py-2 text-sm',
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
                <CategorySwatch
                  CategoryIcon={iconForCategoryName(category.name)}
                  color={category.color}
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
