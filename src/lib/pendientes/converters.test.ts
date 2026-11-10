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
          autoDebit: false,
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
      autoDebit: false,
      status: 'pending',
      // Pesos when the document says nothing, which is what every bill
      // written before a bill could be in dollars was.
      currency: 'ARS',
      paidExpenseId: null,
      paidAt: null,
      createdAt: new Date('2026-08-31T12:00:00.000Z'),
    })
  })

  // What a bill is normally paid with: the card the bank debits it from.
  // A document written before the field existed leaves it off entirely,
  // which is what the case above checks.
  it('reads the method a bill is paid with, when it says one', () => {
    const bill = parsePendienteDocument({
      id: 'q2',
      data: {
        household_id: 'h1',
        category_id: 'c1',
        name: 'Edenor',
        due_date: new Date('2026-09-10T12:00:00.000Z'),
        expected_amount: 36_800,
        recurring: true,
        auto_debit: true,
        payment_method_id: 'card-visa',
        status: 'pending',
        paid_expense_id: null,
        created_at: new Date('2026-08-31T12:00:00.000Z'),
      },
    })
    expect(bill.paymentMethodId).toBe('card-visa')
    expect(bill.autoDebit).toBe(true)
  })

  it("reads a Resumen's card_id and purchase_ids", () => {
    const resumen = parsePendienteDocument({
      id: 'card-1_2026-10',
      data: {
        household_id: 'h1',
        category_id: 'c1',
        name: 'Visa',
        due_date: new Date(2026, 9, 10),
        expected_amount: 100,
        recurring: false,
        status: 'pending',
        paid_expense_id: null,
        created_at: new Date(2026, 8, 1),
        card_id: 'card-1',
        purchase_ids: ['p1', 'p2'],
      },
    })

    expect(resumen.cardId).toBe('card-1')
    expect(resumen.purchaseIds).toEqual(['p1', 'p2'])
    expect(resumen.paidExpenseIds).toBeUndefined()
  })

  // Her Visa Flor: US$13,99 typed in weeks earlier under a model that let
  // a statement figure be loaded before paying. The bill kept saying 13,99
  // while its consumos grew to US$109,98. A card bill is an estimate until
  // it is paid, so a figure on an unpaid one is read as no figure at all.
  // Per direct feedback: las tarjetas siempre van a ser estimadas.
  it('ignores a figure on a card bill that has not been paid', () => {
    const resumen = parsePendienteDocument({
      id: 'card-1_2026-11',
      data: {
        household_id: 'h1',
        category_id: 'c1',
        name: 'Visa Flor US$',
        due_date: new Date(2026, 10, 10),
        expected_amount: 13.99,
        estimated_amount: 109.98,
        recurring: false,
        status: 'pending',
        paid_expense_id: null,
        created_at: new Date(2026, 9, 1),
        card_id: 'card-1',
        currency: 'USD',
        purchase_ids: ['p1', 'p2', 'p3'],
      },
    })

    expect(resumen.expectedAmount).toBeNull()
    expect(resumen.estimatedAmount).toBe(109.98)
  })

  // Paid, the figure is what the card actually charged -- taxes and
  // interest included -- so it stands.
  it('keeps what a paid card bill was settled for', () => {
    const resumen = parsePendienteDocument({
      id: 'card-1_2026-10',
      data: {
        household_id: 'h1',
        category_id: 'c1',
        name: 'Visa',
        due_date: new Date(2026, 9, 10),
        expected_amount: 7400,
        estimated_amount: 5000,
        recurring: false,
        status: 'paid',
        paid_expense_id: 'e1',
        paid_expense_ids: ['e1'],
        paid_at: new Date(2026, 9, 12),
        created_at: new Date(2026, 8, 1),
        card_id: 'card-1',
        purchase_ids: ['p1'],
      },
    })

    expect(resumen.expectedAmount).toBe(7400)
  })

  it("reads a paid Resumen's paid_expense_ids", () => {
    const resumen = parsePendienteDocument({
      id: 'card-1_2026-10',
      data: {
        household_id: 'h1',
        category_id: 'c1',
        name: 'Visa',
        due_date: new Date(2026, 9, 10),
        expected_amount: 100,
        recurring: false,
        status: 'paid',
        paid_expense_id: 'e1',
        paid_expense_ids: ['e1', 'e2'],
        created_at: new Date(2026, 8, 1),
        card_id: 'card-1',
        purchase_ids: ['p1', 'p2'],
      },
    })

    expect(resumen.paidExpenseIds).toEqual(['e1', 'e2'])
  })

  it('rejects a Resumen whose purchase_ids is not a list of strings', () => {
    expect(() =>
      parsePendienteDocument({
        id: 'card-1_2026-10',
        data: {
          household_id: 'h1',
          category_id: 'c1',
          name: 'Visa',
          due_date: new Date(2026, 9, 10),
          expected_amount: 100,
          recurring: false,
          status: 'pending',
          paid_expense_id: null,
          created_at: new Date(2026, 8, 1),
          card_id: 'card-1',
          purchase_ids: [1],
        },
      }),
    ).toThrow('purchase_ids must be a list of strings')
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
        autoDebit: false,
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
        autoDebit: false,
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
        autoDebit: false,
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
        autoDebit: false,
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
          autoDebit: false,
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
          autoDebit: false,
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
          autoDebit: false,
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
          autoDebit: false,
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
          autoDebit: false,
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
          autoDebit: false,
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
          autoDebit: false,
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
          autoDebit: false,
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
          autoDebit: false,
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
          autoDebit: false,
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
          autoDebit: false,
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
        autoDebit: false,
        paymentMethodId: null,
        status: 'pending',
        paidExpenseId: null,
        paidAt: null,
        createdAt,
        currency: 'ARS',
      }),
    ).toEqual({
      currency: 'ARS',
      household_id: 'h1',
      category_id: 'c1',
      name: 'Alquiler',
      due_date: dueDate,
      expected_amount: 500,
      recurring: false,
      auto_debit: false,
      payment_method_id: null,
      status: 'pending',
      paid_expense_id: null,
      paid_at: null,
      created_at: createdAt,
    })
  })
})
