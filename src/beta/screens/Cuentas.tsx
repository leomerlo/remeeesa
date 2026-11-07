import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarClock, CreditCard } from 'lucide-react'
import type { ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatAmount } from '@/lib/expenses'
import { billsOnCard, billsOnCardTotal, cuentasFigures } from '../figures'

import { ListSkeleton, NameSkel } from '../Skeleton'
import { Figure } from '../Figure'
import { useMonth } from '../MonthContext'
import { BillRow } from '../rows'
import { monthName } from '../format'
import type { BetaSession } from '../data'
import { LoadFailed, Title } from './Gastos'

export function Cuentas({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  // Which of the two the screen is on lives in the address rather than in
  // state, so somewhere else can send you straight to one -- "Con la
  // tarjeta" on Inicio is about the cards, and landing on the bills was
  // answering a question nobody asked. Replaced rather than pushed: the
  // back button should leave the screen, not walk back through tabs.
  const [params, setParams] = useSearchParams()
  const view = params.get('ver') === 'tarjetas' ? 'tarjetas' : 'pagar'
  const setView = (next: 'pagar' | 'tarjetas'): void => {
    setParams(next === 'tarjetas' ? { ver: 'tarjetas' } : {}, { replace: true })
  }
  const householdId = session.householdId ?? null
  const now = new Date()
  const { monthStart, monthEnd } = useMonth()

  const data = useQuery({
    queryKey: ['beta', 'cuentas', householdId, monthStart.toISOString()],
    enabled: householdId !== null,
    queryFn: async () => {
      const id = householdId as string
      const [pendientes, categories, household, settled] = await Promise.all([
        session.db.listPendientes({ householdId: id }),
        session.db.listCategories(id),
        session.db.getHousehold(id),
        session.db.listPaidPendientesDueInMonth({
          householdId: id,
          monthStart,
          monthEnd,
        }),
      ])
      return { pendientes, categories, household, settled }
    },
  })

  const segment = (
    <div className="segment">
      <button
        type="button"
        aria-pressed={view === 'pagar'}
        onClick={() => setView('pagar')}
      >
        Del mes
      </button>
      <button
        type="button"
        aria-pressed={view === 'tarjetas'}
        onClick={() => setView('tarjetas')}
      >
        Con tarjeta
      </button>
    </div>
  )

  if (data.isPending) {
    return (
      <>
        <Title text="Cuentas" sub={<NameSkel />} pager />
        {segment}
        <ListSkeleton label="Cargando las cuentas" rows={4} />
      </>
    )
  }
  if (data.isError || data.data === undefined) {
    return (
      <>
        <Title text="Cuentas" />
        <LoadFailed />
      </>
    )
  }

  const { pendientes, categories, household, settled } = data.data

  // Bills of this month settled with a credit card -- see figures.ts for
  // why this reads the paid ones. Where they end up is Tarjetas.
  const onCard = billsOnCard(settled)

  const { bills, owed, owedUsd, late } = cuentasFigures({
    pendientes,
    monthStart,
    now,
  })

  const header = (
    <Title
      text="Cuentas"
      sub={`Lo que ${household.name} tiene que pagar, y con qué lo paga.`}
      pager
    />
  )

  if (view === 'tarjetas') {
    const total = billsOnCardTotal(settled)
    return (
      <>
        {header}
        {segment}
        {onCard.length === 0 ? (
          <div className="card empty">
            <span className="orb" aria-hidden="true">
              <CreditCard />
            </span>
            <h3>Ninguna cuenta se pagó con tarjeta</h3>
            <p>
              Cuando marquen una cuenta como pagada con una tarjeta de crédito
              va a aparecer acá: esa plata no sale este mes, llega en el
              resumen.
            </p>
          </div>
        ) : (
          <>
            <div className="card hero">
              <div className="label">
                Cuentas de {monthName(monthStart)} que pagaron con tarjeta
              </div>
              <div className="figure">
                <Figure amount={total} />
              </div>
              <div className="legend">
                <span>
                  Esta plata no salió este mes: va al resumen de{' '}
                  {monthName(nextMonthOf(monthStart))}.
                </span>
              </div>
            </div>
            <div className="sec">
              {onCard.map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  categories={categories}
                  monthStart={monthStart}
                  now={now}
                />
              ))}
            </div>
            <Link className="btn btn-secondary btn-wide" to="/tarjetas">
              <ArrowRight />
              Ver el resumen completo
            </Link>
          </>
        )}
      </>
    )
  }

  return (
    <>
      {header}
      {segment}
      {bills.length === 0 ? (
        <div className="card empty">
          <span className="orb" aria-hidden="true">
            <CalendarClock />
          </span>
          <h3>No les queda nada por pagar</h3>
          <p>
            Cuando carguen una cuenta -- la luz, el gas, las expensas -- la van
            a ver acá hasta que la marquen como pagada.
          </p>
        </div>
      ) : (
        <>
          <div className="card hero">
            <div className="label">Falta pagar</div>
            <div className="figure">
              <Figure amount={owed} />
            </div>
            <div className="legend">
              <span>
                {bills.length} {bills.length === 1 ? 'cuenta' : 'cuentas'} sin
                pagar
              </span>
              {late.length > 0 ? (
                <span>
                  {late.length === 1
                    ? 'Una viene de un mes anterior'
                    : `${String(late.length)} vienen de meses anteriores`}
                </span>
              ) : null}
              {owedUsd > 0 ? (
                <span>
                  Y <b>{formatAmount(owedUsd, 'USD')}</b> en dólares
                </span>
              ) : null}
            </div>
          </div>
          <div className="sec">
            {bills.map((bill) => (
              <BillRow
                key={bill.id}
                bill={bill}
                categories={categories}
                monthStart={monthStart}
                now={now}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function nextMonthOf(monthStart: Date): Date {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
}
