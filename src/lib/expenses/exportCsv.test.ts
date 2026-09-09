import { describe, expect, it } from 'vitest'
import type { Expense } from './types'
import type { ExportableExpense } from './exportCsv'
import { csvFileNameForMonth, expensesToCsv } from './exportCsv'

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    householdId: 'h1',
    categoryId: 'c1',
    memberId: 'user-1',
    authorDisplayName: 'Jlors',
    name: 'Super',
    price: 1234.5,
    comments: '',
    expenseDate: new Date(2026, 8, 4),
    pendienteId: null,
    isService: false,
    createdAt: new Date(2026, 8, 4),
    ...overrides,
  }
}

function row(overrides: Partial<ExportableExpense> = {}): ExportableExpense {
  return {
    expense: expense(),
    categoryName: 'Comida',
    authorDisplayName: 'Jlors',
    isServicio: false,
    ...overrides,
  }
}

// The BOM is invisible but load-bearing: without it Excel reads the file as
// its legacy codepage and every accent breaks, starting with the header's
// own "Categoría".
const BOM = '﻿'

function lines(csv: string): string[] {
  return csv.replace(BOM, '').trimEnd().split('\r\n')
}

describe('expensesToCsv', () => {
  it('leads with a header naming every column', () => {
    expect(lines(expensesToCsv([]))[0]).toBe(
      'Fecha;Movimiento;Categoría;Tipo;Monto;Cargado por;Comentario',
    )
  })

  it('writes a movement as one row', () => {
    expect(lines(expensesToCsv([row()]))[1]).toBe(
      '04/09/2026;Super;Comida;Gasto;1234,50;Jlors;',
    )
  })

  it('says which movements are servicios', () => {
    expect(lines(expensesToCsv([row({ isServicio: true })]))[1]).toContain(
      ';Servicio;',
    )
  })

  it('writes amounts with a comma, so an es-AR spreadsheet reads them as numbers', () => {
    const csv = expensesToCsv([row({ expense: expense({ price: 1234567.5 }) })])
    expect(lines(csv)[1]).toContain(';1234567,50;')
    // No thousands grouping: a "1.234.567,50" would need quoting and tends
    // to land as text.
    expect(csv).not.toContain('1.234.567')
  })

  it('always writes two decimals, including on a round amount', () => {
    expect(
      lines(expensesToCsv([row({ expense: expense({ price: 62000 }) })]))[1],
    ).toContain(';62000,00;')
  })

  it('quotes a field that would otherwise break the row apart', () => {
    const csv = expensesToCsv([
      row({
        expense: expense({ name: 'Super; el grande', comments: 'con\nsalto' }),
        categoryName: 'Casa "vieja"',
      }),
    ])
    expect(csv).toContain('"Super; el grande"')
    expect(csv).toContain('"Casa ""vieja"""')
    expect(csv).toContain('"con\nsalto"')
  })

  it('starts with a byte-order mark so Excel reads it as UTF-8', () => {
    expect(expensesToCsv([]).startsWith(BOM)).toBe(true)
  })

  it('ends every row with CRLF, including the last', () => {
    expect(expensesToCsv([row()]).endsWith('\r\n')).toBe(true)
  })
})

describe('csvFileNameForMonth', () => {
  it('names the file so a folder of them sorts chronologically', () => {
    expect(csvFileNameForMonth(new Date(2026, 8, 1))).toBe(
      'remeeesa-2026-09.csv',
    )
    expect(csvFileNameForMonth(new Date(2026, 11, 1))).toBe(
      'remeeesa-2026-12.csv',
    )
  })
})
