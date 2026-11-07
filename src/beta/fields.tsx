import type { ReactElement, ReactNode } from 'react'
import { useId } from 'react'
import { formatPesos, parseTyped } from './format'

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

// An amount, written and read the way this country writes one: dots
// between thousands, a comma before cents.
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
          <input
            id={id}
            value={value}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      )}
    </Field>
  )
}

// What a money field is worth.
export function moneyValue(text: string): number {
  return parseTyped(text)
}

// Blank is allowed only where the amount is genuinely not known yet -- a
// variable bill whose figure has not arrived. Everywhere else a number is
// required, and it has to be one.
export function moneyIsValid(text: string, { required = true } = {}): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return !required
  const parsed = parseTyped(trimmed)
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
