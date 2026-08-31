import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import type { HouseholdsDb } from '@/lib/households'
import { AddExpenseForm } from './AddExpenseForm'
import type { EditExpenseTarget } from './AddExpenseForm'

export type AddExpenseSheetProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly editExpense?: EditExpenseTarget | null
  readonly onEditFinished?: () => void
}

export function AddExpenseSheet({
  open,
  onOpenChange,
  db,
  householdId,
  memberId,
  authorDisplayName,
  editExpense = null,
  onEditFinished,
}: AddExpenseSheetProps): ReactElement {
  if (editExpense !== null) {
    // Deliberately left bypassing the sheet -- routing the edit flow through
    // the same <Sheet> is a separate later issue (#71).
    return (
      <AddExpenseForm
        db={db}
        householdId={householdId}
        memberId={memberId}
        authorDisplayName={authorDisplayName}
        editExpense={editExpense}
        onEditFinished={onEditFinished}
      />
    )
  }

  return (
    <>
      {!open ? (
        <Button
          onClick={() => {
            onOpenChange(true)
          }}
        >
          Add expense
        </Button>
      ) : null}
      <Sheet open={open} onOpenChange={onOpenChange} title="Add expense">
        <AddExpenseForm
          db={db}
          householdId={householdId}
          memberId={memberId}
          authorDisplayName={authorDisplayName}
          onAdded={() => {
            onOpenChange(false)
          }}
        />
      </Sheet>
    </>
  )
}
