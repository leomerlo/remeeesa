import { useQuery } from '@tanstack/react-query'
import { CalendarClock, CreditCard, Info } from 'lucide-react'
import type { ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cardsDueNextMonth, listResumenCuotas } from '@/lib/cards'
import type { ResumenCuota } from '@/lib/cards'
import type { Card as PaymentMethod } from '@/lib/cards'
import { formatAmount } from '@/lib/expenses'
import type { Pendiente } from '@/lib/pendientes'
import { DEFAULT_CURRENCY } from '@/lib/money'
import { cuentasFigures } from '../figures'

import { CardBrandMark } from '../CardBrandMark'
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
  const { monthStart } = useMonth()

  const data = useQuery({
    queryKey: ['beta', 'cuentas', householdId, monthStart.toISOString()],
    enabled: householdId !== null,
    queryFn: async () => {
      const id = householdId as string
      const [pendientes, categories, cards, household] = await Promise.all([
        session.db.listPendientes({ householdId: id }),
        session.db.listCategories(id),
        session.db.listCards({ householdId: id }),
        session.db.getHousehold(id),
      ])
      // The statements the cards will send for the month after the one on
      // screen, read off the Resúmenes the app already keeps -- the same
      // documents the v1's "Tarjetas el mes que viene" reads. Recomputing
      // them from this month's purchases missed every cuota of an older
      // one.
      const resumenes = cardsDueNextMonth(pendientes, monthStart)
      const cuotas = await Promise.all(
        resumenes.map((resumen) =>
          listResumenCuotas({ db: session.db, householdId: id, resumen }),
        ),
      )
      return { pendientes, categories, cards, household, resumenes, cuotas }
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

  const { pendientes, categories, cards, household, resumenes, cuotas } =
    data.data

  const { bills, owed, owedUsd, late } = cuentasFigures({
    pendientes,
    monthStart,
    now,
  })

  if (view === 'tarjetas') {
    return (
      <>
        <Title
          text="Cuentas"
          sub={`Lo que ${household.name} tiene que pagar, y lo que va a pedir la tarjeta.`}
          pager
        />
        {segment}
        <div className="card alert alert-info">
          <span className="tile" aria-hidden="true">
            <Info />
          </span>
          <p>
            Lo que van a pedir los resúmenes de{' '}
            <b>{monthName(nextMonthOf(monthStart))}</b>. Siempre es un estimado:
            el monto real lo cargan cuando pagan, porque ahí se le suman
            impuestos e intereses.
          </p>
        </div>
        <Cards
          cards={cards}
          resumenes={resumenes}
          cuotas={cuotas}
          monthStart={monthStart}
        />
      </>
    )
  }

  return (
    <>
      <Title
        text="Cuentas"
        sub={`Lo que ${household.name} tiene que pagar, y lo que va a pedir la tarjeta.`}
        pager
      />
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

function Cards({
  cards,
  resumenes,
  cuotas,
  monthStart,
}: {
  readonly cards: readonly PaymentMethod[]
  readonly resumenes: readonly Pendiente[]
  readonly cuotas: readonly (readonly ResumenCuota[])[]
  readonly monthStart: Date
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
          Con una tarjeta cargada podemos decirles qué va a venir en el próximo
          resumen.
        </p>
      </div>
    )
  }

  const next = nextMonthOf(monthStart)

  return (
    <>
      {credit.map((card) => {
        const mine = resumenes
          .map((resumen, index) => ({ resumen, lines: cuotas[index] ?? [] }))
          .filter(({ resumen }) => resumen.cardId === card.id)
        return (
          <div className="card cardblk" key={card.id}>
            <div className="ch">
              {/* The brand's own mark, the way the v1 draws it: nobody has
                  to read the name to know which card it is. */}
              <span className="tile brand" aria-hidden="true">
                <CardBrandMark brand={card.brand} />
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
            {mine.length === 0 ? (
              <div className="resumen">
                <div className="hint">
                  Sin consumos para el resumen de {monthName(next)}.
                </div>
              </div>
            ) : (
              mine.map(({ resumen, lines }) => (
                <Resumen
                  key={resumen.id}
                  resumen={resumen}
                  lines={lines}
                  showCurrency={card.currency === 'BOTH'}
                />
              ))
            )}
          </div>
        )
      })}
    </>
  )
}

function Resumen({
  resumen,
  lines,
  showCurrency,
}: {
  readonly resumen: Pendiente
  readonly lines: readonly ResumenCuota[]
  readonly showCurrency: boolean
}): ReactElement {
  const currency = resumen.currency ?? DEFAULT_CURRENCY
  // Added up from the rows listed below it, not read off the Resumen's
  // stored total: this figure's job is to be what that list comes to. The
  // v1 computes it the same way, for the same reason.
  const total =
    lines.reduce(
      (cents, { cuota }) => cents + Math.round(cuota.amount * 100),
      0,
    ) / 100
  const loaded = resumen.expectedAmount

  return (
    <div className="resumen">
      <div className="rh">
        <span className="rt">
          Resumen de {monthName(resumen.dueDate)}
          {showCurrency ? (currency === 'USD' ? ' · dólares' : ' · pesos') : ''}
        </span>
        <span className="rv">{formatAmount(total, currency)}</span>
      </div>
      {/* A card that closes on a different day every month cannot be
          promised a date here -- the v1 rejected a fixed closing day for
          exactly that reason. */}
      <div className="hint">
        {loaded === null
          ? 'Estimado. Cuando llegue el resumen cargan el monto real.'
          : `Ya cargaron el resumen: ${formatAmount(loaded, currency)}.`}
      </div>
      {lines.map(({ purchase, cuota }) => (
        <div className="cuota" key={`${purchase.id}-${String(cuota.number)}`}>
          <span className="cn">{purchase.name}</span>
          <span className="cm">
            {purchase.cuotas === 1
              ? 'Un solo pago'
              : `Cuota ${String(cuota.number)} de ${String(purchase.cuotas)}`}
          </span>
          <span className="ca">{formatAmount(cuota.amount, currency)}</span>
        </div>
      ))}
    </div>
  )
}
