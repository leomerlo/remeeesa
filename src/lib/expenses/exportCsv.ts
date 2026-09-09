import type { Expense } from './types'

export type ExportableExpense = {
  readonly expense: Expense
  readonly categoryName: string
  readonly authorDisplayName: string
  readonly isServicio: boolean
}

// A field is quoted whenever it contains something that would otherwise
// break the row apart: the delimiter, a quote, or a line break. Doubling an
// inner quote is the CSV escape, per RFC 4180 -- a category called
// `Casa "vieja"` has to survive the trip.
//
// A plain comma is not on that list, deliberately: the delimiter here is a
// semicolon, and every amount carries a comma for its decimals. Quoting on
// commas would wrap every single amount in quotes, which is exactly what
// makes a spreadsheet read them as text instead of numbers.
function csvField(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

const HEADER = [
  'Fecha',
  'Movimiento',
  'Categoría',
  'Tipo',
  'Monto',
  'Cargado por',
  'Comentario',
] as const

// dd/mm/yyyy, matching what the app shows, rather than an ISO date: this
// file is opened in a spreadsheet by the person who read the screen.
function csvDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear())}`
}

// Comma as the decimal separator and no thousands grouping: es-AR
// spreadsheets read "1234,56" as a number, and a grouped "1.234,56" would
// have to be quoted and then often lands as text.
function csvAmount(amount: number): string {
  return amount.toFixed(2).replace('.', ',')
}

// The month's movements as a spreadsheet.
//
// Semicolon-separated, not comma: the amounts use a comma for their
// decimals, which is what an es-AR spreadsheet expects, and a comma
// delimiter alongside that means every amount has to be quoted and any
// mistake silently splits a row. Semicolon is what Excel in a Spanish
// locale defaults to anyway.
//
// A BOM leads the file so Excel opens it as UTF-8 rather than mangling
// every accent -- "Categoría" is in the header itself.
export function expensesToCsv(rows: readonly ExportableExpense[]): string {
  const lines = [HEADER.join(';')]
  for (const row of rows) {
    lines.push(
      [
        csvDate(row.expense.expenseDate),
        row.expense.name,
        row.categoryName,
        row.isServicio ? 'Servicio' : 'Gasto',
        csvAmount(row.expense.price),
        row.authorDisplayName,
        row.expense.comments,
      ]
        .map(csvField)
        .join(';'),
    )
  }
  return `﻿${lines.join('\r\n')}\r\n`
}

// "remeeesa-2026-09.csv" -- sorts chronologically in a folder, which a
// month name would not.
export function csvFileNameForMonth(monthStart: Date): string {
  const month = String(monthStart.getMonth() + 1).padStart(2, '0')
  return `remeeesa-${String(monthStart.getFullYear())}-${month}.csv`
}
