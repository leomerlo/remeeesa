import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  autoDebitsToSettle,
  listPendientes,
  markPendientePaid,
} from '@/lib/pendientes'
import type { HouseholdsDb } from '@/lib/households'
import { expensesInMonthQueryKey } from '@/features/expenses'
import { pendientesQueryKey } from './queryKeys'

export type UseSettleAutoDebitsInput = {
  readonly db: HouseholdsDb
  readonly householdId: string | undefined
  readonly memberId: string | undefined
  readonly authorDisplayName: string | undefined
}

// How many cycles one run will catch up on. A household that has not opened
// the app in a year should not have a hundred Expenses appear at once; at
// that point something is wrong enough to want a person looking at it.
const MAX_CATCH_UP = 12

// Settles the bills the bank has already taken money for.
//
// This app has no server: no Cloud Function, no cron, nothing that runs on a
// schedule. The only code that ever executes is the code in a member's
// browser. So "it pays itself every month" means: the next time either
// member opens remeeesa, any auto-debit bill whose date has passed records
// itself. Since the app gets opened most days, that is hours of lag rather
// than days -- and the Expense is dated the *due date*, not the day someone
// happened to open the app, so it lands in the right month regardless.
//
// Runs once per mount. Both members opening at the same moment is safe:
// markPendientePaid is a transaction that refuses a Pendiente that is not
// still pending, so one wins and the other's attempt is discarded.
export function useSettleAutoDebits({
  db,
  householdId,
  memberId,
  authorDisplayName,
}: UseSettleAutoDebitsInput): void {
  const queryClient = useQueryClient()
  const hasRun = useRef(false)

  useEffect(() => {
    if (
      householdId === undefined ||
      memberId === undefined ||
      authorDisplayName === undefined ||
      hasRun.current
    ) {
      return
    }
    hasRun.current = true
    let cancelled = false

    void (async () => {
      let settledAny = false
      // Re-listing each pass rather than working from one snapshot: paying a
      // recurring bill spawns its next cycle, and if that cycle's date has
      // also passed (two months unopened, say) the bank took that one too.
      for (let pass = 0; pass < MAX_CATCH_UP && !cancelled; pass += 1) {
        let due
        try {
          due = autoDebitsToSettle(await listPendientes({ db, householdId }))
        } catch {
          return
        }
        if (due.length === 0) {
          break
        }
        for (const pendiente of due) {
          if (cancelled) {
            return
          }
          try {
            await markPendientePaid({
              db,
              householdId,
              pendienteId: pendiente.id,
              memberId,
              authorDisplayName,
              // Non-null by construction: autoDebitsToSettle drops the ones
              // with no amount, precisely because there is nothing to record.
              finalAmount: pendiente.expectedAmount ?? 0,
              paymentDate: pendiente.dueDate,
            })
            settledAny = true
          } catch {
            // Already paid by the other member's browser a moment ago, or
            // refused by the rules. Either way there is nothing to retry and
            // nothing worth interrupting the page for.
          }
        }
      }
      if (settledAny && !cancelled) {
        // Both halves: the bills changed status, and each payment wrote an
        // Expense that every month-scoped figure on screen counts.
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: pendientesQueryKey({ householdId }),
          }),
          queryClient.invalidateQueries({
            queryKey: expensesInMonthQueryKey({ householdId }),
          }),
        ])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [db, householdId, memberId, authorDisplayName, queryClient])
}
