import { describe, expect, it } from 'vitest'
import { colorForCategoryName } from './categoryColor'
import {
  categoryToDocument,
  expenseToDocument,
  parseCategoryDocument,
  parseExpenseDocument,
  toFirestoreExpenseDate,
} from './converters'

describe('parseCategoryDocument', () => {
  it('maps snake_case Firestore fields to a Category', () => {
    expect(
      parseCategoryDocument({
        id: 'c1',
        data: {
          household_id: 'h1',
          name: 'Comida',
          color: '#7b5cfa',
          created_at: new Date('2026-01-15T12:00:00.000Z'),
        },
      }),
    ).toEqual({
      id: 'c1',
      householdId: 'h1',
      name: 'Comida',
      color: '#7b5cfa',
      createdAt: new Date('2026-01-15T12:00:00.000Z'),
    })
  })

  it('reads a Firestore Timestamp via toDate', () => {
    const createdAt = new Date('2026-01-15T12:00:00.000Z')
    expect(
      parseCategoryDocument({
        id: 'c1',
        data: {
          household_id: 'h1',
          name: 'Comida',
          color: '#7b5cfa',
          created_at: { toDate: () => createdAt },
        },
      }).createdAt,
    ).toBe(createdAt)
  })

  it('rejects an empty name', () => {
    expect(() =>
      parseCategoryDocument({
        id: 'c1',
        data: {
          household_id: 'h1',
          name: '   ',
          color: '#7b5cfa',
          created_at: new Date('2026-01-15T12:00:00.000Z'),
        },
      }),
    ).toThrow('Category name must be non-empty')
  })

  // Categories created before `color` existed on the schema have no stored
  // value for it in Firestore. Falling back to the same hash used at
  // creation time (rather than rejecting the document) keeps existing
  // households' categories loadable without a migration step.
  it('falls back to the computed color for a category with no stored color (legacy document)', () => {
    const expected = colorForCategoryName('Comida')

    expect(
      parseCategoryDocument({
        id: 'c1',
        data: {
          household_id: 'h1',
          name: 'Comida',
          color: '',
          created_at: new Date('2026-01-15T12:00:00.000Z'),
        },
      }).color,
    ).toBe(expected)

    expect(
      parseCategoryDocument({
        id: 'c1',
        data: {
          household_id: 'h1',
          name: 'Comida',
          created_at: new Date('2026-01-15T12:00:00.000Z'),
        },
      }).color,
    ).toBe(expected)

    expect(
      parseCategoryDocument({
        id: 'c1',
        data: {
          household_id: 'h1',
          name: 'Comida',
          color: 12345,
          created_at: new Date('2026-01-15T12:00:00.000Z'),
        },
      }).color,
    ).toBe(expected)
  })

  // parseCategoryDocument intentionally does NOT validate the hex format of
  // `color` (only that it's a non-empty string) — the '^#[0-9a-fA-F]{6}$'
  // shape is enforced by the Firestore security rule (isValidCategory) on
  // write, not by this client-side read parser. This test documents that
  // boundary so it isn't mistaken for a bug.
  it('accepts a non-hex color string, since hex format is only enforced by Firestore rules', () => {
    expect(
      parseCategoryDocument({
        id: 'c1',
        data: {
          household_id: 'h1',
          name: 'Comida',
          color: 'not-a-hex-color',
          created_at: new Date('2026-01-15T12:00:00.000Z'),
        },
      }).color,
    ).toBe('not-a-hex-color')
  })
})

describe('parseExpenseDocument', () => {
  it('maps snake_case Firestore fields to an Expense', () => {
    expect(
      parseExpenseDocument({
        id: 'e1',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          member_id: 'user-1',
          author_display_name: 'Ada',
          name: 'Pizza',
          price: 10.5,
          comments: 'Friday',
          expense_date: new Date('2026-08-15T00:00:00.000Z'),
          created_at: new Date('2026-08-16T12:00:00.000Z'),
        },
      }),
    ).toEqual({
      id: 'e1',
      householdId: 'h1',
      categoryId: 'c1',
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10.5,
      comments: 'Friday',
      expenseDate: new Date('2026-08-15T00:00:00.000Z'),
      createdAt: new Date('2026-08-16T12:00:00.000Z'),
    })
  })

  it('reads expense_date via toDate', () => {
    const expenseDate = new Date('2026-08-15T00:00:00.000Z')
    expect(
      parseExpenseDocument({
        id: 'e1',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          member_id: 'user-1',
          author_display_name: 'Ada',
          name: 'Pizza',
          price: 10,
          comments: '',
          expense_date: { toDate: () => expenseDate },
          created_at: new Date('2026-08-16T12:00:00.000Z'),
        },
      }).expenseDate,
    ).toBe(expenseDate)
  })
})

describe('toDocument converters', () => {
  it('maps a Category to snake_case Firestore fields', () => {
    const createdAt = new Date('2026-01-15T12:00:00.000Z')
    expect(
      categoryToDocument({
        householdId: 'h1',
        name: 'Comida',
        color: '#7b5cfa',
        createdAt,
      }),
    ).toEqual({
      household_id: 'h1',
      name: 'Comida',
      color: '#7b5cfa',
      created_at: createdAt,
    })
  })

  it('maps an Expense to snake_case Firestore fields', () => {
    const expenseDate = new Date('2026-08-15T00:00:00.000Z')
    const createdAt = new Date('2026-08-16T12:00:00.000Z')
    expect(
      expenseToDocument({
        householdId: 'h1',
        categoryId: 'c1',
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Pizza',
        price: 10.5,
        comments: 'Friday',
        expenseDate,
        createdAt,
      }),
    ).toEqual({
      household_id: 'h1',
      category_id: 'c1',
      member_id: 'user-1',
      author_display_name: 'Ada',
      name: 'Pizza',
      price: 10.5,
      comments: 'Friday',
      expense_date: expenseDate,
      created_at: createdAt,
    })
  })
})

describe('toFirestoreExpenseDate', () => {
  it('stores the calendar day at local noon for rule-safe timestamps', () => {
    const timestamp = toFirestoreExpenseDate(new Date(2026, 7, 28))
    expect(timestamp.toDate()).toEqual(new Date(2026, 7, 28, 12, 0, 0, 0))
  })
})
