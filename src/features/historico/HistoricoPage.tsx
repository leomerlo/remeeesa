import { useState } from 'react'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { ReactElement } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { AddExpenseSheet, ExpenseHistory } from '@/features/expenses'
import type { EditExpenseTarget } from '@/features/expenses/AddExpenseForm'
import { useHouseholdMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'

export type HistoricoPageProps = {
  readonly currentUserId?: string | null
  readonly authorDisplayName?: string
  readonly householdsDb?: HouseholdsDb
}

export function HistoricoPage({
  currentUserId: currentUserIdProp,
  authorDisplayName = 'Miembro',
  householdsDb,
}: HistoricoPageProps): ReactElement {
  const { currentUserId, db, membership } = useHouseholdMembership({
    ...(currentUserIdProp === undefined
      ? {}
      : { currentUserId: currentUserIdProp }),
    ...(householdsDb === undefined ? {} : { householdsDb }),
  })
  const [editExpense, setEditExpense] = useState<EditExpenseTarget | null>(null)

  // The header renders in every state so this nav destination is never a
  // blank page while the session/membership resolve.
  const header = <PageHeader title="Histórico" />

  // Signed-out is checked before membership, not alongside it:
  // useHouseholdMembership only resolves membership for a signed-in user, so
  // for a signed-out one it stays undefined forever. Folding the two
  // undefined cases together would leave this screen stuck on "Cargando…"
  // permanently instead of showing its empty state.
  if (currentUserId === undefined) {
    return (
      <div className="flex w-full flex-col gap-8">
        {header}
        <LoadingIndicator />
      </div>
    )
  }

  if (currentUserId === null || membership === null) {
    return (
      <div className="flex w-full flex-col gap-8">
        {header}
        <p role="status" className="text-sm font-medium">
          Todavía no hay gastos
        </p>
      </div>
    )
  }

  if (membership === undefined) {
    return (
      <div className="flex w-full flex-col gap-8">
        {header}
        <LoadingIndicator />
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-8">
      {header}
      {/* Editing from here reuses the very same sheet as Home, so correcting
          an expense from an old month behaves identically to correcting one
          from this month -- including the delete action, which lives inside
          that sheet rather than on the row. `open={false}` because this
          screen has no "add" entry point: the sheet only ever opens because
          editExpense was set by tapping a row. */}
      <AddExpenseSheet
        open={false}
        showTrigger={false}
        onOpenChange={() => {}}
        db={db}
        householdId={membership.householdId}
        memberId={currentUserId}
        authorDisplayName={authorDisplayName}
        editExpense={editExpense}
        onEditFinished={() => {
          setEditExpense(null)
        }}
      />
      <ExpenseHistory
        db={db}
        householdId={membership.householdId}
        onEditExpense={(expense, categoryName) => {
          setEditExpense({
            expenseId: expense.id,
            name: expense.name,
            price: expense.price,
            categoryName,
            comments: expense.comments,
            expenseDate: expense.expenseDate,
            memberId: expense.memberId,
            pendienteId: expense.pendienteId,
            isService: expense.isService,
          })
        }}
      />
    </div>
  )
}
