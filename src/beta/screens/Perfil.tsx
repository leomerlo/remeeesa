import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight,
  Download,
  House,
  LogOut,
  Plus,
  UserPlus,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { useFirebase } from '@/lib/firebaseContext'
import { PAYMENT_METHOD_KINDS } from '@/lib/cards'
import type { Card as PaymentMethod } from '@/lib/cards'
import { CardBrandMark } from '../CardBrandMark'
import { ProfileSkeleton } from '../Skeleton'
import type { BetaSession } from '../data'
import { HogarSheet, InvitarSheet } from '../sheets/HogarSheet'
import { CuentaSheet } from '../sheets/CuentaSheet'
import { ExportarSheet } from '../sheets/ExportarSheet'
import { MetodoSheet } from '../sheets/MetodoSheet'
import { LoadFailed, Title } from './Gastos'

function kindLabel(kind: string): string {
  return (
    PAYMENT_METHOD_KINDS.find((entry) => entry.value === kind)?.label ?? kind
  )
}

export function Perfil({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  const firebase = useFirebase()
  const [sheet, setSheet] = useState<
    'hogar' | 'invitar' | 'exportar' | 'cuenta' | null
  >(null)
  const [method, setMethod] = useState<PaymentMethod | 'nueva' | null>(null)
  const householdId = session.householdId ?? null

  const data = useQuery({
    queryKey: ['beta', 'perfil', householdId],
    enabled: householdId !== null,
    queryFn: async () => {
      const id = householdId as string
      const [household, members, cards, categories] = await Promise.all([
        session.db.getHousehold(id),
        session.db.listMembers(id),
        session.db.listCards({ householdId: id }),
        session.db.listCategories(id),
      ])
      return { household, members, cards, categories }
    },
  })

  if (data.isPending) {
    return <ProfileSkeleton />
  }
  if (data.isError || data.data === undefined) {
    return <LoadFailed />
  }

  const { household, members, cards } = data.data
  // By id, never by name: two people called Flor are two people, and
  // somebody who has just renamed themselves is still the same person.
  const others = members.filter((member) => member.userId !== session.userId)
  const me = members.find((member) => member.userId === session.userId)

  return (
    <>
      <Title
        text="Mi perfil"
        sub={`Tu cuenta, quiénes están en ${household.name} y cómo pagan.`}
      />
      <div className="card">
        <div className="plist">
          <Item
            Icon={UserRound}
            k={me?.displayName ?? session.displayName ?? 'Vos'}
            v={firebase.auth.currentUser?.email ?? 'Sin correo'}
            onOpen={() => setSheet('cuenta')}
          />
          <Item
            Icon={House}
            k={household.name}
            v={
              others.length > 0
                ? [
                    me?.displayName ?? session.displayName ?? 'Vos',
                    ...others.map((m) => m.displayName),
                  ].join(' y ')
                : 'Solo vos. Podés invitar a quien viva con vos.'
            }
            onOpen={() => setSheet('hogar')}
          />
          <Item
            Icon={UserPlus}
            k="Invitar a alguien"
            v="Un link para que entre al hogar y pueda anotar"
            onOpen={() => setSheet('invitar')}
          />
        </div>
      </div>

      {/* The budget is not here: it belongs to a month, and you set it from
          that month's Inicio. */}
      <section className="sec">
        <h2>Cómo pagan</h2>
        {cards.length === 0 ? (
          <div className="card">
            <p className="hint">Todavía no cargaron ningún método de pago.</p>
          </div>
        ) : (
          <div className="methods">
            {cards.map((card) => (
              <MethodRow
                key={card.id}
                card={card}
                onEdit={() => setMethod(card)}
              />
            ))}
          </div>
        )}
        <button
          className="btn btn-secondary btn-wide"
          type="button"
          onClick={() => setMethod('nueva')}
        >
          <Plus />
          Agregar una tarjeta
        </button>
      </section>

      <section className="sec">
        <h2>Tus datos</h2>
        <div className="card">
          <div className="plist">
            <Item
              Icon={Download}
              k="Descargar los datos"
              v="Una planilla con el mes que elijas"
              onOpen={() => setSheet('exportar')}
            />
          </div>
        </div>
      </section>

      <button
        className="btn btn-secondary btn-wide"
        type="button"
        onClick={() => {
          void firebase.auth.signOut()
        }}
      >
        <LogOut />
        Cerrar sesión
      </button>

      <HogarSheet
        open={sheet === 'hogar'}
        onClose={() => setSheet(null)}
        session={session}
        household={household}
        members={members}
      />
      <CuentaSheet
        open={sheet === 'cuenta'}
        onClose={() => setSheet(null)}
        session={session}
        householdName={household.name}
        alone={members.length < 2}
      />
      <ExportarSheet
        open={sheet === 'exportar'}
        onClose={() => setSheet(null)}
        session={session}
        household={household}
      />
      <InvitarSheet
        open={sheet === 'invitar'}
        onClose={() => setSheet(null)}
        session={session}
        householdId={household.id}
      />
      {method === null ? null : (
        <MetodoSheet
          open
          onClose={() => setMethod(null)}
          session={session}
          method={method === 'nueva' ? null : method}
          existing={cards}
        />
      )}
    </>
  )
}

function currencyLabel(currency: PaymentMethod['currency']): string {
  if (currency === 'BOTH') return 'Pesos y dólares'
  return currency === 'USD' ? 'Dólares' : 'Pesos'
}

function MethodRow({
  card,
  onEdit,
}: {
  readonly card: PaymentMethod
  readonly onEdit: () => void
}): ReactElement {
  return (
    <button
      className="card method tap"
      type="button"
      aria-label={`Editar ${card.name}`}
      onClick={onEdit}
    >
      <span className="brand-mark" aria-hidden="true">
        <CardBrandMark brand={card.brand} />
      </span>
      <span className="name">{card.name}</span>
      <span className="sub">
        {kindLabel(card.kind)} · {currencyLabel(card.currency)}
      </span>
    </button>
  )
}

function Item({
  Icon,
  k,
  v,
  onOpen,
}: {
  readonly Icon: typeof UserRound
  readonly k: string
  readonly v: string
  // A row that opens something is a button; one that only says something
  // is not, however alike the two look.
  readonly onOpen?: () => void
}): ReactElement {
  if (onOpen !== undefined) {
    return (
      <button className="pitem" type="button" onClick={onOpen}>
        <span className="tile" aria-hidden="true">
          <Icon />
        </span>
        <span className="k">{k}</span>
        <span className="v">{v}</span>
        <span className="go" aria-hidden="true">
          <ChevronRight />
        </span>
      </button>
    )
  }
  return (
    <div className="pitem">
      <span className="tile" aria-hidden="true">
        <Icon />
      </span>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
      <span className="go" aria-hidden="true">
        <ChevronRight />
      </span>
    </div>
  )
}
