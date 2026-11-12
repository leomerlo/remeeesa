import { Merge } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Category } from '@/lib/expenses'
import {
  deleteCategory,
  findOrCreateCategory,
  mergeCategories,
  renameCategory,
  updateCategoryBudget,
  updateCategoryColor,
} from '@/lib/expenses'
import { CATEGORY_COLOR_PALETTE } from '@/lib/expenses/categoryColor'
import { cssVars } from '@/lib/cssVars'
import { CategoryTile } from '../Tile'
import { DangerAction, Sheet, SheetFoot } from '../Sheet'
import { useSave } from '../useSave'
import type { BetaSession } from '../data'
import { formatAmount } from '../format'
import {
  MoneyField,
  SelectField,
  TextField,
  moneyIsValid,
  moneyValue,
  pesos,
} from '../fields'

// Adding and editing a category: its name, its colour and its cap.
//
// There is no icon to pick. The v1 derives it from the name -- "Super"
// gets a trolley, "Nafta" a car -- so renaming is how an icon changes,
// and the sheet shows the one the current name earns rather than offering
// a list that would have nowhere to be stored.
export function CategoriaSheet({
  open,
  onClose,
  session,
  category,
  existing,
  spentThisMonth,
  spentUsdThisMonth,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly session: BetaSession
  readonly category: Category | null
  // Every category of the household, to catch a name that is already taken.
  readonly existing: readonly Category[]
  // What this category has taken this month, so a cap can be set against
  // something real rather than guessed at.
  readonly spentThisMonth?: number
  // The same, in dollars: a category can be spent in both.
  readonly spentUsdThisMonth?: number
}): ReactElement {
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(
    category?.color ?? (CATEGORY_COLOR_PALETTE[0] as string),
  )
  const [cap, setCap] = useState(
    category === null || category.monthlyBudget === 0
      ? ''
      : String(category.monthlyBudget),
  )
  // The same ceiling for the dollars this category takes. Its own figure
  // because nothing in this app adds the two currencies: Meta Ads is
  // spent only in dollars and a peso ceiling never sees it, while a
  // subscriptions category has some of each and needs both.
  const [capUsd, setCapUsd] = useState(
    category?.monthlyBudgetUsd === undefined || category.monthlyBudgetUsd === 0
      ? ''
      : String(category.monthlyBudgetUsd),
  )

  const trimmed = name.trim()
  const named = trimmed !== ''
  const taken = existing.some(
    (other) =>
      other.id !== category?.id &&
      other.name.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  const capped = moneyIsValid(cap, { required: false })
  const blocked = !named || taken || !capped
  const save = useSave(onClose)
  const householdId = session.householdId ?? ''
  // The only reason a form here refuses to save: the household has not
  // finished loading, so there is nowhere to write yet.
  const locked: string | null =
    householdId === ''
      ? 'Todavía estamos leyendo el hogar. Probá de nuevo en un segundo.'
      : null

  // A category is three writes, not one: its name is its own document id,
  // so renaming moves the document, while the colour and the cap are plain
  // fields on it. The form says "Guardar" once and this does whichever of
  // the three actually changed.
  const onSave = (): void => {
    save.run(async () => {
      const wanted = moneyValue(cap)
      const budget = cap.trim() === '' ? 0 : wanted
      let target =
        category ??
        (await findOrCreateCategory({
          db: session.db,
          householdId,
          name: trimmed,
        }))
      if (category !== null && category.name.trim() !== trimmed) {
        target = await renameCategory({
          db: session.db,
          householdId,
          categoryId: category.id,
          name: trimmed,
        })
      }
      if (target.color !== color) {
        target = await updateCategoryColor({
          db: session.db,
          householdId,
          categoryId: target.id,
          color,
        })
      }
      const budgetUsd = capUsd.trim() === '' ? 0 : moneyValue(capUsd)
      if (
        target.monthlyBudget !== budget ||
        (target.monthlyBudgetUsd ?? 0) !== budgetUsd
      ) {
        target = await updateCategoryBudget({
          db: session.db,
          householdId,
          categoryId: target.id,
          monthlyBudget: budget,
          monthlyBudgetUsd: budgetUsd,
        })
      }
      return target
    })
  }

  return (
    <Sheet
      title={category === null ? 'Nueva categoría' : 'Editar la categoría'}
      open={open}
      onClose={onClose}
      footer={
        <SheetFoot
          label={category === null ? 'Crear' : 'Guardar'}
          saving={save.saving}
          blocked={blocked}
          locked={locked}
          failed={save.failed}
          onSave={onSave}
        />
      }
    >
      <div className="catpreview">
        {/* The preview is the real tile: same disc, same icon rule, so
            what the sheet shows is what the list will show. */}
        <CategoryTile name={trimmed === '' ? 'Otros' : trimmed} color={color} />
        <span className="k">{trimmed === '' ? 'Sin nombre' : trimmed}</span>
        <span className="v">
          El ícono sale del nombre: cambialo y cambia solo.
        </span>
      </div>
      <TextField
        label="Nombre"
        value={name}
        onChange={setName}
        placeholder="Super, nafta, mascotas…"
      />
      <div className="field">
        <span className="flabel">Color</span>
        <div className="swatches" role="radiogroup" aria-label="Color">
          {CATEGORY_COLOR_PALETTE.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === color}
              aria-label={`Color ${option}`}
              className={option === color ? 'swatch on' : 'swatch'}
              style={cssVars({ '--cat': option })}
              onClick={() => setColor(option)}
            />
          ))}
        </div>
      </div>
      <MoneyField
        label="Tope del mes en pesos"
        value={cap}
        onChange={setCap}
        hint={
          spentThisMonth === undefined || spentThisMonth === 0
            ? 'Opcional. Los topes no tienen que sumar el presupuesto del hogar: se le pone tope a las pocas que importan.'
            : `Opcional. Este mes llevan ${pesos(spentThisMonth)} acá.`
        }
      />
      {/* Its own ceiling, counted aparte. Una categoría puede tener uno,
          el otro, o los dos. */}
      <MoneyField
        label="Tope del mes en dólares"
        prefix="US$"
        value={capUsd}
        onChange={setCapUsd}
        hint={
          spentUsdThisMonth === undefined || spentUsdThisMonth === 0
            ? 'Opcional. Para lo que se paga en dólares: cuenta aparte del tope en pesos y nunca se suman.'
            : `Opcional. Este mes llevan ${formatAmount(spentUsdThisMonth, 'USD')} acá.`
        }
      />
      {cap.trim() !== '' &&
      capped &&
      spentThisMonth !== undefined &&
      spentThisMonth > moneyValue(cap) ? (
        <p className="fnote">
          Ojo: este mes ya llevan {pesos(spentThisMonth)}, más que el tope que
          estás poniendo. No es un error -- pasarse avisa, no bloquea.
        </p>
      ) : null}
      {blocked ? (
        <p className="fproblem" role="alert">
          {!named
            ? 'Falta el nombre.'
            : taken
              ? 'Ya existe una categoría con ese nombre.'
              : 'El tope tiene que ser un número mayor que cero, o quedar vacío.'}
        </p>
      ) : null}
      {category === null ? null : (
        <Juntar
          category={category}
          existing={existing}
          saving={save.saving}
          disabled={locked !== null}
          onMerge={(survivorCategoryId) => {
            save.run(() =>
              mergeCategories({
                db: session.db,
                householdId,
                sourceCategoryId: category.id,
                survivorCategoryId,
              }),
            )
          }}
        />
      )}
      {category === null ? null : (
        <DangerAction
          label="Borrar esta categoría"
          saving={save.saving}
          locked={locked}
          onPress={() => {
            save.run(() =>
              deleteCategory({
                db: session.db,
                householdId,
                categoryId: category.id,
              }),
            )
          }}
        />
      )}
    </Sheet>
  )
}

// Joining this category into another one.
//
// Two shapes that mean the same thing get written down twice -- "Súper" and
// "Supermercado" -- and once there are gastos in both, deleting either one
// is refused and renaming one into the other is refused too. This is the
// only way out, and it is the v1's: every gasto, servicio and consumo moves
// onto the category that stays, and this one disappears.
//
// It asks twice. Not because it is dangerous to the money -- nothing is
// lost, every row survives with a different category -- but because it
// cannot be undone by pressing it again.
function Juntar({
  category,
  existing,
  saving,
  disabled,
  onMerge,
}: {
  readonly category: Category
  readonly existing: readonly Category[]
  readonly saving: boolean
  readonly disabled: boolean
  readonly onMerge: (survivorCategoryId: string) => void
}): ReactElement | null {
  const [open, setOpen] = useState(false)
  const others = existing.filter((other) => other.id !== category.id)
  const [into, setInto] = useState(others[0]?.id ?? '')
  const survivor = others.find((other) => other.id === into)

  if (others.length === 0) return null

  if (!open) {
    return (
      <button
        className="btn btn-secondary btn-block"
        type="button"
        disabled={saving || disabled}
        onClick={() => setOpen(true)}
      >
        <Merge />
        Juntarla con otra
      </button>
    )
  }

  return (
    <>
      <SelectField
        label={`Pasar todo lo de ${category.name} a…`}
        value={into}
        onChange={setInto}
        options={others.map((other) => ({
          value: other.id,
          label: other.name,
        }))}
      />
      <p className="fnote">
        Todos los gastos, servicios y consumos de <b>{category.name}</b> pasan a{' '}
        <b>{survivor?.name ?? 'la otra'}</b>, y {category.name} desaparece. No
        se pierde nada, pero no se puede deshacer.
      </p>
      <button
        className="btn btn-secondary btn-block"
        type="button"
        disabled={saving || disabled || survivor === undefined}
        onClick={() => {
          if (survivor !== undefined) onMerge(survivor.id)
        }}
      >
        <Merge />
        {saving ? 'Juntando…' : `Juntar con ${survivor?.name ?? ''}`}
      </button>
      <button className="skip" type="button" onClick={() => setOpen(false)}>
        Mejor no
      </button>
    </>
  )
}
