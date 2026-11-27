import { AlertTriangle, Check, FileDown, Loader2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { listCards } from '@/lib/cards'
import { listCategories } from '@/lib/expenses'
import type { Household } from '@/lib/households'
import { downloadTextFile } from '@/lib/download'
import { IMPORT_TEMPLATE_HEADER, planImport, runImport } from '@/lib/import'
import type { ImportPlan, PlannedRow } from '@/lib/import'
import { Sheet } from '../Sheet'
import { useSave } from '../useSave'
import { formatAmount } from '../format'
import type { BetaSession } from '../data'

// Loading a month from a spreadsheet instead of one form at a time.
//
// Nothing is written until the household has seen what the file says: the
// file is read, planned and shown, and only then is there a button that
// writes. Per direct feedback -- "solo pantalla de review y aceptar o
// cancelar" -- the review is not editable. A row that is wrong is fixed in
// the file and the file comes back, which keeps one place where a movement
// is typed instead of two.
type Stage =
  | { readonly at: 'pick' }
  | {
      readonly at: 'review'
      readonly plan: ImportPlan
      readonly fileName: string
    }
  | { readonly at: 'done'; readonly written: number; readonly failed: number }

const KIND_SAYS: Record<PlannedRow['kind'], string> = {
  gasto: 'Gasto',
  servicio: 'Servicio',
  consumo: 'Consumo',
}

// What each row will become, in the words the rest of the app uses. The
// consequence, not the record type: this is the line that tells somebody
// their card purchase is not going to move this month's budget.
function consequenceOf(row: PlannedRow): string {
  if (row.kind === 'consumo') {
    return row.cuotas > 1
      ? `Va al resumen de ${row.methodLabel}, en ${String(row.cuotas)} cuotas`
      : `Va al resumen de ${row.methodLabel}`
  }
  if (row.kind === 'servicio') {
    return row.paid
      ? `Queda pagado con ${row.methodLabel}`
      : 'Queda por pagar este mes'
  }
  return `Sale hoy, con ${row.methodLabel}`
}

function dayMonth(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`
}

export function ImportarSheet({
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
  const [stage, setStage] = useState<Stage>({ at: 'pick' })
  const [reading, setReading] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const close = (): void => {
    setStage({ at: 'pick' })
    setNote(null)
    onClose()
  }

  const save = useSave(() => {
    // Deliberately not closing: the household gets told how many movements
    // went in, and closes the sheet itself.
  })

  const read = (file: File): void => {
    setReading(true)
    setNote(null)
    void (async () => {
      try {
        const [text, categories, methods] = await Promise.all([
          file.text(),
          listCategories({ db: session.db, householdId: household.id }),
          listCards({ db: session.db, householdId: household.id }),
        ])
        const plan = planImport({ text, categories, methods })
        if (plan.missingColumns.length > 0) {
          setNote(
            `A ese archivo le faltan columnas: ${plan.missingColumns.join(', ')}. Bajá el archivo de ejemplo y copiá tus datos ahí.`,
          )
        } else if (plan.rows.length === 0 && plan.rejected.length === 0) {
          setNote('El archivo no tiene ninguna fila para cargar.')
        } else {
          setStage({ at: 'review', plan, fileName: file.name })
        }
        setReading(false)
      } catch {
        setReading(false)
        setNote('No se pudo leer el archivo. Tiene que ser un .csv.')
      }
    })()
  }

  const accept = (): void => {
    if (stage.at !== 'review') return
    const rows = stage.plan.rows
    save.run(async () => {
      const result = await runImport({
        db: session.db,
        householdId: household.id,
        memberId: session.userId ?? '',
        authorDisplayName: session.displayName ?? 'Alguien',
        rows,
      })
      setStage({
        at: 'done',
        written: result.written,
        failed: result.failed.length,
      })
    })
  }

  const template = (): void => {
    downloadTextFile({
      fileName: 'remeeesa-ejemplo.csv',
      text:
        `﻿${IMPORT_TEMPLATE_HEADER.join(';')}\r\n` +
        '24/11/2026;Farmacia;Salud;80350,72;ARS;;sí;no;no;1;\r\n' +
        '13/11/2026;Discos;Entretenimiento;104500;ARS;Visa Crédito;sí;no;no;3;\r\n' +
        '14/11/2026;Swiss Medical;Salud;;ARS;;no;sí;no;1;\r\n',
      mimeType: 'text/csv;charset=utf-8',
    })
  }

  const footer =
    stage.at === 'review' ? (
      <div className="sheet-acts">
        <button
          className="btn btn-primary btn-block"
          type="button"
          disabled={save.saving || stage.plan.rows.length === 0}
          onClick={accept}
        >
          {save.saving ? <Loader2 className="spin" /> : <Check />}
          {save.saving
            ? 'Cargando…'
            : `Cargar ${String(stage.plan.rows.length)} ${stage.plan.rows.length === 1 ? 'movimiento' : 'movimientos'}`}
        </button>
        <button
          className="btn btn-secondary btn-block"
          type="button"
          disabled={save.saving}
          onClick={() => {
            setStage({ at: 'pick' })
          }}
        >
          Cancelar
        </button>
        {save.failed === null ? null : (
          <p className="fproblem" role="alert">
            {save.failed}
          </p>
        )}
      </div>
    ) : stage.at === 'done' ? (
      <div className="sheet-acts">
        <button
          className="btn btn-primary btn-block"
          type="button"
          onClick={close}
        >
          Listo
        </button>
      </div>
    ) : (
      <div className="sheet-acts">
        <button
          className="btn btn-primary btn-block"
          type="button"
          disabled={reading}
          onClick={() => fileInput.current?.click()}
        >
          {reading ? <Loader2 className="spin" /> : <Upload />}
          {reading ? 'Leyendo…' : 'Elegir el archivo'}
        </button>
        {note === null ? null : (
          <p className="fproblem" role="alert">
            {note}
          </p>
        )}
      </div>
    )

  return (
    <Sheet
      title="Cargar desde una planilla"
      open={open}
      onClose={close}
      footer={footer}
    >
      {stage.at === 'pick' ? (
        <>
          <p className="fnote">
            Un .csv con una fila por movimiento. Lo vas a ver en pantalla antes
            de que se guarde nada.
          </p>
          <div className="field">
            <span className="flabel">Qué lleva cada fila</span>
            <div className="chips">
              {IMPORT_TEMPLATE_HEADER.map((column) => (
                <span className="chip-pick" key={column}>
                  {column}
                </span>
              ))}
            </div>
          </div>
          <p className="fnote">
            <strong>Todos los meses</strong> en sí lo carga como servicio.{' '}
            <strong>Pagado</strong> en no lo deja como algo que todavía debés.
            Si el método es una tarjeta de crédito, va al resumen de esa tarjeta
            y podés poner las cuotas.
          </p>
          <button
            className="btn btn-secondary btn-wide"
            type="button"
            onClick={template}
          >
            <FileDown />
            Bajar un archivo de ejemplo
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file !== undefined) read(file)
            }}
          />
        </>
      ) : null}

      {stage.at === 'review' ? (
        <>
          <p className="fnote">
            <strong>{stage.fileName}</strong>. Todavía no se guardó nada.
          </p>

          {stage.plan.rejected.length > 0 ? (
            <div className="field">
              <span className="flabel">
                {stage.plan.rejected.length === 1
                  ? '1 fila que no se va a cargar'
                  : `${String(stage.plan.rejected.length)} filas que no se van a cargar`}
              </span>
              <ul className="irows">
                {stage.plan.rejected.map((row) => (
                  <li className="irow irow-bad" key={row.line}>
                    <div className="irow-head">
                      <AlertTriangle aria-hidden />
                      <span className="irow-name">
                        {row.name === ''
                          ? `Fila ${String(row.line)}`
                          : row.name}
                      </span>
                    </div>
                    {row.problems.map((problem) => (
                      <p className="irow-why" key={problem}>
                        {problem}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
              <p className="fnote">
                Arreglalas en la planilla y volvé a elegir el archivo. El resto
                se carga igual.
              </p>
            </div>
          ) : null}

          <div className="field">
            <span className="flabel">
              {stage.plan.rows.length === 1
                ? '1 movimiento para cargar'
                : `${String(stage.plan.rows.length)} movimientos para cargar`}
            </span>
            <ul className="irows">
              {stage.plan.rows.map((row) => (
                <li className="irow" key={row.line}>
                  <div className="irow-head">
                    <span className="irow-name">{row.name}</span>
                    <span className="irow-amt">
                      {row.amount === null
                        ? 'A confirmar'
                        : formatAmount(row.amount, row.currency)}
                    </span>
                  </div>
                  <div className="irow-tags">
                    <span className={`itag itag-${row.kind}`}>
                      {KIND_SAYS[row.kind]}
                    </span>
                    <span className="itag">{dayMonth(row.date)}</span>
                    <span className="itag">
                      {row.categoryLabel}
                      {row.newCategoryName === null ? '' : ' · nueva'}
                    </span>
                  </div>
                  <p className="irow-why">{consequenceOf(row)}</p>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {stage.at === 'done' ? (
        <>
          <p className="fnote">
            Se cargaron <strong>{String(stage.written)}</strong>{' '}
            {stage.written === 1 ? 'movimiento' : 'movimientos'}.
          </p>
          {stage.failed > 0 ? (
            <p className="fproblem" role="alert">
              {stage.failed === 1
                ? 'Una fila no se pudo guardar.'
                : `${String(stage.failed)} filas no se pudieron guardar.`}{' '}
              Revisalas en la planilla y volvé a importarlas.
            </p>
          ) : null}
        </>
      ) : null}
    </Sheet>
  )
}
