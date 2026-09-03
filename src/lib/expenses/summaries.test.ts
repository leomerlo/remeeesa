import { describe, expect, it } from 'vitest'
import { colorForCategoryName } from './categoryColor'
import { summarizeByCategory, summarizeByPerson } from './summaries'
import type { Category, Expense } from './types'

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    householdId: 'hh-1',
    categoryId: 'cat-1',
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    name: 'Pizza',
    price: 10,
    comments: '',
    expenseDate: new Date(2026, 7, 15),
    pendienteId: null,
    isService: false,
    createdAt: new Date(2026, 7, 15),
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    householdId: 'hh-1',
    name: 'Comida',
    color: '#7b5cfa',
    createdAt: new Date(2026, 0, 1),
    ...overrides,
  }
}

describe('summarizeByCategory', () => {
  it('groups by category and sums the price', () => {
    const comida = makeCategory({ id: 'cat-comida', name: 'Comida' })
    const transporte = makeCategory({
      id: 'cat-transporte',
      name: 'Transporte',
      color: '#5394c7',
    })
    const expenses = [
      makeExpense({ id: 'e1', categoryId: 'cat-comida', price: 10 }),
      makeExpense({ id: 'e2', categoryId: 'cat-comida', price: 15 }),
      makeExpense({ id: 'e3', categoryId: 'cat-transporte', price: 8 }),
    ]

    const summary = summarizeByCategory({
      expenses,
      categories: [comida, transporte],
    })

    expect(summary).toEqual([
      {
        categoryId: 'cat-comida',
        name: 'Comida',
        color: comida.color,
        total: 25,
        share: 25 / 33,
      },
      {
        categoryId: 'cat-transporte',
        name: 'Transporte',
        color: transporte.color,
        total: 8,
        share: 8 / 33,
      },
    ])
  })

  it('sorts categories by total descending', () => {
    const small = makeCategory({ id: 'cat-small', name: 'Salud' })
    const big = makeCategory({ id: 'cat-big', name: 'Comida' })
    const expenses = [
      makeExpense({ id: 'e1', categoryId: 'cat-small', price: 5 }),
      makeExpense({ id: 'e2', categoryId: 'cat-big', price: 50 }),
    ]

    const summary = summarizeByCategory({
      expenses,
      categories: [small, big],
    })

    expect(summary.map((entry) => entry.categoryId)).toEqual([
      'cat-big',
      'cat-small',
    ])
  })

  // Tie-break: when two categories have the same total, the one whose
  // expenses were encountered first (insertion order of the expenses
  // array) keeps its earlier position -- Array#sort is stable, so no
  // explicit secondary key is needed, only documented behavior.
  it('keeps encounter order for a tie in total', () => {
    const first = makeCategory({ id: 'cat-first', name: 'Comida' })
    const second = makeCategory({ id: 'cat-second', name: 'Salud' })
    const expenses = [
      makeExpense({ id: 'e1', categoryId: 'cat-first', price: 20 }),
      makeExpense({ id: 'e2', categoryId: 'cat-second', price: 20 }),
    ]

    const summary = summarizeByCategory({
      expenses,
      categories: [first, second],
    })

    expect(summary.map((entry) => entry.categoryId)).toEqual([
      'cat-first',
      'cat-second',
    ])
  })

  it('falls back to a hashed color for an expense whose category is unknown', () => {
    const expenses = [
      makeExpense({ id: 'e1', categoryId: 'missing-category', price: 12 }),
    ]

    const summary = summarizeByCategory({ expenses, categories: [] })

    expect(summary).toEqual([
      {
        categoryId: 'missing-category',
        name: 'Categoría desconocida',
        color: colorForCategoryName('Categoría desconocida'),
        total: 12,
        share: 1,
      },
    ])
  })

  it('returns an empty list for no expenses', () => {
    expect(summarizeByCategory({ expenses: [], categories: [] })).toEqual([])
  })

  it('sums correctly when every expense is in the same category', () => {
    const comida = makeCategory({ id: 'cat-comida', name: 'Comida' })
    const expenses = [
      makeExpense({ id: 'e1', categoryId: 'cat-comida', price: 10 }),
      makeExpense({ id: 'e2', categoryId: 'cat-comida', price: 5.5 }),
      makeExpense({ id: 'e3', categoryId: 'cat-comida', price: 0 }),
    ]

    const summary = summarizeByCategory({ expenses, categories: [comida] })

    expect(summary).toEqual([
      {
        categoryId: 'cat-comida',
        name: 'Comida',
        color: comida.color,
        total: 15.5,
        share: 1,
      },
    ])
  })
})

describe('summarizeByPerson', () => {
  it('groups by authorDisplayName and sums the price', () => {
    const expenses = [
      makeExpense({ id: 'e1', authorDisplayName: 'Ada', price: 10 }),
      makeExpense({ id: 'e2', authorDisplayName: 'Bob', price: 20 }),
      makeExpense({ id: 'e3', authorDisplayName: 'Ada', price: 5 }),
    ]

    const summary = summarizeByPerson({ expenses })

    expect(summary).toEqual([
      { authorDisplayName: 'Bob', total: 20 },
      { authorDisplayName: 'Ada', total: 15 },
    ])
  })

  it('returns an empty list for no expenses', () => {
    expect(summarizeByPerson({ expenses: [] })).toEqual([])
  })

  it('sums correctly when every expense is from the same person, including zero and fractional prices', () => {
    const expenses = [
      makeExpense({ id: 'e1', authorDisplayName: 'Ada', price: 10.25 }),
      makeExpense({ id: 'e2', authorDisplayName: 'Ada', price: 0 }),
      makeExpense({ id: 'e3', authorDisplayName: 'Ada', price: 4.75 }),
    ]

    const summary = summarizeByPerson({ expenses })

    expect(summary).toEqual([{ authorDisplayName: 'Ada', total: 15 }])
  })
})

describe('summarizeByCategory share', () => {
  it('gives every category its fraction of the period total, summing to one', () => {
    const comida = makeCategory({ id: 'cat-comida', name: 'Comida' })
    const transporte = makeCategory({
      id: 'cat-transporte',
      name: 'Transporte',
      color: '#5394c7',
    })
    const expenses = [
      makeExpense({ id: 'e1', categoryId: 'cat-comida', price: 75 }),
      makeExpense({ id: 'e2', categoryId: 'cat-transporte', price: 25 }),
    ]

    const summary = summarizeByCategory({
      expenses,
      categories: [comida, transporte],
    })

    expect(summary[0]?.share).toBeCloseTo(0.75, 10)
    expect(summary[1]?.share).toBeCloseTo(0.25, 10)
    expect(summary.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(
      1,
      10,
    )
  })

  // Guards the divide: without it a zero total would put NaN into the chart's
  // geometry, which silently draws nothing instead of showing an empty state.
  it('never produces NaN when there is nothing to divide by', () => {
    const summary = summarizeByCategory({ expenses: [], categories: [] })

    expect(summary).toEqual([])
    expect(summary.some((entry) => Number.isNaN(entry.share))).toBe(false)
  })
})
