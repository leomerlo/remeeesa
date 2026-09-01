import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
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
      className="flex w-full flex-col gap-3"
      aria-labelledby="participants-heading"
    >
      <h2 id="participants-heading" className="text-title font-semibold">
        Integrantes
      </h2>
      <ul className="flex flex-col gap-3">
        {ordered.map((member) => {
          const label = memberLabel({ member, currentUserId })
          // Reuses the category-color hash (any string in, one of the
          // palette's 8 hues out) for a per-member avatar tint -- there's
          // no member-specific color concept, just the same "give this
          // string a consistent color" need categories already solved.
          const avatarColor = colorForCategoryName(member.userId)

          return (
            <li key={member.userId} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: avatarColor }}
              >
                {label.charAt(0).toUpperCase()}
              </span>
              <span className="text-foreground font-medium">{label}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
