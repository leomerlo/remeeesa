import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { listHouseholdMembers } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { membersQueryKey } from './membersQueryKey'

export type MemberListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly currentUserId: string
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
      <section className="flex w-full flex-col gap-3">
        <h2 className="text-title font-semibold">Integrantes</h2>
        <div
          role="status"
          aria-label="Cargando…"
          className="flex flex-col gap-3"
        >
          <span className="sr-only">Cargando…</span>
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </section>
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
          const isCurrentUser = member.userId === currentUserId
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
                {member.displayName.charAt(0).toUpperCase()}
              </span>
              <span className="text-foreground font-medium">
                {member.displayName}
              </span>
              {isCurrentUser ? (
                <span className="text-muted-foreground text-xs">Vos</span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
