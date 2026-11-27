import type { Card as PaymentMethod } from '@/lib/cards'
import { MAX_CUOTAS } from '@/lib/cards'
import type { Category } from '@/lib/expenses'
import type { Currency } from '@/lib/money'
import { cardAccepts } from '@/lib/money'
import { normalizeHeader, parseCsv } from './parseCsv'
import type { RawRow } from './parseCsv'

// Turning a spreadsheet into the same three answers the gasto form asks.
//
// Nothing here writes: planning and writing are separate on purpose,
// because a file is accepted or rejected as a whole and the household has
// to see what it is accepting first. What comes out of this is exactly
// what the review screen shows and exactly what run.ts then writes.
//
// The three shapes are the form's own -- see GastoSheet's onSave, whose
// branches this mirrors:
//
//   servicio -- viene todos los meses, o todavía no se pagó
//   consumo  -- pagado, una vez, con una tarjeta de crédito
//   gasto    -- pagado, una vez, con cualquier otra cosa
export type PlannedKind = 'gasto' | 'servicio' | 'consumo'

export type PlannedRow = {
  readonly line: number
  readonly kind: PlannedKind
  readonly name: string
  // Null only on a servicio nobody knows the amount of yet, which is what
  // an empty Monto means on a row that is not paid.
  readonly amount: number | null
  readonly currency: Currency
  // One of the two is set and never both: an existing category, or a name
  // that does not exist yet and will be created when the import runs.
  readonly categoryId: string | null
  readonly newCategoryName: string | null
  readonly categoryLabel: string
  readonly date: Date
  // Null is efectivo, the method every household has without creating it.
  readonly methodId: string | null
  readonly methodLabel: string
  // Whether that method is a credit card, which is what decides that a
  // paid servicio settles onto the card instead of leaving the account.
  readonly methodOnCredit: boolean
  readonly cuotas: number
  readonly comments: string
  readonly recurring: boolean
  readonly autoDebit: boolean
  readonly paid: boolean
}

export type RejectedRow = {
  readonly line: number
  // What the row said, so the review screen can show the person which one
  // it means without making them count lines in Excel.
  readonly name: string
  readonly problems: readonly string[]
}

export type ImportPlan = {
  readonly rows: readonly PlannedRow[]
  readonly rejected: readonly RejectedRow[]
  // A file whose header is unusable -- the wrong file entirely, most
  // likely. Non-empty means nothing below it was even read.
  readonly missingColumns: readonly string[]
}

// Every column the file may carry, by the names a person might reasonably
// have typed. The first of each list is what the template writes.
const COLUMNS = {
  date: ['fecha'],
  name: ['movimiento', 'nombre', 'gasto', 'concepto'],
  category: ['categoria', 'rubro'],
  amount: ['monto', 'importe', 'precio'],
  currency: ['moneda'],
  method: [
    'metodo',
    'metodo de pago',
    'con que se pago',
    'pago',
    'forma de pago',
  ],
  paid: ['pagado', 'ya lo pague', 'esta pagado'],
  recurring: ['todos los meses', 'servicio', 'es servicio', 'recurrente'],
  autoDebit: ['debito automatico', 'debito auto'],
  cuotas: ['cuotas', 'en cuantas cuotas'],
  comments: ['comentario', 'comentarios', 'nota', 'notas'],
} as const

const REQUIRED: readonly (keyof typeof COLUMNS)[] = ['date', 'name', 'category']

function cell(row: RawRow, names: readonly string[]): string {
  for (const name of names) {
    const found = row.cells.get(name)
    if (found !== undefined) return found
  }
  return ''
}

function hasColumn(
  columns: readonly string[],
  names: readonly string[],
): boolean {
  return names.some((name) => columns.includes(name))
}

// Accents off and case flattened, the same way headers are matched: a
// category saved as "Café" has to be found by a spreadsheet that wrote
// "cafe".
function key(value: string): string {
  return normalizeHeader(value)
}

// si / sí / x / 1 / true are yes, and anything else is no. An empty cell
// takes the default rather than failing, because most rows are an ordinary
// gasto and would otherwise need three columns filled in by hand.
function readFlag(value: string, fallback: boolean): boolean {
  const text = key(value)
  if (text === '') return fallback
  return ['si', 'sí', 's', 'x', '1', 'true', 'verdadero'].includes(text)
}

// es-AR first, because that is what the exporter writes and what an
// Argentine spreadsheet produces: "80.350,72" is eighty thousand.
//
// With a comma present, the comma is the decimal mark and every dot is a
// thousands separator. With no comma, dots are thousands separators too --
// "104.500" is a hundred and four thousand, not a hundred and a bit --
// unless exactly one or two digits follow the last dot, which no thousands
// group ever has and which is how a file written in English arrives.
export function readAmount(value: string): number | null {
  const text = value.replace(/\s/g, '').replace(/^\$|^u\$s/i, '')
  if (text === '') return null
  const cleaned = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : /\.\d{1,2}$/.test(text)
      ? text
      : text.replace(/\./g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}

// dd/mm/yyyy, which is what the exporter writes and what the app shows.
// An ISO date is accepted as well: it is what a spreadsheet produces when
// somebody retypes a cell and the column is formatted as a date.
//
// Midday, not midnight, for the same reason the form does it: a midnight
// read back as local time can drift an hour and land on the day before.
export function readDate(value: string): Date | null {
  const text = value.trim()
  const slashes = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  const parts = slashes
    ? {
        day: Number(slashes[1]),
        month: Number(slashes[2]),
        year: Number(slashes[3]),
      }
    : iso
      ? {
          day: Number(iso[3]),
          month: Number(iso[2]),
          year: Number(iso[1]),
        }
      : null
  if (parts === null) return null
  const year = parts.year < 100 ? 2000 + parts.year : parts.year
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) {
    return null
  }
  const date = new Date(year, parts.month - 1, parts.day, 12)
  // A 31st of a thirty-day month rolls over into the next one, which is
  // never what the file meant.
  if (date.getMonth() !== parts.month - 1 || date.getDate() !== parts.day) {
    return null
  }
  return date
}

function readCurrency(value: string): Currency | null {
  const text = key(value)
  if (text === '') return 'ARS'
  if (['ars', 'pesos', 'peso', '$'].includes(text)) return 'ARS'
  if (['usd', 'u$s', 'dolares', 'dolar', 'us$'].includes(text)) return 'USD'
  return null
}

export function planImport({
  text,
  categories,
  methods,
}: {
  readonly text: string
  readonly categories: readonly Category[]
  readonly methods: readonly PaymentMethod[]
}): ImportPlan {
  const { columns, rows } = parseCsv(text)
  const missingColumns = REQUIRED.filter(
    (name) => !hasColumn(columns, COLUMNS[name]),
  ).map((name) => COLUMNS[name][0])
  if (missingColumns.length > 0) {
    return { rows: [], rejected: [], missingColumns }
  }

  const categoryByName = new Map(
    categories.map((category) => [key(category.name), category] as const),
  )
  const methodByName = new Map(
    methods.map((method) => [key(method.name), method] as const),
  )

  const planned: PlannedRow[] = []
  const rejected: RejectedRow[] = []

  for (const row of rows) {
    const problems: string[] = []
    const name = cell(row, COLUMNS.name).trim()
    if (name === '') problems.push('Falta el nombre del movimiento')

    const date = readDate(cell(row, COLUMNS.date))
    if (date === null) {
      problems.push('La fecha no se entiende -- se escribe 24/11/2026')
    }

    const categoryText = cell(row, COLUMNS.category).trim()
    const category =
      categoryText === '' ? undefined : categoryByName.get(key(categoryText))
    if (categoryText === '') problems.push('Falta la categoría')

    const methodText = cell(row, COLUMNS.method).trim()
    const isCash = methodText === '' || key(methodText) === 'efectivo'
    const method = isCash ? undefined : methodByName.get(key(methodText))
    if (!isCash && method === undefined) {
      problems.push(`No tenés un método de pago que se llame "${methodText}"`)
    }

    const currency = readCurrency(cell(row, COLUMNS.currency))
    if (currency === null) {
      problems.push('La moneda tiene que decir ARS o USD')
    }

    const paid = readFlag(cell(row, COLUMNS.paid), true)
    const recurring = readFlag(cell(row, COLUMNS.recurring), false)
    const autoDebit = readFlag(cell(row, COLUMNS.autoDebit), false)
    const onCredit = paid && method?.kind === 'credito'

    const amountText = cell(row, COLUMNS.amount)
    const amount = readAmount(amountText)
    if (amountText.trim() !== '' && amount === null) {
      problems.push(`El monto "${amountText}" no es un número`)
    } else if (amount === null && (paid || onCredit)) {
      problems.push(
        'Falta el monto -- solo puede quedar vacío si no está pagado',
      )
    } else if (amount !== null && amount <= 0) {
      problems.push('El monto tiene que ser mayor que cero')
    }

    const cuotasText = cell(row, COLUMNS.cuotas).trim()
    const cuotas = cuotasText === '' ? 1 : Number(cuotasText)
    if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > MAX_CUOTAS) {
      problems.push(`Las cuotas van de 1 a ${String(MAX_CUOTAS)}`)
    } else if (cuotas > 1 && !onCredit) {
      problems.push('Solo se paga en cuotas con una tarjeta de crédito')
    }

    if (
      method !== undefined &&
      currency !== null &&
      !cardAccepts(method.currency, currency)
    ) {
      problems.push(
        `${method.name} no maneja ${currency === 'USD' ? 'dólares' : 'pesos'}`,
      )
    }

    if (problems.length > 0 || date === null || currency === null) {
      rejected.push({ line: row.line, name, problems })
      continue
    }

    // The form's own reading of the answers, kept in the same order so the
    // two cannot drift apart: anything owed or monthly is a servicio,
    // whatever is left on a credit card is a consumo.
    const kind: PlannedKind =
      recurring || !paid
        ? 'servicio'
        : method?.kind === 'credito'
          ? 'consumo'
          : 'gasto'

    planned.push({
      line: row.line,
      kind,
      name,
      amount,
      currency,
      categoryId: category?.id ?? null,
      newCategoryName: category === undefined ? categoryText : null,
      categoryLabel: category?.name ?? categoryText,
      date,
      methodId: method?.id ?? null,
      methodLabel: method?.name ?? 'Efectivo',
      methodOnCredit: method?.kind === 'credito',
      cuotas,
      comments: cell(row, COLUMNS.comments),
      recurring,
      autoDebit,
      paid,
    })
  }

  return { rows: planned, rejected, missingColumns: [] }
}

// The header the template carries, which is also what the person gets when
// they ask for an example file.
export const IMPORT_TEMPLATE_HEADER = [
  'Fecha',
  'Movimiento',
  'Categoría',
  'Monto',
  'Moneda',
  'Método',
  'Pagado',
  'Todos los meses',
  'Débito automático',
  'Cuotas',
  'Comentario',
] as const
