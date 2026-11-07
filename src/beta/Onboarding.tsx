import {
  ArrowRight,
  Check,
  CreditCard,
  House,
  PartyPopper,
  Plus,
  Target,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { CARD_BRANDS, PAYMENT_METHOD_KINDS } from '@/lib/cards'
import type { CardBrand, PaymentMethodKind } from '@/lib/cards'
import { authorDisplayNameFromAuth } from '@/lib/displayName'
import { useFirebase } from '@/lib/firebaseContext'
import { CardBrandMark } from './CardBrandMark'
import {
  MoneyField,
  MultiOptionList,
  Problem,
  TextField,
  moneyIsValid,
  moneyValue,
} from './fields'
import type { BetaSession } from './data'

// The first two minutes, which are the only two minutes a person gives a new
// app. Four steps, one question each, in the order Flor settled on: the
// house, how they pay, and then -- offered, never required -- a budget.
//
// The payment methods are at the start for a reason: without them the gasto
// form offers "Efectivo" and nothing else, and that selector is the middle
// of this whole app. The budget is last and skippable for the opposite
// reason: asking for it on the way in makes it compulsory in practice, and
// it is not.

type Draft = {
  readonly kind: PaymentMethodKind
  readonly name: string
  readonly brand: CardBrand
}

// Cash is not one of these: it is in the gasto form already, for everybody,
// and a household does not have to declare it.
const NEEDS_A_NAME: readonly PaymentMethodKind[] = [
  'cuenta',
  'debito',
  'credito',
]

const PLACEHOLDER: Readonly<Record<string, string>> = {
  cuenta: 'Mercado Pago',
  debito: 'Galicia, Santander…',
  credito: 'Visa Galicia, Naranja…',
}

const ASKING: Readonly<Record<string, string>> = {
  cuenta: '¿De qué cuenta gastan?',
  debito: '¿Qué tarjeta de débito tenés?',
  credito: '¿Qué tarjeta de crédito tenés?',
}

const STEPS = 4

export function Onboarding({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  const firebase = useFirebase()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('Nuestra casa')
  const [kinds, setKinds] = useState<readonly PaymentMethodKind[]>(['efectivo'])
  const [drafts, setDrafts] = useState<readonly Draft[]>([])
  const [budget, setBudget] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  // The house, once it exists. Kept so that a second press after a failure
  // halfway through does not set up a second house.
  const [made, setMade] = useState<string | null>(null)
  const [written, setWritten] = useState(0)

  const toggle = (kind: PaymentMethodKind): void => {
    setKinds((current) =>
      current.includes(kind)
        ? current.filter((one) => one !== kind)
        : [...current, kind],
    )
  }

  const save = (amount: number): void => {
    setSaving(true)
    setFailed(null)
    void (async () => {
      try {
        const userId = session.userId
        if (typeof userId !== 'string') throw new Error('sin sesión')
        const displayName = authorDisplayNameFromAuth(firebase.auth.currentUser)
        let householdId = made
        if (householdId === null) {
          const created = await session.db.createHouseholdAndMembership({
            userId,
            name: name.trim() === '' ? 'Nuestra casa' : name.trim(),
            monthlyBudget: amount,
            displayName,
          })
          householdId = created.household.id
          setMade(householdId)
        }
        // Resumes where it stopped: whatever was already written stays
        // written, so a retry adds the rest and not a second copy.
        for (let index = written; index < drafts.length; index += 1) {
          const draft = drafts[index]
          if (draft === undefined) continue
          await session.db.createCard({
            householdId,
            name: draft.name,
            kind: draft.kind,
            currency: 'ARS',
            brand: draft.brand,
          })
          setWritten(index + 1)
        }
        setSaving(false)
        setStep(3)
      } catch {
        setSaving(false)
        setFailed('No se pudo guardar. Probá de nuevo.')
      }
    })()
  }

  const percent = Math.round(((step + 1) / STEPS) * 100)

  return (
    <>
      <header className="head">
        <div className="hello">
          Hola{session.displayName === null ? '' : `, ${session.displayName}`}{' '}
          👋
          <span>Dos minutos y arrancamos.</span>
        </div>
      </header>
      <div className="card step-card">
        <div className="step-top">
          <span className="step-of">
            PASO {step + 1} DE {STEPS}
          </span>
          <div className="step-bar">
            <i style={{ width: `${String(percent)}%` }} />
          </div>
        </div>

        {step === 0 ? (
          <Step
            Icon={House}
            head="¿Cómo se llama tu hogar?"
            say="Un nombre corto alcanza. Es lo que van a ver vos y quien viva con vos."
          >
            <TextField
              label="Nombre del hogar"
              value={name}
              onChange={setName}
              placeholder="Nuestra casa"
            />
          </Step>
        ) : null}

        {step === 1 ? (
          <Step
            Icon={CreditCard}
            head="¿Cómo pagan las cosas?"
            say="Elegí las formas que usan. Lo único que cambia para la app es si la plata sale hoy o el mes que viene."
          >
            <MultiOptionList
              label="Formas de pago"
              chosen={kinds}
              onToggle={toggle}
              options={PAYMENT_METHOD_KINDS.map((kind) => ({
                value: kind.value,
                k: kind.label,
                v: kind.detail,
              }))}
            />
            {NEEDS_A_NAME.filter((kind) => kinds.includes(kind)).map((kind) => (
              <CardsFor
                key={kind}
                kind={kind}
                drafts={drafts}
                onAdd={(draft) => setDrafts((all) => [...all, draft])}
                onDrop={(at) =>
                  setDrafts((all) => all.filter((_, index) => index !== at))
                }
              />
            ))}
          </Step>
        ) : null}

        {step === 2 ? (
          <Step
            Icon={Target}
            head="¿Le ponen un tope al mes?"
            say="Es opcional y lo cambian cuando quieran. Sin tope igual ven todo lo que gastaron."
          >
            <MoneyField
              label="Presupuesto mensual"
              value={budget}
              onChange={setBudget}
            />
          </Step>
        ) : null}

        {step === 3 ? (
          <Step
            Icon={PartyPopper}
            head="Listo, ya pueden empezar"
            say="Anotá lo que vayan gastando. Cuando termine el mes vas a ver en qué se fue."
          />
        ) : null}

        {failed === null ? null : <Problem>{failed}</Problem>}

        <button
          className="btn btn-primary"
          type="button"
          disabled={
            saving || (step === 2 && !moneyIsValid(budget, { required: false }))
          }
          onClick={() => {
            if (step === 2) {
              save(moneyValue(budget))
              return
            }
            if (step === 3) {
              if (made !== null) session.adopt(made)
              return
            }
            setStep(step + 1)
          }}
        >
          {step === 3 ? <ArrowRight /> : <Check />}
          {label(step, saving)}
        </button>

        {step === 2 ? (
          <button
            className="skip"
            type="button"
            disabled={saving}
            onClick={() => save(0)}
          >
            Ahora no
          </button>
        ) : null}

        {step > 0 && step < 3 ? (
          <button
            className="skip"
            type="button"
            disabled={saving}
            onClick={() => setStep(step - 1)}
          >
            Volver
          </button>
        ) : null}
      </div>
    </>
  )
}

function label(step: number, saving: boolean): string {
  if (saving) return 'Guardando…'
  if (step === 2) return 'Guardar el presupuesto'
  if (step === 3) return 'Ir a mi hogar'
  return 'Continuar'
}

function Step({
  Icon,
  head,
  say,
  children,
}: {
  readonly Icon: typeof House
  readonly head: string
  readonly say: string
  readonly children?: ReactNode
}): ReactElement {
  return (
    <>
      <span className="tile" aria-hidden="true">
        <Icon />
      </span>
      <h3>{head}</h3>
      <p>{say}</p>
      {children}
    </>
  )
}

// One kind of card, the ones already named for it, and the row that adds
// another. A household with two credit cards says so here rather than
// discovering later that it can only have one.
function CardsFor({
  kind,
  drafts,
  onAdd,
  onDrop,
}: {
  readonly kind: PaymentMethodKind
  readonly drafts: readonly Draft[]
  readonly onAdd: (draft: Draft) => void
  readonly onDrop: (at: number) => void
}): ReactElement {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState<CardBrand>(
    kind === 'cuenta' ? 'mercadopago' : 'visa',
  )
  const mine = drafts
    .map((draft, index) => ({ draft, index }))
    .filter((one) => one.draft.kind === kind)

  const add = (): void => {
    const trimmed = name.trim()
    if (trimmed === '') return
    onAdd({ kind, name: trimmed, brand })
    setName('')
  }

  return (
    <div className="field">
      <span className="flabel">{ASKING[kind] ?? '¿Cómo se llama?'}</span>
      {mine.length === 0 ? null : (
        <div className="chips">
          {mine.map((one) => (
            <span className="chip-pick" key={one.index} aria-pressed="true">
              <CardBrandMark brand={one.draft.brand} />
              {one.draft.name}
              <button
                type="button"
                className="chip-x"
                aria-label={`Sacar ${one.draft.name}`}
                onClick={() => onDrop(one.index)}
              >
                <X />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="addrow">
        <input
          value={name}
          placeholder={PLACEHOLDER[kind] ?? ''}
          autoComplete="off"
          aria-label={ASKING[kind] ?? 'Nombre'}
          onChange={(event) => setName(event.target.value)}
        />
        {kind === 'cuenta' ? null : (
          <select
            value={brand}
            aria-label="Marca"
            onChange={(event) => setBrand(event.target.value as CardBrand)}
          >
            {CARD_BRANDS.map((one) => (
              <option key={one.value} value={one.value}>
                {one.label}
              </option>
            ))}
          </select>
        )}
        <button
          className="btn btn-secondary"
          type="button"
          disabled={name.trim() === ''}
          onClick={add}
        >
          <Plus />
          Agregar
        </button>
      </div>
    </div>
  )
}
