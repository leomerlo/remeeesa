import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  csvFileNameForMonth,
  expensesToCsv,
  currentMonthRange,
  isServicio,
} from '@/lib/expenses'
import { downloadTextFile } from '@/lib/download'
import { budgetableMonths } from '@/lib/households'
import type { Household } from '@/lib/households'
import { Sheet } from '../Sheet'
import { SelectField } from '../fields'
import { monthName } from '../format'
import type { BetaSession } from '../data'

// The month as a spreadsheet.
//
// The only thing in the app that reads and writes nothing: it asks the
// database for a month it can already show on a screen and hands the
// browser a file. The CSV itself is the v1's -- semicolons, a comma for the
// decimals and a BOM in front, which is what an Argentine Excel opens
// without mangling -- because a second way of writing the same file is a
// second way of getting it wrong.
const COLUMNS = [
  'Fecha',
  'Movimiento',
  'Categoría',
  'Tipo',
  'Monto',
  'Cargado por',
  'Comentario',
] as const

export function ExportarSheet({
  open,
  onClose,
  session,
  household,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly session: BetaSession
  readonly household: Household
}): ReactElement | null {
  // Newest first -- the month somebody wants is almost always the last one
  // -- and never a month that has not happened. budgetableMonths runs one
  // month into the future, which is right for setting a budget in advance
  // and wrong for a spreadsheet of what was spent.
  const thisMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).getTime()
  const months = [...budgetableMonths({ household })]
    .filter((month) => month.getTime() <= thisMonth)
    .sort((a, b) => b.getTime() - a.getTime())
  const [chosen, setChosen] = useState(() =>
    String(months[0]?.getTime() ?? new Date().getTime()),
  )
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const monthStart = new Date(Number(chosen))

  const download = (): void => {
    setWorking(true)
    setNote(null)
    void (async () => {
      try {
        const householdId = household.id
        const { monthStart: from, monthEnd: to } = currentMonthRange(monthStart)
        const [expenses, categories, members] = await Promise.all([
          session.db.listExpensesInMonth({
            householdId,
            monthStart: from,
            monthEnd: to,
          }),
          session.db.listCategories(householdId),
          session.db.listMembers(householdId),
        ])
        if (expenses.length === 0) {
          setWorking(false)
          setNote(`En ${monthName(monthStart)} no hay nada anotado.`)
          return
        }
        const categoryById = new Map(
          categories.map((category) => [category.id, category.name]),
        )
        const memberById = new Map(
          members.map((member) => [member.userId, member.displayName]),
        )
        downloadTextFile({
          fileName: csvFileNameForMonth(from),
          text: expensesToCsv(
            expenses.map((expense) => ({
              expense,
              categoryName:
                categoryById.get(expense.categoryId) ?? 'Sin categoría',
              authorDisplayName:
                memberById.get(expense.memberId) ?? expense.authorDisplayName,
              isServicio: isServicio(expense),
            })),
          ),
          mimeType: 'text/csv;charset=utf-8',
        })
        setWorking(false)
        onClose()
      } catch {
        setWorking(false)
        setNote('No se pudo armar la planilla. Probá de nuevo.')
      }
    })()
  }

  return (
    <Sheet
      title="Descargar los datos"
      open={open}
      onClose={onClose}
      footer={
        <div className="sheet-acts">
          <button
            className="btn btn-primary btn-block"
            type="button"
            disabled={working}
            onClick={download}
          >
            {working ? <Loader2 className="spin" /> : <Download />}
            {working ? 'Armando…' : 'Descargar'}
          </button>
          {note === null ? null : (
            <p className="fproblem" role="alert">
              {note}
            </p>
          )}
        </div>
      }
    >
      <SelectField
        label="¿Qué mes?"
        value={chosen}
        onChange={setChosen}
        options={months.map((month) => ({
          value: String(month.getTime()),
          label: `${monthName(month)} de ${String(month.getFullYear())}`,
        }))}
      />
      <div className="field">
        <span className="flabel">Qué trae la planilla</span>
        <div className="chips">
          {COLUMNS.map((column) => (
            <span className="chip-pick" key={column}>
              {column}
            </span>
          ))}
        </div>
      </div>
      <p className="fnote">
        Un archivo .csv que se abre en Excel o en Google Sheets. Trae los gastos
        y los servicios ya pagados del mes; lo que todavía no pagaron no está,
        porque todavía no salió.
      </p>
    </Sheet>
  )
}
