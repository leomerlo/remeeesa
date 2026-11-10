import { ChevronDown } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import {
  amountKeystroke,
  formatAmountForDisplay,
  parseStoredAmount,
} from '@/lib/money'
import { formatPesos } from './format'

// The form controls every sheet is built from. They exist so a field is
// written once rather than once per form, and so the rules that are easy
// to get subtly wrong -- a label really tied to its input, an amount read
// the way this country writes one -- are got right in one place.

export function Field({
  label,
  hint,
  children,
}: {
  readonly label: string
  readonly hint?: string
  readonly children: (id: string) => ReactNode
}): ReactElement {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint === undefined ? null : <span className="fhint">{hint}</span>}
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (next: string) => void
  readonly placeholder?: string
  readonly hint?: string
}): ReactElement {
  return (
    <Field label={label} {...(hint === undefined ? {} : { hint })}>
      {(id) => (
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  )
}

// Where an amount is typed. Every one of them in the beta is this, so a
// figure means the same thing wherever it is written.
//
// It separates the thousands as it is typed -- "250000" reads "250.000"
// while you are still typing it, like every other figure on screen -- and
// it reads a comma as the decimal point, the way this country writes one.
// A dot is a thousands separator, except when it is the decimal key a
// phone's number pad produced, which @/lib/money/amountText works out and
// explains at length; it had to be worked out, because getting it wrong
// means an amount silently off by a factor of ten or a hundred, which is
// exactly what "1.234,56" turning into 123.456 was.
//
// What it hands back is never the text on screen: it is the plain value
// ("1234.56"), so whatever stores or validates it just calls Number().
export function AmountInput({
  id,
  value,
  onChange,
  label,
  className,
  placeholder = '0',
  disabled = false,
}: {
  readonly id?: string
  // Plain and Number()-parseable, not the text on screen.
  readonly value: string
  readonly onChange: (raw: string) => void
  readonly label?: string
  readonly className?: string
  readonly placeholder?: string
  readonly disabled?: boolean
}): ReactElement {
  const ref = useRef<HTMLInputElement>(null)
  // Re-formatting on every keystroke moves the text under the cursor, and
  // a browser left to itself answers that by dropping the cursor at the
  // end of the field -- so typing into the middle of an amount throws you
  // out of it. This puts it back where the next keystroke belongs.
  const caret = useRef<number | null>(null)
  // Whether the comma on screen came from a "." typed by hand, which
  // the next keystroke may yet show to have been a thousands separator.
  const pendingDot = useRef(false)
  const display = formatAmountForDisplay(value)

  useLayoutEffect(() => {
    const at = caret.current
    if (at !== null && ref.current !== null) {
      ref.current.setSelectionRange(at, at)
      caret.current = null
    }
  }, [display])

  return (
    <input
      ref={ref}
      {...(id === undefined ? {} : { id })}
      {...(label === undefined ? {} : { 'aria-label': label })}
      {...(className === undefined ? {} : { className })}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      disabled={disabled}
      value={display}
      onChange={(event) => {
        const next = amountKeystroke({
          typed: event.target.value,
          caret: event.target.selectionStart ?? event.target.value.length,
          previousDisplay: display,
          pendingDot: pendingDot.current,
        })
        caret.current = next.caret
        pendingDot.current = next.pendingDot
        onChange(next.raw)
      }}
    />
  )
}

// An amount in one currency, which is most of them: the sign is fixed and
// the figure is the big thing on the form. The shape below is the same
// field with the currency chosen instead of fixed.
export function MoneyField({
  label,
  value,
  onChange,
  prefix = '$',
  hint,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (next: string) => void
  readonly prefix?: string
  readonly hint?: string
}): ReactElement {
  return (
    <Field label={label} {...(hint === undefined ? {} : { hint })}>
      {(id) => (
        <div className="money-in">
          <span className="pre" aria-hidden="true">
            {prefix}
          </span>
          <AmountInput id={id} value={value} onChange={onChange} />
        </div>
      )}
    </Field>
  )
}

// The amount, with the currency as its prefix rather than as a question of
// its own underneath. Two controls on one line: the sign is part of the
// figure, and asking "¿pesos o dólares?" in a separate field made the one
// number on the form look like the smallest thing on it.
export function MoneyRow({
  label,
  amount,
  onAmount,
  currency,
  onCurrency,
  currencies,
  hint,
}: {
  readonly label: string
  readonly amount: string
  readonly onAmount: (next: string) => void
  readonly currency: string
  readonly onCurrency: (next: string) => void
  readonly currencies: readonly {
    readonly value: string
    readonly label: string
  }[]
  readonly hint?: string
}): ReactElement {
  return (
    <Field label={label} {...(hint === undefined ? {} : { hint })}>
      {(id) => (
        <div className="money-in withcur">
          <select
            className="cur"
            aria-label="Moneda"
            value={currency}
            onChange={(event) => onCurrency(event.target.value)}
          >
            {currencies.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <AmountInput id={id} value={amount} onChange={onAmount} />
        </div>
      )}
    </Field>
  )
}

// What a money field is worth. The field hands back a plain value, and
// this still reads a written one ("1.234,56") -- see parseStoredAmount: a
// figure saved before the field knew how to format itself is still out
// there, in a month's projection.
export function moneyValue(text: string): number {
  return parseStoredAmount(text)
}

// Blank is allowed only where the amount is genuinely not known yet -- a
// variable bill whose figure has not arrived. Everywhere else a number is
// required, and it has to be one.
export function moneyIsValid(text: string, { required = true } = {}): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return !required
  const parsed = parseStoredAmount(trimmed)
  return Number.isFinite(parsed) && parsed > 0
}

// A whole-peso amount shown back to someone, for a hint under a field.
export function pesos(value: number): string {
  return `$${formatPesos(value)}`
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (next: string) => void
  readonly options: readonly {
    readonly value: string
    readonly label: string
  }[]
  readonly hint?: string
}): ReactElement {
  return (
    <Field label={label} {...(hint === undefined ? {} : { hint })}>
      {(id) => (
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

export function DateField({
  label,
  value,
  onChange,
}: {
  readonly label: string
  // ISO yyyy-mm-dd, which is what a date input speaks.
  readonly value: string
  readonly onChange: (next: string) => void
}): ReactElement {
  return (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  )
}

// One of several, each saying what it means. A list of these rather than a
// select wherever the choice changes what happens -- paying with a credit
// card is not the same event as paying in cash, and a dropdown hides that.
export function OptionList<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  readonly label: string
  readonly value: T
  readonly onChange: (next: T) => void
  readonly options: readonly {
    readonly value: T
    readonly k: string
    readonly v?: string
  }[]
}): ReactElement {
  return (
    <div className="field">
      <span className="flabel">{label}</span>
      <div className="opts" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            className="opt"
            aria-checked={option.value === value}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            <span className="mark" aria-hidden="true" />
            <span className="k">{option.k}</span>
            {option.v === undefined ? null : (
              <span className="v">{option.v}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// One of several, each with its own mark: a dropdown rather than a list of
// big radios, because a household has four or five ways of paying and the
// list was taking more of the form than the amount was.
//
// It opens downward into the form instead of floating over it: the sheet's
// body is what scrolls, and anything floating inside a scrolling box is cut
// off by it.
export function PickField({
  label,
  value,
  onChange,
  options,
  hint,
  disabled = false,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (next: string) => void
  readonly options: readonly {
    readonly value: string
    readonly k: string
    readonly v?: string
    // Drawn by whoever knows what this choice looks like -- a card's own
    // logo, a banknote for cash.
    readonly mark?: ReactNode
  }[]
  readonly hint?: string
  readonly disabled?: boolean
}): ReactElement {
  const [open, setOpen] = useState(false)
  const id = useId()
  const chosen = options.find((option) => option.value === value) ?? options[0]
  return (
    <div
      className="field pick"
      onBlur={(event) => {
        // Tapping anywhere outside shuts it, the way a real dropdown does
        // -- but a tap that lands on one of its own options is not
        // outside, so the pick still registers.
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <span className="flabel" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        // "flat" when the chosen option has no second line: the mark spans
        // both rows of the grid, so with an empty second row the single
        // line of text sat above the middle of the logo beside it.
        className={chosen?.v === undefined ? 'picked flat' : 'picked'}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen((current) => !current)}
      >
        {chosen?.mark === undefined ? null : (
          <span className="mk" aria-hidden="true">
            {chosen.mark}
          </span>
        )}
        <span className="k" id={`${id}-value`}>
          {chosen?.k ?? ''}
        </span>
        {chosen?.v === undefined ? null : <span className="v">{chosen.v}</span>}
        <span className="ch" aria-hidden="true">
          <ChevronDown />
        </span>
      </button>
      {open ? (
        <div
          className="picklist"
          role="listbox"
          aria-labelledby={`${id}-label`}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              className={option.v === undefined ? 'pickopt flat' : 'pickopt'}
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.mark === undefined ? null : (
                <span className="mk" aria-hidden="true">
                  {option.mark}
                </span>
              )}
              <span className="k">{option.k}</span>
              {option.v === undefined ? null : (
                <span className="v">{option.v}</span>
              )}
            </button>
          ))}
        </div>
      ) : null}
      {hint === undefined ? null : <span className="fhint">{hint}</span>}
    </div>
  )
}

// The same list, but you can pick more than one -- which is what "¿cómo
// pagan las cosas?" is: a household uses three of the four. Checkboxes
// rather than radios, so a screen reader says "marcado" and not "elegido".
export function MultiOptionList<T extends string>({
  label,
  chosen,
  onToggle,
  options,
}: {
  readonly label: string
  readonly chosen: readonly T[]
  readonly onToggle: (value: T) => void
  readonly options: readonly {
    readonly value: T
    readonly k: string
    readonly v?: string
  }[]
}): ReactElement {
  return (
    <div className="field">
      <span className="flabel">{label}</span>
      <div className="opts multi" role="group" aria-label={label}>
        {options.map((option) => {
          const on = chosen.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              className="opt"
              aria-checked={on}
              aria-pressed={on}
              onClick={() => onToggle(option.value)}
            >
              <span className="mark" aria-hidden="true" />
              <span className="k">{option.k}</span>
              {option.v === undefined ? null : (
                <span className="v">{option.v}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// A yes/no that says what saying yes means.
export function Toggle({
  k,
  v,
  checked,
  onChange,
  disabled = false,
}: {
  readonly k: string
  readonly v: string
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
  // Shown but not answerable yet, because another answer has to come
  // first. Held shut rather than hidden, so the question does not appear
  // out of nowhere once it becomes askable.
  readonly disabled?: boolean
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="swrow"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="k">{k}</span>
      <span className="v">{v}</span>
      <span className="tg" aria-hidden="true">
        <i />
      </span>
    </button>
  )
}

// What a form says when it cannot be saved yet, in the household's own
// words rather than a code.
export function Problem({
  children,
}: {
  readonly children: ReactNode
}): ReactElement {
  return (
    <p className="fproblem" role="alert">
      {children}
    </p>
  )
}
