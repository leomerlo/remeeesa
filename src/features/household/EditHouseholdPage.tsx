import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { LogoutButton } from '@/features/auth'
import { InviteLinkPanel } from '@/features/invite'
import { useFirebase } from '@/lib/firebaseContext'
import { createFirestoreHouseholdsDb, getMembership } from '@/lib/households'
import type { HouseholdMember, HouseholdsDb } from '@/lib/households'
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
      <div className="bg-muted w-full rounded-3xl p-8">
        <p role="status" className="text-sm font-medium">
          Cargando…
        </p>
      </div>
    )
  }

  if (currentUserId === null) {
    return <Navigate to="/" replace />
  }

  if (membership === undefined) {
    return (
      <div className="bg-muted w-full rounded-3xl p-8">
        <p role="status" className="text-sm font-medium">
          Cargando…
        </p>
      </div>
    )
  }

  if (membership === null) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="bg-muted flex w-full flex-col items-center gap-8 rounded-3xl p-8">
      <Button variant="ghost" asChild className="self-start">
        <Link to="/">Volver</Link>
      </Button>
      <EditHouseholdForm db={db} householdId={membership.householdId} />
      <MemberList
        db={db}
        householdId={membership.householdId}
        currentUserId={currentUserId}
      />
      <InviteLinkPanel db={db} householdId={membership.householdId} />
      {usesLiveSession ? <LogoutButton /> : null}
    </div>
  )
}
