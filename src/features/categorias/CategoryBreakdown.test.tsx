import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  createExpense,
  listCategories,
  updateCategoryBudget,
} from '@/lib/expenses'
import { createCard, createCardPurchase, markResumenPaid } from '@/lib/cards'
import { createHouseholdWithMembership } from '@/lib/households'
import { listPendientes } from '@/lib/pendientes'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { renderWithProviders } from '@/test/renderWithProviders'
import { CategoryBreakdown } from './CategoryBreakdown'

function renderInRouter(ui: ReactElement) {
  return renderWithProviders(<MemoryRouter>{ui}</MemoryRouter>)
}

async function seedHousehold() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 1000,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const byName = new Map(categories.map((c) => [c.name, c]))
  return { db, householdId: household.id, byName }
}

async function seed(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly price: number
  readonly author?: string
  readonly date?: Date
}) {
  return createExpense({
    db: input.db,
    householdId: input.householdId,
    categoryId: input.categoryId,
    memberId: 'user-1',
    authorDisplayName: input.author ?? 'Ada',
    name: input.name,
    price: input.price,
    comments: '',
    // Defaults to this month, since the breakdown defaults to the current
    // month absent explicit monthStart/monthEnd props.
    expenseDate: input.date ?? new Date(),
  })
}

describe('CategoryBreakdown', () => {
  describe('topes por categoría', () => {
    it('says nothing at all while no category has a ceiling', async () => {
      const { db, householdId, byName } = await seedHousehold()
      const comida = byName.get('Comida')
      if (comida === undefined) {
        throw new Error('expected seeded categories')
      }
      await seed({
        db,
        householdId,
        categoryId: comida.id,
        name: 'A',
        price: 75,
      })

      renderInRouter(<CategoryBreakdown db={db} householdId={householdId} />)

      await screen.findByText('Gastos por categoría')
      expect(screen.queryByText('Cerca del tope')).not.toBeInTheDocument()
    })

    it('shows what is left of a ceiling', async () => {
      const { db, householdId, byName } = await seedHousehold()
      const comida = byName.get('Comida')
      if (comida === undefined) {
        throw new Error('expected seeded categories')
      }
      await updateCategoryBudget({
        db,
        householdId,
        categoryId: comida.id,
        monthlyBudget: 300,
      })
      await seed({
        db,
        householdId,
        categoryId: comida.id,
        name: 'A',
        price: 240,
      })

      renderInRouter(<CategoryBreakdown db={db} householdId={householdId} />)

      // Scoped to the ceilings list: the same figure is also the
      // category's own line in the breakdown beside it.
      const topes = within(
        (await screen.findByRole('heading', { name: 'Cerca del tope' }))
          .parentElement as HTMLElement,
      )
      expect(topes.getByText('$240')).toBeInTheDocument()
      expect(topes.getByText('de $300')).toBeInTheDocument()
      expect(topes.getByText('Quedan $60')).toBeInTheDocument()
    })

    it('says how far past a ceiling the month has gone', async () => {
      const { db, householdId, byName } = await seedHousehold()
      const comida = byName.get('Comida')
      if (comida === undefined) {
        throw new Error('expected seeded categories')
      }
      await updateCategoryBudget({
        db,
        householdId,
        categoryId: comida.id,
        monthlyBudget: 100,
      })
      await seed({
        db,
        householdId,
        categoryId: comida.id,
        name: 'A',
        price: 175,
      })

      renderInRouter(<CategoryBreakdown db={db} householdId={householdId} />)

      expect(
        await screen.findByText('$75 por encima del tope'),
      ).toBeInTheDocument()
    })

    // Before anything has been spent is the most useful moment to look at a
    // ceiling, and summarizeByCategory drops a category with no spending.
    // It used to list every ceiling, including the ones with nothing spent
    // against them -- which buried the one actually about to go over. The
    // tope itself is printed on each category's own tile either way. Per
    // direct feedback.
    it('leaves out a ceiling nothing has gone into yet', async () => {
      const { db, householdId, byName } = await seedHousehold()
      const comida = byName.get('Comida')
      const salud = byName.get('Salud')
      if (comida === undefined || salud === undefined) {
        throw new Error('expected seeded categories')
      }
      await updateCategoryBudget({
        db,
        householdId,
        categoryId: salud.id,
        monthlyBudget: 300,
      })
      await seed({
        db,
        householdId,
        categoryId: comida.id,
        name: 'A',
        price: 75,
      })

      renderInRouter(<CategoryBreakdown db={db} householdId={householdId} />)

      await screen.findByText('Gastos por categoría')
      expect(screen.queryByText('Cerca del tope')).not.toBeInTheDocument()
      expect(screen.queryByText('de $300')).not.toBeInTheDocument()
    })

    // Per direct feedback the ceilings do not have to add up -- but promising
    // more than the household has is worth saying out loud.
    it('warns when the ceilings add up to more than the monthly budget', async () => {
      const { db, householdId, byName } = await seedHousehold()
      const comida = byName.get('Comida')
      const salud = byName.get('Salud')
      if (comida === undefined || salud === undefined) {
        throw new Error('expected seeded categories')
      }
      await updateCategoryBudget({
        db,
        householdId,
        categoryId: comida.id,
        monthlyBudget: 800,
      })
      await updateCategoryBudget({
        db,
        householdId,
        categoryId: salud.id,
        monthlyBudget: 500,
      })

      renderInRouter(<CategoryBreakdown db={db} householdId={householdId} />)

      // monthlyBudget is 1000; 800 + 500 promises 300 more than that.
      expect(
        await screen.findByText(/suman \$300 más que el presupuesto del mes/),
      ).toBeInTheDocument()
    })

    it('stays quiet while the ceilings fit inside the monthly budget', async () => {
      const { db, householdId, byName } = await seedHousehold()
      const comida = byName.get('Comida')
      if (comida === undefined) {
        throw new Error('expected seeded categories')
      }
      await updateCategoryBudget({
        db,
        householdId,
        categoryId: comida.id,
        monthlyBudget: 300,
      })

      renderInRouter(<CategoryBreakdown db={db} householdId={householdId} />)

      await screen.findByText('Todavía no hay nada para repartir')
      expect(
        screen.queryByText(/más que el presupuesto/),
      ).not.toBeInTheDocument()
    })
  })

  it('shows an empty state instead of an arc-less donut when the month has no expenses', async () => {
    const { db, householdId } = await seedHousehold()

    const { container } = renderInRouter(
      <CategoryBreakdown db={db} householdId={householdId} />,
    )

    expect(
      await screen.findByText('Todavía no hay nada para repartir'),
    ).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('lists categories by amount descending, with each share of the month', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = byName.get('Comida')
    const transporte = byName.get('Transporte')
    if (comida === undefined || transporte === undefined) {
      throw new Error('expected seeded categories')
    }
    await seed({
      db,
      householdId,
      categoryId: transporte.id,
      name: 'Taxi',
      price: 25,
    })
    await seed({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Super',
      price: 75,
    })

    renderInRouter(<CategoryBreakdown db={db} householdId={householdId} />)

    const list = await screen.findByRole('list', {
      name: 'Gastos por categoría',
    })
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Comida')
    expect(items[0]).toHaveTextContent('75%')
    expect(items[0]).toHaveTextContent('$75')
    expect(items[1]).toHaveTextContent('Transporte')
    expect(items[1]).toHaveTextContent('25%')
    expect(items[1]).toHaveTextContent('$25')
    const now = new Date()
    const month = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`
    expect(within(items[0]!).getByRole('link')).toHaveAttribute(
      'href',
      `/historico?month=${month}&category=${comida.id}`,
    )
  })

  // The total lives beside the heading, not inside the donut's hole: a real
  // month runs to "$250.000", which is wider than the hole and spilled
  // over the ring when it was drawn there.
  it("shows the month's total outside the donut", async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = byName.get('Comida')
    const transporte = byName.get('Transporte')
    if (comida === undefined || transporte === undefined) {
      throw new Error('expected seeded categories')
    }
    await seed({ db, householdId, categoryId: comida.id, name: 'A', price: 75 })
    await seed({
      db,
      householdId,
      categoryId: transporte.id,
      name: 'B',
      price: 25,
    })

    const { container } = renderInRouter(
      <CategoryBreakdown db={db} householdId={householdId} />,
    )

    const heading = await screen.findByRole('heading', {
      name: 'Gastos por categoría',
    })
    expect(heading.parentElement).toHaveTextContent('$100')
    expect(container.querySelector('svg')?.textContent).toBe('')
  })

  // One slice draws as a plain filled ring whose only message is "100%",
  // which the row beneath already says in words.
  it('draws no donut at all when a single category holds the whole month', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = byName.get('Comida')
    if (comida === undefined) {
      throw new Error('expected the seeded Comida category')
    }
    await seed({ db, householdId, categoryId: comida.id, name: 'A', price: 75 })
    await seed({ db, householdId, categoryId: comida.id, name: 'B', price: 25 })

    const { container } = renderInRouter(
      <CategoryBreakdown db={db} householdId={householdId} />,
    )

    await screen.findByRole('list', { name: 'Gastos por categoría' })
    expect(container.querySelector('svg')).toBeNull()
    // The numbers themselves are still all there.
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('draws one donut arc per category, in the category colour', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = byName.get('Comida')
    const transporte = byName.get('Transporte')
    if (comida === undefined || transporte === undefined) {
      throw new Error('expected seeded categories')
    }
    await seed({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Super',
      price: 75,
    })
    await seed({
      db,
      householdId,
      categoryId: transporte.id,
      name: 'Taxi',
      price: 25,
    })

    const { container } = renderInRouter(
      <CategoryBreakdown db={db} householdId={householdId} />,
    )
    await screen.findByRole('list', { name: 'Gastos por categoría' })

    // One track circle plus one arc per category.
    const circles = Array.from(container.querySelectorAll('svg circle'))
    expect(circles).toHaveLength(3)
    const arcColours = circles.slice(1).map((c) => c.getAttribute('stroke'))
    expect(arcColours).toEqual([comida.color, transporte.color])
  })

  // The arcs must tile the ring without gaps or overlap: each one's dash is
  // its own share of the circumference, and its offset is the sum of the
  // shares drawn before it. Getting this wrong is invisible in a screenshot
  // of a two-slice chart but obvious with three.
  it('lays the arcs end to end around the ring', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const names = ['Comida', 'Transporte', 'Salud']
    for (const [index, name] of names.entries()) {
      const category = byName.get(name)
      if (category === undefined) {
        throw new Error(`expected seeded category ${name}`)
      }
      await seed({
        db,
        householdId,
        categoryId: category.id,
        name: `Gasto ${name}`,
        // 50 / 30 / 20 of a 100 total.
        price: [50, 30, 20][index] ?? 0,
      })
    }

    const { container } = renderInRouter(
      <CategoryBreakdown db={db} householdId={householdId} />,
    )
    await screen.findByRole('list', { name: 'Gastos por categoría' })

    const arcs = Array.from(container.querySelectorAll('svg circle')).slice(1)
    expect(arcs).toHaveLength(3)

    const circumference = Number(
      arcs[0]?.getAttribute('stroke-dasharray')?.split(' ')[1],
    )
    let expectedOffset = 0
    for (const [index, share] of [0.5, 0.3, 0.2].entries()) {
      const arc = arcs[index]
      const dash = Number(arc?.getAttribute('stroke-dasharray')?.split(' ')[0])
      const offset = Number(arc?.getAttribute('stroke-dashoffset'))
      expect(dash).toBeCloseTo(share * circumference, 5)
      // Each arc starts exactly where the previous one ended.
      expect(offset).toBeCloseTo(-expectedOffset * circumference, 5)
      expectedOffset += share
    }
    // And together they close the ring.
    expect(expectedOffset).toBeCloseTo(1, 5)
  })

  // monthStart/monthEnd let Categorías' MonthPager drive which month this
  // shows -- without them it would always be stuck on the current month.
  it("shows a past month's breakdown when monthStart/monthEnd are passed, ignoring this month's expenses", async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = byName.get('Comida')
    if (comida === undefined) {
      throw new Error('expected the seeded Comida category')
    }
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    await seed({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Alquiler pasado',
      price: 500,
      date: lastMonth,
    })
    await seed({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Super de este mes',
      price: 999,
    })
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    )

    renderInRouter(
      <CategoryBreakdown
        db={db}
        householdId={householdId}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />,
    )

    // Scoped to the category list, not a bare findByText -- with a single
    // category in view, the header total and the row's own amount are both
    // "$500", so an unscoped query matches more than one element.
    const list = await screen.findByRole('list', {
      name: 'Gastos por categoría',
    })
    expect(within(list).getByText('$500')).toBeInTheDocument()
    expect(screen.queryByText('$999')).not.toBeInTheDocument()
  })

  it('shows a month-agnostic empty message for an empty past month, not "este mes"', async () => {
    const { db, householdId } = await seedHousehold()
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    )

    renderInRouter(
      <CategoryBreakdown
        db={db}
        householdId={householdId}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />,
    )

    expect(await screen.findByText('Mes sin gastos')).toBeInTheDocument()
    expect(
      screen.queryByText('Todavía no hay nada para repartir'),
    ).not.toBeInTheDocument()
  })
  describe('Tarjeta', () => {
    // Visa's Resumen of this month is paid $10 over its cuotas (the ajuste);
    // Master's is still unpaid. Both come from purchases dated last month,
    // whose single cuota lands in this month's Resumen.
    async function seedCards() {
      const s = await seedHousehold()
      const comida = s.byName.get('Comida')
      const transporte = s.byName.get('Transporte')
      if (comida === undefined || transporte === undefined) {
        throw new Error('expected seeded categories')
      }
      const now = new Date()
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)
      const visa = await createCard({ ...s, name: 'Visa' })
      const master = await createCard({ ...s, name: 'Master' })
      const buy = (
        cardId: string,
        categoryId: string,
        name: string,
        total: number,
      ) =>
        createCardPurchase({
          db: s.db,
          householdId: s.householdId,
          cardId,
          categoryId,
          memberId: 'user-1',
          authorDisplayName: 'Ada',
          name,
          total,
          cuotas: 1,
          purchaseDate: lastMonth,
          comments: '',
        })
      await buy(visa.id, comida.id, 'Super grande', 300)
      await buy(master.id, transporte.id, 'Peaje', 50)
      const pendientes = await listPendientes(s)
      const visaResumen = pendientes.find((p) => p.cardId === visa.id)
      if (visaResumen === undefined) {
        throw new Error('expected a Visa Resumen')
      }
      await markResumenPaid({
        db: s.db,
        householdId: s.householdId,
        resumenId: visaResumen.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        amountPaid: 310,
        paymentDate: now,
      })
      await seed({ ...s, categoryId: comida.id, name: 'Verdura', price: 75 })
      return s
    }

    it('is its own slice, ajuste and unpaid Resúmenes included, and card spending stays out of the other categories', async () => {
      const { db, householdId } = await seedCards()

      renderInRouter(<CategoryBreakdown db={db} householdId={householdId} />)

      const list = await screen.findByRole('list', {
        name: 'Gastos por categoría',
      })
      const items = within(list)
        .getAllByRole('listitem')
        .filter((item) => item.parentElement === list)
      expect(items).toHaveLength(2)
      expect(items[0]).toHaveTextContent('Tarjeta')
      expect(items[0]).toHaveTextContent('$360')
      expect(items[1]).toHaveTextContent('Comida')
      expect(items[1]).toHaveTextContent('$75')
    })

    it('opens into its subcategories, with Ajuste and Sin pagar as their own lines', async () => {
      const { db, householdId } = await seedCards()

      renderInRouter(<CategoryBreakdown db={db} householdId={householdId} />)

      const toggle = await screen.findByText('Tarjeta')
      const lines = screen.getByRole('list', { name: 'Tarjeta por categoría' })
      expect(lines).not.toBeVisible()

      fireEvent.click(toggle)

      expect(lines).toBeVisible()
      const rows = within(lines).getAllByRole('listitem')
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringMatching(/^Comida.*\$300/),
        expect.stringMatching(/^Ajuste.*\$10/),
        expect.stringMatching(/^Sin pagar.*\$50/),
      ])
    })

    it('shows a Tarjeta made only of an unpaid Resumen, opening to just Sin pagar', async () => {
      const s = await seedHousehold()
      const comida = s.byName.get('Comida')
      if (comida === undefined) {
        throw new Error('expected seeded categories')
      }
      const now = new Date()
      const visa = await createCard({ ...s, name: 'Visa' })
      await createCardPurchase({
        db: s.db,
        householdId: s.householdId,
        cardId: visa.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Super grande',
        total: 300,
        cuotas: 1,
        purchaseDate: new Date(now.getFullYear(), now.getMonth() - 1, 15),
        comments: '',
      })

      renderInRouter(
        <CategoryBreakdown db={s.db} householdId={s.householdId} />,
      )

      fireEvent.click(await screen.findByText('Tarjeta'))
      const rows = within(
        screen.getByRole('list', { name: 'Tarjeta por categoría' }),
      ).getAllByRole('listitem')
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringMatching(/^Sin pagar.*\$300/),
      ])
    })
  })
})
