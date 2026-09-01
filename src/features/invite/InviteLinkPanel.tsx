import { useState } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getOrCreateHouseholdInvite } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'

export type InviteClipboard = {
  readonly writeText: (text: string) => Promise<void>
}

export type InviteLinkPanelProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly urlBase?: string
  readonly clipboard?: InviteClipboard
}

function inviteUrlFor(input: {
  readonly urlBase: string
  readonly token: string
}): string {
  return `${input.urlBase}/join/${input.token}`
}

export function InviteLinkPanel({
  db,
  householdId,
  urlBase = window.location.origin,
  clipboard = navigator.clipboard,
}: InviteLinkPanelProps): ReactElement {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onGenerate(): Promise<void> {
    try {
      const invite = await getOrCreateHouseholdInvite({ db, householdId })
      setInviteUrl(inviteUrlFor({ urlBase, token: invite.token }))
      setError(null)
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'No se pudo generar el link de invitación'
      setError(message)
    }
  }

  async function onCopy(): Promise<void> {
    if (inviteUrl === null) {
      return
    }
    await clipboard.writeText(inviteUrl)
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <Button type="button" onClick={() => void onGenerate()}>
        Generar link de invitación
      </Button>
      {inviteUrl !== null ? (
        <>
          <Label
            htmlFor="invite-url"
            className="text-muted-foreground font-medium"
          >
            Link de invitación
          </Label>
          <Input id="invite-url" name="invite-url" readOnly value={inviteUrl} />
          <Button type="button" variant="outline" onClick={() => void onCopy()}>
            Copiar
          </Button>
        </>
      ) : null}
      {error !== null ? (
        <p role="alert" className="text-sm font-medium">
          {error}
        </p>
      ) : null}
    </div>
  )
}
