import { describe, expect, it } from 'vitest'
import { pendienteToDocument, parsePendienteDocument } from './converters'

describe('parsePendienteDocument', () => {
  it('maps snake_case Firestore fields to a Pendiente', () => {
    expect(
      parsePendienteDocument({
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
      paidAt: null,
      createdAt: new Date('2026-08-31T12:00:00.000Z'),
    })
  })

  it('defaults paidAt to null when paid_at is missing, e.g. a Pendiente doc written before the field existed', () => {
    const pendiente = parsePendienteDocument({
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
    })
    expect(pendiente.paidAt).toBeNull()
  })

  it('reads a present paid_at into paidAt', () => {
    const paidAt = new Date('2026-09-05T12:00:00.000Z')
    const pendiente = parsePendienteDocument({
      id: 'q1',
      data: {
        household_id: 'h1',
        category_id: 'c1',
        name: 'Alquiler',
        due_date: new Date('2026-09-10T12:00:00.000Z'),
        expected_amount: 500,
        recurring: false,
        status: 'paid',
        paid_expense_id: 'e1',
        paid_at: paidAt,
        created_at: new Date('2026-08-31T12:00:00.000Z'),
      },
    })
    expect(pendiente.paidAt).toEqual(paidAt)
  })

  it('reads due_date and created_at via toDate', () => {
    const dueDate = new Date('2026-09-10T12:00:00.000Z')
    const createdAt = new Date('2026-08-31T12:00:00.000Z')
    const pendiente = parsePendienteDocument({
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
    expect(pendiente.dueDate).toBe(dueDate)
    expect(pendiente.createdAt).toBe(createdAt)
  })

  it('maps a null expected_amount and paid_expense_id', () => {
    const pendiente = parsePendienteDocument({
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
    expect(pendiente.expectedAmount).toBeNull()
    expect(pendiente.recurring).toBe(true)
    expect(pendiente.status).toBe('paid')
    expect(pendiente.paidExpenseId).toBe('e1')
  })

  it('rejects an empty name', () => {
    expect(() =>
      parsePendienteDocument({
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
    ).toThrow('El nombre del pendiente no puede estar vacío')
  })

  it('rejects a non-number expected_amount', () => {
    expect(() =>
      parsePendienteDocument({
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
      parsePendienteDocument({
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
      parsePendienteDocument({
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
      parsePendienteDocument({
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
      parsePendienteDocument({
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
    ).toThrow('Pendiente id must be non-empty')
  })

  it('rejects a document that is not an object', () => {
    for (const data of [null, 'not-an-object', 42, ['a', 'b']]) {
      expect(() => parsePendienteDocument({ id: 'q1', data })).toThrow(
        'Pendiente document must be an object',
      )
    }
  })

  it('rejects a missing or non-string household_id', () => {
    expect(() =>
      parsePendienteDocument({
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
      parsePendienteDocument({
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
      parsePendienteDocument({
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
    ).toThrow('Pendiente name must be a string')
  })

  it('rejects a due_date that is neither a Date nor a Firestore timestamp', () => {
    expect(() =>
      parsePendienteDocument({
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
      parsePendienteDocument({
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
      parsePendienteDocument({
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

describe('pendienteToDocument', () => {
  it('maps a Pendiente draft to snake_case Firestore fields', () => {
    const dueDate = new Date('2026-09-10T12:00:00.000Z')
    const createdAt = new Date('2026-08-31T12:00:00.000Z')
    expect(
      pendienteToDocument({
        householdId: 'h1',
        categoryId: 'c1',
        name: 'Alquiler',
        dueDate,
        expectedAmount: 500,
        recurring: false,
        status: 'pending',
        paidExpenseId: null,
        paidAt: null,
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
      paid_at: null,
      created_at: createdAt,
    })
  })
})
