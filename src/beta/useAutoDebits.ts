import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { markPendientePaidWithCard } from '@/lib/cards'
import type { Card as PaymentMethod } from '@/lib/cards'
import { autoDebitsToSettle, markPendientePaid } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import type { BetaSession } from './data'

// The bills the household does not pay: the bank does.
//
// A bill on débito automático is taken on its due date whether or not
// anybody opened the app, so once that date has passed the money is gone
// and leaving it in "Por pagar" is simply wrong. This settles those, the
// way the v1 does -- the beta had the badge and the toggle and never the
// settling, so a servicio on débito automático sat unpaid for ever and
// went red.
//
// It settles with whatever the bill says it is paid with, which is the
// point of that field: the bank debits Edenor from one particular card
// every month, and nobody is there to choose when it happens. On a credit
// card that writes a consumo rather than a gasto -- the money does not
// leave this month, it lands in that card's resumen -- which is also what
// puts it on the "Con tarjeta" side of Servicios.
//
// A bill with no amount yet is deliberately left alone (autoDebitsToSettle
// drops it): there is no figure to record, and recording one would be
// inventing it.
export function useAutoDebits(session: BetaSession): void {
  const client = useQueryClient()
  const householdId = session.householdId
  const memberId = session.userId
  const author = session.displayName
  // Once per load. Two members' browsers may both try; whoever loses the
  // race gets a refusal and nothing to retry.
  const ran = useRef(false)

  useEffect(() => {
    if (
      householdId === null ||
      householdId === undefined ||
      memberId === null ||
      memberId === undefined ||
      ran.current
    ) {
      return
    }
    ran.current = true
    let cancelled = false

    void (async () => {
      let due: readonly Pendiente[]
      let methods: readonly PaymentMethod[]
      try {
        const [pendientes, cards] = await Promise.all([
          session.db.listPendientes({ householdId }),
          session.db.listCards({ householdId }),
        ])
        due = autoDebitsToSettle(pendientes)
        methods = cards
      } catch {
        return
      }
      // Only the ones that say what they are debited from.
      //
      // A bill on débito automático is taken from an account or a card --
      // never from cash, which is the one thing "no method" would end up
      // recording. Settling a bill that has not been told yet would write
      // "pagado en efectivo" onto something the bank put on the Visa, and
      // that is worse than leaving it sitting there: it is a wrong answer
      // instead of a missing one, and the household would have to undo
      // the payment to correct it.
      //
      // So a bill with no method waits, wearing its badge, until somebody
      // says what takes it. Which is one tap in its own form.
      const told = due.filter((bill) => bill.paymentMethodId != null)
      if (told.length === 0 || cancelled) return

      const byId = new Map(methods.map((method) => [method.id, method]))
      let settled = false
      for (const bill of told) {
        if (cancelled) return
        const method =
          bill.paymentMethodId == null
            ? undefined
            : byId.get(bill.paymentMethodId)
        try {
          if (method?.kind === 'credito') {
            await markPendientePaidWithCard({
              db: session.db,
              householdId,
              pendienteId: bill.id,
              cardId: method.id,
              memberId,
              authorDisplayName: author ?? 'Alguien',
              // Non-null by construction: autoDebitsToSettle drops the
              // ones with no amount, precisely because there is nothing
              // to record.
              finalAmount: bill.expectedAmount ?? 0,
              // A bill is one payment, never in cuotas: the bank takes it
              // whole on the day.
              cuotas: 1,
              paymentDate: bill.dueDate,
              currency: bill.currency ?? 'ARS',
            })
          } else {
            await markPendientePaid({
              db: session.db,
              householdId,
              pendienteId: bill.id,
              memberId,
              authorDisplayName: author ?? 'Alguien',
              finalAmount: bill.expectedAmount ?? 0,
              paymentDate: bill.dueDate,
              paymentMethodId: bill.paymentMethodId ?? null,
            })
          }
          settled = true
        } catch {
          // Settled by the other member's browser a moment ago, or
          // refused by the rules. Either way there is nothing to retry and
          // nothing worth interrupting the screen for.
        }
      }
      if (settled && !cancelled) {
        // Every query the beta makes hangs off this one key.
        await client.invalidateQueries({ queryKey: ['beta'] })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [client, session, householdId, memberId, author])
}
