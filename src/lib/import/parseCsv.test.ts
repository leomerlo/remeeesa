import { describe, expect, it } from 'vitest'
import { parseCsv } from './parseCsv'

describe('parseCsv', () => {
  it('reads the dialect the exporter writes: BOM, semicolons, CRLF', () => {
    const file = '﻿Fecha;Movimiento\r\n24/11/2026;Farmacia\r\n'
    const { columns, rows } = parseCsv(file)
    expect(columns).toEqual(['fecha', 'movimiento'])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.cells.get('movimiento')).toBe('Farmacia')
  })

  it('matches a header whatever its accents and case', () => {
    const { columns } = parseCsv('CATEGORÍA;Débito Automático\nCafé;no\n')
    expect(columns).toEqual(['categoria', 'debito automatico'])
  })

  it('keeps a semicolon and a line break inside a quoted field', () => {
    const file =
      'Movimiento;Comentario\n' + 'Super;"dos cosas; una\nlínea más"\n'
    const [row] = parseCsv(file).rows
    expect(row?.cells.get('comentario')).toBe('dos cosas; una\nlínea más')
  })

  it('unescapes a doubled quote, which is how a quote survives', () => {
    const [row] = parseCsv('Categoría\n"Casa ""vieja"""\n').rows
    expect(row?.cells.get('categoria')).toBe('Casa "vieja"')
  })

  it('skips the empty rows a spreadsheet leaves at the end', () => {
    const { rows } = parseCsv('Movimiento\nCafé\n;;\n\n')
    expect(rows).toHaveLength(1)
  })

  it('counts lines as the spreadsheet does, header included', () => {
    const { rows } = parseCsv('Movimiento\nCafé\nSuper\n')
    expect(rows.map((row) => row.line)).toEqual([2, 3])
  })

  it('has nothing to say about an empty file', () => {
    expect(parseCsv('')).toEqual({ columns: [], rows: [] })
  })
})
