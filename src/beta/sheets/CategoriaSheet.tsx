import { Check, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Category } from '@/lib/expenses'
import { CATEGORY_COLOR_PALETTE } from '@/lib/expenses/categoryColor'
import { cssVars } from '@/lib/cssVars'
import { CategoryTile } from '../Tile'
import { ReadOnlyFoot, Sheet } from '../Sheet'
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
  category,
  existing,
  spentThisMonth,
  onDelete,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly category: Category | null
  // Every category of the household, to catch a name that is already taken.
  readonly existing: readonly Category[]
  // What this category has taken this month, so a cap can be set against
  // something real rather than guessed at.
  readonly spentThisMonth?: number
  readonly onDelete?: () => void
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
  const canSave = named && !taken && capped

  return (
    <Sheet
      title={category === null ? 'Nueva categoría' : 'Editar la categoría'}
      open={open}
      onClose={onClose}
      footer={
        <div className="sheet-acts">
          <button className="btn btn-primary btn-block" type="button" disabled>
            <Check />
            {category === null ? 'Crear' : 'Guardar'}
          </button>
          <ReadOnlyFoot />
        </div>
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
      {canSave ? null : (
        <p className="fproblem" role="alert">
          {!named
            ? 'Falta el nombre.'
            : taken
              ? 'Ya existe una categoría con ese nombre.'
              : 'El tope tiene que ser un número mayor que cero, o quedar vacío.'}
        </p>
      )}
      {category === null || onDelete === undefined ? null : (
        <button className="btn btn-danger btn-block" type="button" disabled>
          <Trash2 />
          Borrar esta categoría
        </button>
      )}
    </Sheet>
  )
}
