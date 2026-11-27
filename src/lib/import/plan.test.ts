import { describe, expect, it } from 'vitest'
import type { Card as PaymentMethod } from '@/lib/cards'
import type { Category } from '@/lib/expenses'
import { planImport, readAmount, readDate } from './plan'

const CATEGORIES = [
  { id: 'cat-cafe', name: 'Café' },
  { id: 'cat-super', name: 'Super' },
] as unknown as Category[]

const METHODS = [
  {
    id: 'card-visa',
    name: 'Visa CRÉDITO Santander FLOR',
    kind: 'credito',
    currency: 'BOTH',
  },
  {
    id: 'card-debito',
    name: 'Visa Débito Santander',
    kind: 'debito',
    currency: 'ARS',
  },
] as unknown as PaymentMethod[]

const HEAD =
  'Fecha;Movimiento;Categoría;Monto;Moneda;Método;Pagado;Todos los meses;Débito automático;Cuotas;Comentario'

function plan(...lines: string[]) {
  return planImport({
    text: [HEAD, ...lines].join('\n'),
    categories: CATEGORIES,
    methods: METHODS,
  })
}

describe('readAmount', () => {
  it('reads the es-AR amounts the exporter writes', () => {
    expect(readAmount('80.350,72')).toBe(80350.72)
    expect(readAmount('1234,56')).toBe(1234.56)
  })

  it('reads a bare thousands group as thousands, not as a decimal', () => {
    expect(readAmount('104.500')).toBe(104500)
  })

  it('still reads a file written in English', () => {
    expect(readAmount('1234.56')).toBe(1234.56)
  })

  it('ignores the currency sign and the spaces around it', () => {
    expect(readAmount('$ 26.300')).toBe(26300)
    expect(readAmount('U$S 20,00')).toBe(20)
  })

  it('refuses what is not a number', () => {
    expect(readAmount('veinte')).toBeNull()
    expect(readAmount('')).toBeNull()
  })
})

describe('readDate', () => {
  it('reads dd/mm/yyyy at midday, so it cannot drift to the day before', () => {
    const date = readDate('24/11/2026')
    expect(date?.getDate()).toBe(24)
    expect(date?.getMonth()).toBe(10)
    expect(date?.getHours()).toBe(12)
  })

  it('reads an ISO date too', () => {
    expect(readDate('2026-11-24')?.getDate()).toBe(24)
  })

  it('refuses a day that does not exist instead of rolling it over', () => {
    expect(readDate('31/11/2026')).toBeNull()
    expect(readDate('24/13/2026')).toBeNull()
    expect(readDate('noviembre')).toBeNull()
  })
})

describe('planImport', () => {
  it('reads a paid one-off as a gasto', () => {
    const { rows, rejected } = plan(
      '11/11/2026;Café Martinez;Café;4.600;;;;;;;',
    )
    expect(rejected).toEqual([])
    expect(rows[0]).toMatchObject({
      kind: 'gasto',
      name: 'Café Martinez',
      amount: 4600,
      currency: 'ARS',
      categoryId: 'cat-cafe',
      methodId: null,
      methodLabel: 'Efectivo',
      paid: true,
    })
  })

  it('reads a credit-card row as a consumo, with its cuotas', () => {
    const { rows } = plan(
      '13/11/2026;Discos;Super;104.500;ARS;Visa CRÉDITO Santander FLOR;sí;no;no;3;',
    )
    expect(rows[0]).toMatchObject({
      kind: 'consumo',
      amount: 104500,
      cuotas: 3,
      methodId: 'card-visa',
    })
  })

  it('reads "todos los meses" as a servicio, however it was paid', () => {
    const { rows } = plan(
      '11/11/2026;Claro;Super;11.998,01;ARS;Visa CRÉDITO Santander FLOR;sí;sí;sí;1;',
    )
    expect(rows[0]).toMatchObject({
      kind: 'servicio',
      recurring: true,
      autoDebit: true,
      methodOnCredit: true,
    })
  })

  it('reads an unpaid row as a servicio and lets its amount be unknown', () => {
    const { rows, rejected } = plan('14/11/2026;Swiss Medical;Super;;;;no;;;;')
    expect(rejected).toEqual([])
    expect(rows[0]).toMatchObject({
      kind: 'servicio',
      paid: false,
      amount: null,
    })
  })

  it('marks a category the household does not have, to be created', () => {
    const { rows } = plan('27/11/2026;Bazar;Bolucompras;43.100;;;;;;;')
    expect(rows[0]).toMatchObject({
      categoryId: null,
      newCategoryName: 'Bolucompras',
      categoryLabel: 'Bolucompras',
    })
  })

  it('finds a category and a method whatever their accents and case', () => {
    const { rows } = plan(
      '11/11/2026;Café;cafe;4.600;;visa debito santander;;;;;',
    )
    expect(rows[0]).toMatchObject({
      categoryId: 'cat-cafe',
      methodId: 'card-debito',
    })
  })

  it('rejects a method the household does not have, rather than inventing one', () => {
    const { rows, rejected } = plan(
      '11/11/2026;Café;Café;4.600;;Tarjeta Naranja;;;;;',
    )
    expect(rows).toEqual([])
    expect(rejected[0]?.problems[0]).toContain('Tarjeta Naranja')
  })

  it('rejects cuotas on anything that is not a credit card', () => {
    const { rejected } = plan(
      '11/11/2026;Café;Café;4.600;;Visa Débito Santander;sí;no;no;3;',
    )
    expect(rejected[0]?.problems).toContain(
      'Solo se paga en cuotas con una tarjeta de crédito',
    )
  })

  it('rejects dollars on a method that does not hold them', () => {
    const { rejected } = plan(
      '24/11/2026;Anthropic;Super;20;USD;Visa Débito Santander;;;;;',
    )
    expect(rejected[0]?.problems[0]).toContain('no maneja dólares')
  })

  it('rejects a paid row with no amount, and says why it may be empty', () => {
    const { rejected } = plan('11/11/2026;Café;Café;;;;sí;;;;')
    expect(rejected[0]?.problems[0]).toContain('Falta el monto')
  })

  it('keeps the good rows when another one is wrong', () => {
    const { rows, rejected } = plan(
      '11/11/2026;Café;Café;4.600;;;;;;;',
      'ayer;Super;Super;1.000;;;;;;;',
      '12/11/2026;Super;Super;2.000;;;;;;;',
    )
    expect(rows.map((row) => row.name)).toEqual(['Café', 'Super'])
    expect(rejected.map((row) => row.line)).toEqual([3])
  })

  it('says which columns are missing instead of reading a stranger file', () => {
    const { missingColumns, rows } = planImport({
      text: 'Nombre;Precio\nCafé;100\n',
      categories: CATEGORIES,
      methods: METHODS,
    })
    expect(missingColumns).toEqual(['fecha', 'categoria'])
    expect(rows).toEqual([])
  })
})
