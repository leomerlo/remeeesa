import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { leaveHousehold } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'

export type LeaveHouseholdButtonProps = {
  readonly db: HouseholdsDb
  readonly userId: string
}

export function LeaveHouseholdButton({
  db,
  userId,
}: LeaveHouseholdButtonProps): ReactElement {
  return (
    <Button
      type="button"
      onClick={() => {
        void leaveHousehold({ db, userId })
      }}
    >
      Salir del hogar
    </Button>
  )
}
