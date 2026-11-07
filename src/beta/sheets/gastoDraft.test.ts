import { describe, expect, it } from 'vitest'
import type { CardPurchase } from '@/lib/cards'
import type { Expense } from '@/lib/expenses'
import { draftFromExpense, draftFromPurchase } from './GastoSheet'

const TODAY = new Date(2026, 10, 7, 12)

// One form over two records. What matters is that opening it on something
// that exists shows what that thing actually says -- an edit form that
// quietly drops a field writes the dropped value away on the first save.
describe('filling the gasto form from what is already there', () => {
  it('opens empty on a new gasto, in today and in pesos', () => {
    const draft = draftFromExpense(null, 'cat-comida', TODAY)
    expect(draft).toEqual({
      name: '',
      amount: '',
      currency: 'ARS',
      categoryId: 'cat-comida',
      date: '2026-11-07',
      methodId: '',
      cuotas: '1',
      comments: '',
      isService: false,
      // What the two servicio questions default to. They are only read
      // when "es un servicio" is ticked, and a bill that comes every
      // month is what makes it one.
      recurring: true,
      autoDebit: false,
    })
  })

  it('carries every field of a gasto, the payment method included', () => {
    const expense = {
      id: 'e1',
      name: 'Super',
      price: 12_340.5,
      currency: 'ARS',
      categoryId: 'cat-comida',
      comments: 'con la vecina',
      expenseDate: new Date(2026, 9, 3, 12),
      isService: true,
      paymentMethodId: 'card-visa',
    } as unknown as Expense

    expect(draftFromExpense(expense, 'otra', TODAY)).toMatchObject({
      name: 'Super',
      amount: '12340.5',
      categoryId: 'cat-comida',
      date: '2026-10-03',
      methodId: 'card-visa',
      comments: 'con la vecina',
      isService: true,
    })
  })

  // A consumo is a gasto that has not reached the month yet: same fields,
  // plus the cuotas, and always on the card it was bought with.
  it('carries a consumo, cuotas and card and all', () => {
    const purchase = {
      id: 'p1',
      name: 'Zapatillas',
      total: 90_000,
      currency: 'ARS',
      categoryId: 'cat-ropa',
      cardId: 'card-visa',
      cuotas: 3,
      purchaseDate: new Date(2026, 9, 24, 12),
      comments: '',
    } as unknown as CardPurchase

    expect(draftFromPurchase(purchase)).toEqual({
      name: 'Zapatillas',
      amount: '90000',
      currency: 'ARS',
      categoryId: 'cat-ropa',
      date: '2026-10-24',
      methodId: 'card-visa',
      cuotas: '3',
      comments: '',
      // Never: a consumo is not a servicio, and the toggle is not even
      // shown while the form is on a card -- so neither are the two
      // questions behind it.
      isService: false,
      recurring: true,
      autoDebit: false,
    })
  })
})
