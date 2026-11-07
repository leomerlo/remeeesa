import { useQuery } from '@tanstack/react-query'
import { CalendarClock, CreditCard, Info } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { cuotasOf } from '@/lib/cards/cuotas'
import type { Cuota } from '@/lib/cards/cuotas'
import type { Card as PaymentMethod, CardPurchase } from '@/lib/cards'
import { formatAmount, formatCurrency } from '@/lib/expenses'
import { isBillToPay } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
import { MonthPager } from '../MonthPager'
import { useMonth } from '../MonthContext'
import { BillRow, sortBills } from '../rows'
import { monthName } from '../format'
import type { BetaSession } from '../data'
import { LoadFailed, Title } from './Gastos'

export function Cuentas({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  const [view, setView] = useState<'pagar' | 'tarjetas'>('pagar')
  const householdId = session.householdId ?? null
  const now = new Date()
  const { monthStart, monthEnd } = useMonth()

  const data = useQuery({
    queryKey: ['beta', 'cuentas', householdId, monthStart.toISOString()],
    enabled: householdId !== null,
    queryFn: async () => {
      const id = householdId as string
      const [pendientes, categories, cards, purchases] = await Promise.all([
        session.db.listPendientes({ householdId: id }),
        session.db.listCategories(id),
        session.db.listCards({ householdId: id }),
        session.db.listCardPurchasesInMonth({
          householdId: id,
          monthStart,
          monthEnd,
        }),
      ])
      return { pendientes, categories, cards, purchases }
    },
  })

  if (data.isPending) {
    return <div className="card" aria-busy="true" style={{ minHeight: 160 }} />
  }
  if (data.isError || data.data === undefined) {
    return <LoadFailed />
  }

  const { pendientes, categories, cards, purchases } = data.data
  const bills = sortBills(pendientes.filter(isBillToPay), monthStart, now)

  const segment = (
    <div className="segment">
      <button
        type="button"
        aria-pressed={view === 'pagar'}
        onClick={() => setView('pagar')}
      >
        Por pagar
      </button>
      <button
        type="button"
        aria-pressed={view === 'tarjetas'}
        onClick={() => setView('tarjetas')}
      >
        Tarjetas
      </button>
    </div>
  )

  if (view === 'tarjetas') {
    return (
      <>
        <Title text="Cuentas" />
        <MonthPager />
        {segment}
        <div className="card alert alert-info">
          <span className="tile" aria-hidden="true">
            <Info />
          </span>
          <p>
            Estos son gastos que hicieron <b>este mes</b> pero que van a pagar{' '}
            <b>el mes que viene</b>, cuando llegue el resumen.
          </p>
        </div>
        <Cards cards={cards} purchases={purchases} now={now} />
      </>
    )
  }

  // Dollars are shown but never added into a peso total.
  const currencyOf = (bill: Pendiente): Currency =>
    bill.currency ?? DEFAULT_CURRENCY
  const pesos = bills.filter((bill) => currencyOf(bill) === DEFAULT_CURRENCY)
  const dollars = bills.filter((bill) => currencyOf(bill) !== DEFAULT_CURRENCY)
  const owed = pesos.reduce((sum, bill) => sum + (bill.expectedAmount ?? 0), 0)
  const owedUsd = dollars.reduce(
    (sum, bill) => sum + (bill.expectedAmount ?? 0),
    0,
  )

  return (
    <>
      <Title text="Cuentas" />
      <MonthPager />
      {segment}
      {bills.length === 0 ? (
        <div className="card empty">
          <span className="orb" aria-hidden="true">
            <CalendarClock />
          </span>
          <h3>No tienen cuentas cargadas</h3>
          <p>
            La luz, el gas, las expensas. Las cargan una vez y les avisamos
            todos los meses.
          </p>
        </div>
      ) : (
        <>
          <div className="card hero">
            <div className="label">Falta pagar</div>
            <div className="figure">{formatCurrency(owed)}</div>
            <div className="legend">
              <span>
                {pesos.length} {pesos.length === 1 ? 'cuenta' : 'cuentas'}{' '}
                pendientes
              </span>
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

function Cards({
  cards,
  purchases,
  now,
}: {
  readonly cards: readonly PaymentMethod[]
  readonly purchases: readonly CardPurchase[]
  readonly now: Date
}): ReactElement {
  const credit = cards.filter((card) => card.kind === 'credito')

  if (credit.length === 0) {
    return (
      <div className="card empty">
        <span className="orb" aria-hidden="true">
          <CreditCard />
        </span>
        <h3>No cargaron ninguna tarjeta</h3>
        <p>
          Con una tarjeta cargada podemos decirte qué va a venir en el próximo
          resumen.
        </p>
      </div>
    )
  }

  // Cuota k of a purchase made in month M lands in the Resumen of M + k, so
  // this month's purchases make up next month's statement.
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  return (
    <>
      {credit.map((card) => (
        <div className="card cardblk" key={card.id}>
          <div className="ch">
            <span className="tile" aria-hidden="true">
              <CreditCard />
            </span>
            <span className="nm">{card.name}</span>
            <span className="no">
              {card.currency === 'BOTH'
                ? 'En pesos y en dólares'
                : card.currency === 'USD'
                  ? 'En dólares'
                  : 'En pesos'}
            </span>
          </div>
          {(card.currency === 'BOTH'
            ? (['ARS', 'USD'] as const)
            : ([card.currency] as readonly Currency[])
          ).map((currency) => (
            <Resumen
              key={currency}
              card={card}
              currency={currency}
              purchases={purchases}
              next={next}
              showCurrency={card.currency === 'BOTH'}
            />
          ))}
        </div>
      ))}
    </>
  )
}

function Resumen({
  card,
  currency,
  purchases,
  next,
  showCurrency,
}: {
  readonly card: PaymentMethod
  readonly currency: Currency
  readonly purchases: readonly CardPurchase[]
  readonly next: Date
  readonly showCurrency: boolean
}): ReactElement | null {
  const lines = purchases
    .filter(
      (purchase) =>
        purchase.cardId === card.id && purchase.currency === currency,
    )
    .flatMap((purchase) =>
      cuotasOf({
        total: purchase.total,
        cuotas: purchase.cuotas,
        purchaseDate: purchase.purchaseDate,
      })
        .filter(
          (cuota: Cuota) =>
            cuota.monthStart.getFullYear() === next.getFullYear() &&
            cuota.monthStart.getMonth() === next.getMonth(),
        )
        .map((cuota: Cuota) => ({
          ...cuota,
          name: purchase.name,
          of: purchase.cuotas,
        })),
    )

  if (lines.length === 0) {
    return null
  }
  const total = lines.reduce((sum, line) => sum + line.amount, 0)

  return (
    <div className="resumen">
      <div className="rh">
        <span className="rt">
          Resumen de {monthName(next)}
          {showCurrency ? (currency === 'USD' ? ' · dólares' : ' · pesos') : ''}
        </span>
        <span className="rv">{formatAmount(total, currency)}</span>
      </div>
      {/* A card that closes on a different day every month cannot be
          promised a date here -- the v1 rejected a fixed closing day for
          exactly that reason. */}
      <div className="hint">
        Estimado. Cuando llegue el resumen cargan el monto real y la fecha en
        que vence.
      </div>
      {lines.map((line) => (
        <div className="cuota" key={`${line.name}-${String(line.number)}`}>
          <span className="cn">{line.name}</span>
          <span className="cm">
            {line.of === 1
              ? 'Un solo pago'
              : `Cuota ${String(line.number)} de ${String(line.of)}`}
          </span>
          <span className="ca">{formatAmount(line.amount, currency)}</span>
        </div>
      ))}
    </div>
  )
}
