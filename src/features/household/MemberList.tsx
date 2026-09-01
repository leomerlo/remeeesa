import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { listHouseholdMembers } from '@/lib/households'
import type { HouseholdMember, HouseholdsDb } from '@/lib/households'

export type MemberListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly currentUserId: string
}

function membersQueryKey(input: {
  readonly householdId: string
}): readonly ['household-members', string] {
  return ['household-members', input.householdId]
}

function memberLabel(input: {
  readonly member: HouseholdMember
  readonly currentUserId: string
}): string {
  if (input.member.userId === input.currentUserId) {
    return 'Vos'
  }
  return 'Miembro'
}

export function MemberList({
  db,
  householdId,
  currentUserId,
}: MemberListProps): ReactElement {
  const membersQuery = useQuery({
    queryKey: membersQueryKey({ householdId }),
    queryFn: () => listHouseholdMembers({ db, householdId }),
  })
  const members = membersQuery.data

  if (members === undefined) {
    return (
      <p role="status" className="text-sm font-medium">
        Cargando…
      </p>
    )
  }

  const ordered = [...members].sort((left, right) => {
    if (left.userId === currentUserId) {
      return -1
    }
    if (right.userId === currentUserId) {
      return 1
    }
    return left.joinedAt.getTime() - right.joinedAt.getTime()
  })

  return (
    <section
      className="flex w-full flex-col gap-2"
      aria-labelledby="participants-heading"
    >
      <h2 id="participants-heading" className="text-sm font-medium">
        Integrantes
      </h2>
      <ul className="flex flex-col gap-1">
        {ordered.map((member) => (
          <li key={member.userId} className="text-sm">
            {memberLabel({ member, currentUserId })}
          </li>
        ))}
      </ul>
    </section>
  )
}
