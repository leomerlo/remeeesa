import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { CategoryBreakdown } from './CategoryBreakdown'

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
  it('shows an empty state instead of an arc-less donut when the month has no expenses', async () => {
    const { db, householdId } = await seedHousehold()

    const { container } = renderWithProviders(
      <CategoryBreakdown db={db} householdId={householdId} />,
    )

    expect(
      await screen.findByText('Todavía no hay gastos este mes'),
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

    renderWithProviders(<CategoryBreakdown db={db} householdId={householdId} />)

    const list = await screen.findByRole('list', {
      name: 'Gastos por categoría',
    })
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Comida')
    expect(items[0]).toHaveTextContent('75%')
    expect(items[0]).toHaveTextContent('$75,00')
    expect(items[1]).toHaveTextContent('Transporte')
    expect(items[1]).toHaveTextContent('25%')
    expect(items[1]).toHaveTextContent('$25,00')
  })

  // The total lives beside the heading, not inside the donut's hole: a real
  // month runs to "$250.000,00", which is wider than the hole and spilled
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

    const { container } = renderWithProviders(
      <CategoryBreakdown db={db} householdId={householdId} />,
    )

    const heading = await screen.findByRole('heading', {
      name: 'Por categoría',
    })
    expect(heading.parentElement).toHaveTextContent('$100,00')
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

    const { container } = renderWithProviders(
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

    const { container } = renderWithProviders(
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

    const { container } = renderWithProviders(
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

  it('splits by person using the name stored on the expense', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = byName.get('Comida')
    if (comida === undefined) {
      throw new Error('expected seeded category')
    }
    await seed({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Cafe',
      price: 30,
      author: 'Flor',
    })
    await seed({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Super',
      price: 70,
      author: 'Leo',
    })

    renderWithProviders(<CategoryBreakdown db={db} householdId={householdId} />)

    const list = await screen.findByRole('list', {
      name: 'Gastos por persona',
    })
    const items = within(list).getAllByRole('listitem')
    // Biggest spender first.
    expect(items[0]).toHaveTextContent('Leo')
    expect(items[0]).toHaveTextContent('$70,00')
    expect(items[1]).toHaveTextContent('Flor')
    expect(items[1]).toHaveTextContent('$30,00')
  })

  // Same reason the single-category donut goes: a bar comparing one person
  // against nobody is always full.
  it('drops the comparison bar when one person spent everything', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = byName.get('Comida')
    if (comida === undefined) {
      throw new Error('expected the seeded Comida category')
    }
    await seed({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Super',
      price: 70,
      author: 'Flor',
    })

    const { container } = renderWithProviders(
      <CategoryBreakdown db={db} householdId={householdId} />,
    )

    await screen.findByRole('list', { name: 'Gastos por persona' })
    expect(screen.getByText('Flor')).toBeInTheDocument()
    expect(container.querySelector('[role="presentation"]')).toBeNull()
  })

  it('keeps the bars once there is somebody to compare against', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = byName.get('Comida')
    if (comida === undefined) {
      throw new Error('expected the seeded Comida category')
    }
    await seed({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Super',
      price: 70,
      author: 'Flor',
    })
    await seed({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Nafta',
      price: 30,
      author: 'Leo',
    })

    const { container } = renderWithProviders(
      <CategoryBreakdown db={db} householdId={householdId} />,
    )

    await screen.findByRole('list', { name: 'Gastos por persona' })
    expect(container.querySelectorAll('[role="presentation"]')).toHaveLength(2)
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

    renderWithProviders(
      <CategoryBreakdown
        db={db}
        householdId={householdId}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />,
    )

    // Scoped to the category list, not a bare findByText -- with a single
    // category in view, the header total and the row's own amount are both
    // "$500,00", so an unscoped query matches more than one element.
    const list = await screen.findByRole('list', {
      name: 'Gastos por categoría',
    })
    expect(within(list).getByText('$500,00')).toBeInTheDocument()
    expect(screen.queryByText('$999,00')).not.toBeInTheDocument()
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

    renderWithProviders(
      <CategoryBreakdown
        db={db}
        householdId={householdId}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />,
    )

    expect(
      await screen.findByText('No hay gastos en este mes'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Todavía no hay gastos este mes'),
    ).not.toBeInTheDocument()
  })
})
