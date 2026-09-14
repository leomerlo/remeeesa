import type { ReactElement } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from './input'
import { cn } from '@/lib/utils'

export type SearchInputProps = {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly label: string
  readonly placeholder?: string
  readonly className?: string
}

// The search box on the list screens. Filters as you type -- there is no
// submit, because there is nothing to submit to: the matching runs here, on
// rows already in hand.
export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
  className,
}: SearchInputProps): ReactElement {
  return (
    <div className={cn('relative w-full', className)}>
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        className="pr-11 pl-10"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
      {value === '' ? null : (
        // Its own control rather than relying on the browser's: Safari hides
        // the native one, and clearing the box is how you get back out of
        // searching and into the month you were reading.
        <button
          type="button"
          aria-label="Borrar búsqueda"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-3"
          onClick={() => {
            onChange('')
          }}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
