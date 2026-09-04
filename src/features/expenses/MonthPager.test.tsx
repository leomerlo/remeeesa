import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { formatMonthLabel } from '@/lib/format'
import { MonthPager } from './MonthPager'

describe('MonthPager', () => {
  it('shows the viewed month and disables "Mes siguiente" while on the current month', () => {
    const now = new Date()
    render(<MonthPager viewedMonth={now} onViewedMonthChange={vi.fn()} />)

    expect(screen.getByText(formatMonthLabel(now))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Mes anterior' }),
    ).not.toBeDisabled()
  })

  it('re-enables "Mes siguiente" once viewing a past month', () => {
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    render(<MonthPager viewedMonth={lastMonth} onViewedMonthChange={vi.fn()} />)

    expect(
      screen.getByRole('button', { name: 'Mes siguiente' }),
    ).not.toBeDisabled()
  })

  it('reports the previous month when "Mes anterior" is tapped', () => {
    const viewedMonth = new Date(2026, 7, 1)
    const onViewedMonthChange = vi.fn()
    render(
      <MonthPager
        viewedMonth={viewedMonth}
        onViewedMonthChange={onViewedMonthChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))

    expect(onViewedMonthChange).toHaveBeenCalledTimes(1)
    expect(onViewedMonthChange.mock.calls[0]?.[0]).toEqual(new Date(2026, 6, 1))
  })

  it('reports the next month when "Mes siguiente" is tapped from a past month', () => {
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const onViewedMonthChange = vi.fn()
    render(
      <MonthPager
        viewedMonth={lastMonth}
        onViewedMonthChange={onViewedMonthChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))

    expect(onViewedMonthChange).toHaveBeenCalledTimes(1)
    expect(onViewedMonthChange.mock.calls[0]?.[0]).toEqual(
      new Date(now.getFullYear(), now.getMonth(), 1),
    )
  })
})
