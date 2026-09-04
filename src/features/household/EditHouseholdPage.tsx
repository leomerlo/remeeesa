import { useEffect, useMemo, useState } from 'react'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { LogoutButton } from '@/features/auth'
import { InviteLinkPanel } from '@/features/invite'
import { useFirebase } from '@/lib/firebaseContext'
import { createFirestoreHouseholdsDb, getMembership } from '@/lib/households'
import type { HouseholdMember, HouseholdsDb } from '@/lib/households'
import { EditDisplayNameForm } from './EditDisplayNameForm'
import { EditHouseholdForm } from './EditHouseholdForm'
import { MemberList } from './MemberList'

export type EditHouseholdPageProps = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

export function EditHouseholdPage({
  currentUserId: currentUserIdProp,
  householdsDb,
}: EditHouseholdPageProps): ReactElement {
  const firebase = useFirebase()
  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(
    undefined,
  )
  const currentUserId =
    currentUserIdProp !== undefined ? currentUserIdProp : sessionUserId
  const usesLiveSession = currentUserIdProp === undefined
  const db = useMemo(
    () => householdsDb ?? createFirestoreHouseholdsDb(firebase.db),
    [householdsDb, firebase.db],
  )
  const [membership, setMembership] = useState<
    HouseholdMember | null | undefined
  >(undefined)

  useEffect(() => {
    if (currentUserIdProp !== undefined) {
      return
    }
    let cancelled = false
    let authReady = false

    void firebase.auth.authStateReady().then(() => {
      if (cancelled) {
        return
      }
      authReady = true
      setSessionUserId(firebase.auth.currentUser?.uid ?? null)
    })

    const unsubscribe = firebase.auth.onAuthStateChanged((user) => {
      if (!cancelled && authReady) {
        setSessionUserId(user?.uid ?? null)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [currentUserIdProp, firebase.auth])

  useEffect(() => {
    if (typeof currentUserId !== 'string') {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const member = await getMembership({ db, userId: currentUserId })
        if (!cancelled) {
          setMembership(member)
        }
      } catch {
        if (!cancelled) {
          setMembership(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUserId, db])

  if (currentUserId === undefined) {
    return (
      <div className="bg-card shadow-resting w-full rounded-3xl p-8">
        <LoadingIndicator />
      </div>
    )
  }

  if (currentUserId === null) {
    return <Navigate to="/" replace />
  }

  if (membership === undefined) {
    return (
      <div className="bg-card shadow-resting w-full rounded-3xl p-8">
        <LoadingIndicator />
      </div>
    )
  }

  if (membership === null) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex w-full flex-col gap-8">
      {/* No "Volver" back-link: Ajustes is a primary bottom-nav destination
          like Home/Histórico/Categorías, not a drill-down sub-page -- the
          nav already gets you back in one tap. */}
      <PageHeader title="Ajustes" />
      <div className="bg-card shadow-resting flex w-full flex-col gap-6 rounded-3xl p-6">
        <EditHouseholdForm db={db} householdId={membership.householdId} />
      </div>
      {/* Members and the invite link share one card: inviting somebody is
          how the member list grows, and the invite panel on its own was a
          card whose entire contents were a single button. */}
      <div className="bg-card shadow-resting flex w-full flex-col gap-6 rounded-3xl p-6">
        <EditDisplayNameForm
          db={db}
          householdId={membership.householdId}
          userId={currentUserId}
          currentDisplayName={membership.displayName}
        />
        <MemberList
          db={db}
          householdId={membership.householdId}
          currentUserId={currentUserId}
        />
        <InviteLinkPanel db={db} householdId={membership.householdId} />
      </div>
      {usesLiveSession ? (
        <div className="flex w-full justify-center">
          <LogoutButton />
        </div>
      ) : null}
    </div>
  )
}
