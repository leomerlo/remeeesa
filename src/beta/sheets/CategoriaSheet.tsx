import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Category } from '@/lib/expenses'
import {
  deleteCategory,
  findOrCreateCategory,
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
import {
  MoneyField,
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
      if (target.monthlyBudget !== budget) {
        target = await updateCategoryBudget({
          db: session.db,
          householdId,
          categoryId: target.id,
          monthlyBudget: budget,
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
        label="Tope del mes"
        value={cap}
        onChange={setCap}
        hint={
          spentThisMonth === undefined || spentThisMonth === 0
            ? 'Opcional. Los topes no tienen que sumar el presupuesto del hogar: se le pone tope a las pocas que importan.'
            : `Opcional. Este mes llevan ${pesos(spentThisMonth)} acá.`
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
