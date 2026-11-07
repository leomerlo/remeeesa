import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight,
  Download,
  House,
  LogOut,
  Tag,
  UserRound,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { useFirebase } from '@/lib/firebaseContext'
import { PAYMENT_METHOD_KINDS } from '@/lib/cards'
import type { Card as PaymentMethod } from '@/lib/cards'
import { CardBrandMark } from '../CardBrandMark'
import { ProfileSkeleton } from '../Skeleton'
import type { BetaSession } from '../data'
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

  const { household, members, cards, categories } = data.data
  const others = members.filter(
    (member) => member.displayName !== session.displayName,
  )
  const capped = categories.filter((category) => category.monthlyBudget > 0)

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
              <MethodRow key={card.id} card={card} />
            ))}
          </div>
        )}
      </section>

      <section className="sec">
        <h2>La plata del hogar</h2>
        <div className="card">
          <div className="plist">
            <Item
              Icon={Tag}
              k="Categorías y topes"
              v={
                capped.length > 0
                  ? `${String(capped.length)} de ${String(categories.length)} categorías con tope`
                  : `${String(categories.length)} categorías, sin topes puestos`
              }
            />
          </div>
        </div>
      </section>

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
        className="btn btn-secondary btn-block"
        type="button"
        onClick={() => {
          void firebase.auth.signOut()
        }}
      >
        <LogOut />
        Cerrar sesión
      </button>
    </>
  )
}

function currencyLabel(currency: PaymentMethod['currency']): string {
  if (currency === 'BOTH') return 'Pesos y dólares'
  return currency === 'USD' ? 'Dólares' : 'Pesos'
}

function MethodRow({ card }: { readonly card: PaymentMethod }): ReactElement {
  return (
    <div className="card method">
      <span className="brand-mark" aria-hidden="true">
        <CardBrandMark brand={card.brand} />
      </span>
      <span className="name">{card.name}</span>
      <span className="sub">
        {kindLabel(card.kind)} · {currencyLabel(card.currency)}
      </span>
    </div>
  )
}

function Item({
  Icon,
  k,
  v,
}: {
  readonly Icon: typeof UserRound
  readonly k: string
  readonly v: string
}): ReactElement {
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
