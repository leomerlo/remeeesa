import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight,
  Download,
  FlaskConical,
  House,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Trash2,
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
import { MetodoSheet } from '../sheets/MetodoSheet'
import { TestTag } from '../rows'
import { cleanSandbox } from '../sandboxCleanup'
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
  const [sheet, setSheet] = useState<'hogar' | 'invitar' | null>(null)
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
  const others = members.filter(
    (member) => member.displayName !== session.displayName,
  )

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
            k={session.displayName ?? 'Vos'}
            v={firebase.auth.currentUser?.email ?? 'Sin correo'}
          />
          <Item
            Icon={House}
            k={household.name}
            v={
              others.length > 0
                ? [
                    session.displayName ?? 'Vos',
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
                mine={session.sandbox.owns('card', card.id)}
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

      <TestData session={session} />

      <section className="sec">
        <h2>Tus datos</h2>
        <div className="card">
          <div className="plist">
            <Item
              Icon={Download}
              k="Descargar los datos"
              v="Una planilla con el mes que elijas"
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
        household={household}
        members={members}
      />
      <InvitarSheet
        open={sheet === 'invitar'}
        onClose={() => setSheet(null)}
        code={null}
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

// Everything this browser's beta has written, and the one press that takes
// it all back out again.
//
// The beta runs on the household's real database. It is allowed to invent
// its own rows so the forms can be tried for real, and that invented data is
// sitting in the same month as everything else -- so it has to be easy to
// see and easy to remove, or the first test gasto quietly becomes part of
// the month's figures.
function TestData({
  session,
}: {
  readonly session: BetaSession
}): ReactElement | null {
  const client = useQueryClient()
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const ledger = session.sandbox.ledger()
  const total = session.sandbox.size()

  if (total === 0 && note === null) return null

  const parts: readonly string[] = [
    plural(ledger.expense.length, 'gasto', 'gastos'),
    plural(
      ledger.pendiente.length,
      'servicio o resumen',
      'servicios y resúmenes',
    ),
    plural(ledger.purchase.length, 'consumo', 'consumos'),
    plural(ledger.card.length, 'tarjeta', 'tarjetas'),
    plural(ledger.category.length, 'categoría', 'categorías'),
  ].filter((part) => part !== '')

  return (
    <section className="sec">
      <h2>Datos de prueba</h2>
      <div className="card alert alert-info">
        <span className="tile" aria-hidden="true">
          <FlaskConical />
        </span>
        <p>
          {total === 0
            ? 'No queda nada de prueba en el hogar.'
            : `La beta escribió ${parts.join(', ')}. Están marcados con «Prueba» en cada pantalla y cuentan en los totales hasta que los borres.`}
        </p>
      </div>
      {note === null ? null : (
        <div className="card alert alert-ok">
          <span className="tile" aria-hidden="true">
            <Trash2 />
          </span>
          <p>{note}</p>
        </div>
      )}
      {total === 0 ? null : (
        <button
          className="btn btn-danger btn-wide"
          type="button"
          disabled={working}
          onClick={() => {
            setWorking(true)
            setNote(null)
            void cleanSandbox({
              db: session.db,
              sandbox: session.sandbox,
              householdId: session.householdId ?? '',
            })
              .then(async (result) => {
                await client.invalidateQueries({ queryKey: ['beta'] })
                setWorking(false)
                setNote(
                  result.left === 0
                    ? `Listo: ${result.removed === 1 ? 'se borró 1 cosa' : `se borraron ${String(result.removed)} cosas`}. El hogar quedó como estaba.`
                    : `${result.removed === 1 ? 'Se borró 1' : `Se borraron ${String(result.removed)}`}, y ${result.left === 1 ? 'queda 1 que no se pudo borrar' : `quedan ${String(result.left)} que no se pudieron borrar`}. Probá de nuevo.`,
                )
              })
              .catch(() => {
                setWorking(false)
                setNote('No se pudo borrar. Probá de nuevo.')
              })
          }}
        >
          {working ? <Loader2 className="spin" /> : <Trash2 />}
          {working ? 'Borrando…' : 'Borrar todo lo que creó la beta'}
        </button>
      )}
    </section>
  )
}

function plural(count: number, one: string, many: string): string {
  if (count === 0) return ''
  return `${String(count)} ${count === 1 ? one : many}`
}

function currencyLabel(currency: PaymentMethod['currency']): string {
  if (currency === 'BOTH') return 'Pesos y dólares'
  return currency === 'USD' ? 'Dólares' : 'Pesos'
}

function MethodRow({
  card,
  mine,
  onEdit,
}: {
  readonly card: PaymentMethod
  readonly mine: boolean
  readonly onEdit: () => void
}): ReactElement {
  return (
    <div className="card method">
      <span className="brand-mark" aria-hidden="true">
        <CardBrandMark brand={card.brand} />
      </span>
      <span className="name">{card.name}</span>
      <span className="sub">
        {kindLabel(card.kind)} · {currencyLabel(card.currency)}
        {mine ? <TestTag /> : null}
      </span>
      <button
        className="rowedit"
        type="button"
        aria-label={`Editar ${card.name}`}
        onClick={onEdit}
      >
        <Pencil />
      </button>
    </div>
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
