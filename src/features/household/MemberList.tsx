import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Pencil, UserPlus } from 'lucide-react'
import { TintedBadge } from '@/components/CategoryBadge'
import { MovementCard } from '@/components/MovementCard'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cssVars } from '@/lib/cssVars'
import {
  colorForCategoryName,
  inkForCategoryColor,
} from '@/lib/expenses/categoryColor'
import { listHouseholdMembers } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { InviteLinkPanel } from '@/features/invite'
import { EditDisplayNameForm } from './EditDisplayNameForm'
import { membersQueryKey } from './membersQueryKey'

export type MemberListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly currentUserId: string
  readonly currentDisplayName: string
}

const JOINED_FORMAT = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  year: 'numeric',
})

// The household's people, one card each -- the same card a category, a
// movement and a credit card wear.
//
// This section used to stack three unrelated things in one panel: a form
// for your own name, a list of avatars, and a button that made an invite
// link. They are a setting about you, a fact about the household, and an
// action, and none of them said which. Now the household *is* the list, your
// own card is the only one with "Cambiar nombre" on it (you cannot rename
// anyone else), and inviting is the last tile -- the empty slot at the end
// of the people you have. Per direct feedback.
export function MemberList({
  db,
  householdId,
  currentUserId,
  currentDisplayName,
}: MemberListProps): ReactElement {
  const [isRenaming, setIsRenaming] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  const membersQuery = useQuery({
    queryKey: membersQueryKey({ householdId }),
    queryFn: () => listHouseholdMembers({ db, householdId }),
  })
  const members = membersQuery.data

  const heading = (
    <h2 id="integrantes-heading" className="text-title font-semibold">
      Integrantes
    </h2>
  )

  if (members === undefined) {
    return (
      <section
        aria-labelledby="integrantes-heading"
        className="flex w-full flex-col gap-3"
      >
        {heading}
        <div
          role="status"
          aria-label="Cargando…"
          className="grid grid-cols-1 gap-3 lg:grid-cols-2"
        >
          <span className="sr-only">Cargando…</span>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      </section>
    )
  }

  // You first, then by when they joined: the card you can act on is the one
  // you are looking for.
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
      aria-labelledby="integrantes-heading"
      className="flex w-full flex-col gap-3"
    >
      {heading}
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {ordered.map((member) => {
          const isCurrentUser = member.userId === currentUserId
          // Reuses the category-colour hash (any string in, one of the
          // palette's hues out) for a per-member avatar tint -- there is no
          // member-specific colour concept, just the same "give this string
          // a consistent colour" need categories already solved.
          const avatarColor = colorForCategoryName(member.userId)
          return (
            <li key={member.userId}>
              <MovementCard
                categoryName={member.displayName}
                categoryColor={avatarColor}
                CategoryIcon={Pencil}
                showCategoryBadge={false}
                iconSlot={
                  <span
                    aria-hidden="true"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--swatch-color)] font-semibold text-[var(--swatch-ink)]"
                    style={cssVars({
                      '--swatch-color': avatarColor,
                      '--swatch-ink': inkForCategoryColor(avatarColor),
                    })}
                  >
                    {member.displayName.charAt(0).toUpperCase()}
                  </span>
                }
                title={member.displayName}
                amount={
                  isCurrentUser ? (
                    <TintedBadge label="Vos" color="#4e4c56" />
                  ) : null
                }
                // joinedAt has been in the model all along and was shown
                // nowhere; it is exactly the second line this card wants.
                when={`Desde ${JOINED_FORMAT.format(member.joinedAt)}`}
                {...(isCurrentUser
                  ? {
                      actions: (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsRenaming(true)
                          }}
                        >
                          <Pencil aria-hidden="true" />
                          Cambiar mi nombre
                        </Button>
                      ),
                    }
                  : {})}
              />
            </li>
          )
        })}
        <li>
          {/* The empty slot at the end of the people you have. Dashed and
              unfilled: it is a place for somebody, not somebody. */}
          <button
            type="button"
            className="border-border text-muted-foreground hover:border-foreground hover:text-foreground focus-visible:ring-ring/50 flex h-full min-h-[6.5rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 transition-colors outline-none focus-visible:ring-3"
            onClick={() => {
              setIsInviting(true)
            }}
          >
            <UserPlus aria-hidden="true" className="size-6" />
            <span className="text-sm font-semibold">Invitar a alguien</span>
          </button>
        </li>
      </ul>

      <Sheet
        open={isRenaming}
        onOpenChange={setIsRenaming}
        title="Cambiar mi nombre"
      >
        <EditDisplayNameForm
          db={db}
          householdId={householdId}
          userId={currentUserId}
          currentDisplayName={currentDisplayName}
          onSaved={() => {
            setIsRenaming(false)
          }}
        />
      </Sheet>

      <Sheet
        open={isInviting}
        onOpenChange={setIsInviting}
        title="Invitar a alguien"
      >
        <div className="flex w-full flex-col gap-4">
          <div className="flex flex-col gap-1">
            {/* No heading: the Sheet's header row already says this. */}
            <p className="text-muted-foreground text-sm">
              Generá un link y mandáselo. Quien lo abra entra a este hogar y ve
              los mismos gastos que vos.
            </p>
          </div>
          <InviteLinkPanel db={db} householdId={householdId} />
        </div>
      </Sheet>
    </section>
  )
}
