// Reading back the file the Exportar sheet writes.
//
// Same dialect, deliberately: semicolons, a comma for the decimals and a
// BOM in front -- see exportCsv.ts for why. A household exports a month,
// edits it in Excel and hands it back, so anything the exporter can write
// has to survive the trip home, quoted fields and doubled quotes included.

export type RawRow = {
  // The line in the file, 1-based and counting the header, so a problem
  // can be reported as "fila 7" against what the person sees on screen.
  readonly line: number
  readonly cells: ReadonlyMap<string, string>
}

export type ParsedCsv = {
  readonly columns: readonly string[]
  readonly rows: readonly RawRow[]
}

// Headers are matched on their bare letters: 'Categoría', 'categoria' and
// 'CATEGORIA' are the same column. Spreadsheets lose accents and change
// case on the way through often enough that insisting on the exact string
// would reject files that are perfectly readable.
export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

// One pass, character by character, because a quoted field can hold the
// delimiter and the line break themselves. Splitting on ';' and '\n' first
// would tear a comment in half.
function splitRecords(text: string): string[][] {
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let index = 0
  while (index < text.length) {
    const char = text[index] ?? ''
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }
    if (char === '"' && field === '') {
      quoted = true
      index += 1
      continue
    }
    if (char === ';') {
      row.push(field)
      field = ''
      index += 1
      continue
    }
    if (char === '\r' || char === '\n') {
      row.push(field)
      records.push(row)
      row = []
      field = ''
      index += char === '\r' && text[index + 1] === '\n' ? 2 : 1
      continue
    }
    field += char
    index += 1
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    records.push(row)
  }
  return records
}

// A row of nothing but separators is what a spreadsheet leaves behind at
// the end of a file. It is not a movement and it is not an error either.
function isBlank(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === '')
}

export function parseCsv(text: string): ParsedCsv {
  const records = splitRecords(text.replace(/^﻿/, ''))
  const header = records[0]
  if (header === undefined) {
    return { columns: [], rows: [] }
  }
  const columns = header.map(normalizeHeader)
  const rows: RawRow[] = []
  for (let index = 1; index < records.length; index += 1) {
    const cells = records[index] ?? []
    if (isBlank(cells)) continue
    const map = new Map<string, string>()
    columns.forEach((column, position) => {
      if (column === '') return
      map.set(column, (cells[position] ?? '').trim())
    })
    rows.push({ line: index + 1, cells: map })
  }
  return { columns, rows }
}
