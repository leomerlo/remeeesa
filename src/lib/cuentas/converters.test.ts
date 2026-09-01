import { describe, expect, it } from 'vitest'
import { cuentaToDocument, parseCuentaDocument } from './converters'

describe('parseCuentaDocument', () => {
  it('maps snake_case Firestore fields to a Cuenta', () => {
    expect(
      parseCuentaDocument({
        id: 'q1',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          name: 'Alquiler',
          due_date: new Date('2026-09-10T12:00:00.000Z'),
          expected_amount: 500,
          recurring: false,
          status: 'pending',
          paid_expense_id: null,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        },
      }),
    ).toEqual({
      id: 'q1',
      householdId: 'h1',
      categoryId: 'c1',
      name: 'Alquiler',
      dueDate: new Date('2026-09-10T12:00:00.000Z'),
      expectedAmount: 500,
      recurring: false,
      status: 'pending',
      paidExpenseId: null,
      createdAt: new Date('2026-08-31T12:00:00.000Z'),
    })
  })

  it('reads due_date and created_at via toDate', () => {
    const dueDate = new Date('2026-09-10T12:00:00.000Z')
    const createdAt = new Date('2026-08-31T12:00:00.000Z')
    const cuenta = parseCuentaDocument({
      id: 'q1',
      data: {
        household_id: 'h1',
        category_id: 'c1',
        name: 'Alquiler',
        due_date: { toDate: () => dueDate },
        expected_amount: null,
        recurring: false,
        status: 'pending',
        paid_expense_id: null,
        created_at: { toDate: () => createdAt },
      },
    })
    expect(cuenta.dueDate).toBe(dueDate)
    expect(cuenta.createdAt).toBe(createdAt)
  })

  it('maps a null expected_amount and paid_expense_id', () => {
    const cuenta = parseCuentaDocument({
      id: 'q1',
      data: {
        household_id: 'h1',
        category_id: 'c1',
        name: 'Alquiler',
        due_date: new Date('2026-09-10T12:00:00.000Z'),
        expected_amount: null,
        recurring: true,
        status: 'paid',
        paid_expense_id: 'e1',
        created_at: new Date('2026-08-31T12:00:00.000Z'),
      },
    })
    expect(cuenta.expectedAmount).toBeNull()
    expect(cuenta.recurring).toBe(true)
    expect(cuenta.status).toBe('paid')
    expect(cuenta.paidExpenseId).toBe('e1')
  })

  it('rejects an empty name', () => {
    expect(() =>
      parseCuentaDocument({
        id: 'q1',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          name: '   ',
          due_date: new Date('2026-09-10T12:00:00.000Z'),
          expected_amount: null,
          recurring: false,
          status: 'pending',
          paid_expense_id: null,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        },
      }),
    ).toThrow('El nombre de la cuenta no puede estar vacío')
  })

  it('rejects a non-number expected_amount', () => {
    expect(() =>
      parseCuentaDocument({
        id: 'q1',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          name: 'Alquiler',
          due_date: new Date('2026-09-10T12:00:00.000Z'),
          expected_amount: 'not-a-number',
          recurring: false,
          status: 'pending',
          paid_expense_id: null,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        },
      }),
    ).toThrow('expected_amount must be a number or null')
  })

  it('rejects a non-boolean recurring', () => {
    expect(() =>
      parseCuentaDocument({
        id: 'q1',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          name: 'Alquiler',
          due_date: new Date('2026-09-10T12:00:00.000Z'),
          expected_amount: null,
          recurring: 'nope',
          status: 'pending',
          paid_expense_id: null,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        },
      }),
    ).toThrow('recurring must be a boolean')
  })

  it('rejects an invalid status', () => {
    expect(() =>
      parseCuentaDocument({
        id: 'q1',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          name: 'Alquiler',
          due_date: new Date('2026-09-10T12:00:00.000Z'),
          expected_amount: null,
          recurring: false,
          status: 'overdue',
          paid_expense_id: null,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        },
      }),
    ).toThrow("status must be 'pending' or 'paid'")
  })

  it('rejects a non-string non-null paid_expense_id', () => {
    expect(() =>
      parseCuentaDocument({
        id: 'q1',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          name: 'Alquiler',
          due_date: new Date('2026-09-10T12:00:00.000Z'),
          expected_amount: null,
          recurring: false,
          status: 'pending',
          paid_expense_id: 42,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        },
      }),
    ).toThrow('paid_expense_id must be a string or null')
  })

  it('rejects an empty document id', () => {
    expect(() =>
      parseCuentaDocument({
        id: '   ',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          name: 'Alquiler',
          due_date: new Date('2026-09-10T12:00:00.000Z'),
          expected_amount: null,
          recurring: false,
          status: 'pending',
          paid_expense_id: null,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        },
      }),
    ).toThrow('Cuenta id must be non-empty')
  })

  it('rejects a document that is not an object', () => {
    for (const data of [null, 'not-an-object', 42, ['a', 'b']]) {
      expect(() => parseCuentaDocument({ id: 'q1', data })).toThrow(
        'Cuenta document must be an object',
      )
    }
  })

  it('rejects a missing or non-string household_id', () => {
    expect(() =>
      parseCuentaDocument({
        id: 'q1',
        data: {
          category_id: 'c1',
          name: 'Alquiler',
          due_date: new Date('2026-09-10T12:00:00.000Z'),
          expected_amount: null,
          recurring: false,
          status: 'pending',
          paid_expense_id: null,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        },
      }),
    ).toThrow('household_id must be a non-empty string')
  })

  it('rejects a missing or non-string category_id', () => {
    expect(() =>
      parseCuentaDocument({
        id: 'q1',
        data: {
          household_id: 'h1',
          category_id: 42,
          name: 'Alquiler',
          due_date: new Date('2026-09-10T12:00:00.000Z'),
          expected_amount: null,
          recurring: false,
          status: 'pending',
          paid_expense_id: null,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        },
      }),
    ).toThrow('category_id must be a non-empty string')
  })

  it('rejects a non-string name', () => {
    expect(() =>
      parseCuentaDocument({
        id: 'q1',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          name: 42,
          due_date: new Date('2026-09-10T12:00:00.000Z'),
          expected_amount: null,
          recurring: false,
          status: 'pending',
          paid_expense_id: null,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        },
      }),
    ).toThrow('Cuenta name must be a string')
  })

  it('rejects a due_date that is neither a Date nor a Firestore timestamp', () => {
    expect(() =>
      parseCuentaDocument({
        id: 'q1',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          name: 'Alquiler',
          due_date: '2026-09-10',
          expected_amount: null,
          recurring: false,
          status: 'pending',
          paid_expense_id: null,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        },
      }),
    ).toThrow('due_date must be a timestamp')
  })

  it('rejects an invalid Date instance for due_date', () => {
    expect(() =>
      parseCuentaDocument({
        id: 'q1',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          name: 'Alquiler',
          due_date: new Date(Number.NaN),
          expected_amount: null,
          recurring: false,
          status: 'pending',
          paid_expense_id: null,
          created_at: new Date('2026-08-31T12:00:00.000Z'),
        },
      }),
    ).toThrow('due_date must be a timestamp')
  })

  it('rejects a missing or invalid created_at', () => {
    expect(() =>
      parseCuentaDocument({
        id: 'q1',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          name: 'Alquiler',
          due_date: new Date('2026-09-10T12:00:00.000Z'),
          expected_amount: null,
          recurring: false,
          status: 'pending',
          paid_expense_id: null,
          created_at: 'not-a-timestamp',
        },
      }),
    ).toThrow('created_at must be a timestamp')
  })
})

describe('cuentaToDocument', () => {
  it('maps a Cuenta draft to snake_case Firestore fields', () => {
    const dueDate = new Date('2026-09-10T12:00:00.000Z')
    const createdAt = new Date('2026-08-31T12:00:00.000Z')
    expect(
      cuentaToDocument({
        householdId: 'h1',
        categoryId: 'c1',
        name: 'Alquiler',
        dueDate,
        expectedAmount: 500,
        recurring: false,
        status: 'pending',
        paidExpenseId: null,
        createdAt,
      }),
    ).toEqual({
      household_id: 'h1',
      category_id: 'c1',
      name: 'Alquiler',
      due_date: dueDate,
      expected_amount: 500,
      recurring: false,
      status: 'pending',
      paid_expense_id: null,
      created_at: createdAt,
    })
  })
})
