import { useQuery } from '@tanstack/react-query'
import { CreditCard, Info } from 'lucide-react'
import type { ReactElement } from 'react'
import {
  cardsDueNextMonth,
  cardsDueNextMonthTotals,
  listResumenCuotas,
} from '@/lib/cards'
import type { ResumenCuota } from '@/lib/cards'
import { formatAmount } from '@/lib/expenses'
import type { Pendiente } from '@/lib/pendientes'
import { DEFAULT_CURRENCY } from '@/lib/money'
import { CardBrandMark } from '../CardBrandMark'
import { ListSkeleton, NameSkel } from '../Skeleton'
import { Figure } from '../Figure'
import { useMonth } from '../MonthContext'
import { PurchaseRow } from '../rows'
import { monthName } from '../format'
import type { BetaSession } from '../data'
import { LoadFailed, Title } from './Gastos'

// Everything the cards are doing, in one place.
//
// It exists because card money arrives at the app from three directions --
// a gasto put on a card, a cuenta paid with a card, and the cuotas of
// purchases made months ago -- and each of the other screens can only
// honestly show its own one of the three. This is where they meet: the
// statement each card is going to send, with every line that makes it up,
// whatever month that line came from.
//
// The month on screen is still the month on screen. What is said here is
// what it *turns into*: October's consumos are November's bill.
export function Tarjetas({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  const householdId = session.householdId ?? null
  const { monthStart, monthEnd } = useMonth()
  const next = nextMonthOf(monthStart)

  const data = useQuery({
    queryKey: ['beta', 'tarjetas', householdId, monthStart.toISOString()],
    enabled: householdId !== null,
    queryFn: async () => {
      const id = householdId as string
      const [pendientes, cards, categories, purchases, members] =
        await Promise.all([
          session.db.listPendientes({ householdId: id }),
          session.db.listCards({ householdId: id }),
          session.db.listCategories(id),
          session.db.listCardPurchasesInMonth({
            householdId: id,
            monthStart,
            monthEnd,
          }),
          session.db.listMembers(id),
        ])
      // The statements the cards will send for the month after the one on
      // screen, read off the Resúmenes the app already keeps rather than
      // re-added from purchases -- recomputing them missed every cuota of
      // an older one.
      const resumenes = cardsDueNextMonth(pendientes, monthStart)
      const cuotas = await Promise.all(
        resumenes.map((resumen) =>
          listResumenCuotas({ db: session.db, householdId: id, resumen }),
        ),
      )
      return {
        pendientes,
        cards,
        categories,
        purchases,
        members,
        resumenes,
        cuotas,
      }
    },
  })

  if (data.isPending) {
    return (
      <>
        <Title text="Tarjetas" sub={<NameSkel />} pager />
        <ListSkeleton label="Cargando las tarjetas" rows={4} />
      </>
    )
  }
  if (data.isError || data.data === undefined) {
    return (
      <>
        <Title text="Tarjetas" />
        <LoadFailed />
      </>
    )
  }

  const {
    pendientes,
    cards,
    categories,
    purchases,
    members,
    resumenes,
    cuotas,
  } = data.data
  const several = members.length > 1
  const totals = cardsDueNextMonthTotals(pendientes, monthStart)
  const credit = cards.filter((card) => card.kind === 'credito')

  return (
    <>
      <Title
        text="Tarjetas"
        sub="Todo lo que pagaron con tarjetas de crédito, ya sean gastos o servicios."
        pager
      />

      <div className="hood solo">
        <div className="card hero">
          <div className="label">Los resúmenes de {monthName(next)}</div>
          <div className="figure">
            {totals.length === 0 ? (
              <Figure amount={0} />
            ) : (
              totals.map(({ currency, total }) => (
                <Figure
                  className="one"
                  key={currency}
                  amount={total}
                  currency={currency}
                />
              ))
            )}
          </div>
          <div className="legend">
            <span>
              Es lo que las tarjetas van a pedir. Siempre estimado: el monto
              real lo cargan cuando pagan, porque ahí se le suman impuestos e
              intereses.
            </span>
          </div>
        </div>
      </div>

      {credit.length === 0 ? (
        <div className="card empty">
          <span className="orb" aria-hidden="true">
            <CreditCard />
          </span>
          <h3>No cargaron ninguna tarjeta</h3>
          <p>
            Con una tarjeta cargada podemos decirles qué va a venir en el
            próximo resumen.
          </p>
        </div>
      ) : (
        credit.map((card) => {
          const mine = resumenes
            .map((resumen, index) => ({ resumen, lines: cuotas[index] ?? [] }))
            .filter(({ resumen }) => resumen.cardId === card.id)
          return (
            <div className="card cardblk" key={card.id}>
              <div className="ch">
                {/* The brand's own mark, the way the v1 draws it: nobody
                    has to read the name to know which card it is. */}
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
        })
      )}

      {purchases.length > 0 ? (
        <>
          <div className="card alert alert-info">
            <span className="tile" aria-hidden="true">
              <Info />
            </span>
            <p>
              Esto es lo que pusieron en una tarjeta durante{' '}
              <b>{monthName(monthStart)}</b>. Empieza a cobrarse en el resumen
              de <b>{monthName(next)}</b>, entero o en cuotas.
            </p>
          </div>
          <div className="sec">
            {purchases.map((purchase) => (
              <PurchaseRow
                key={purchase.id}
                purchase={purchase}
                categories={categories}
                several={several}
              />
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}

function nextMonthOf(monthStart: Date): Date {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
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
