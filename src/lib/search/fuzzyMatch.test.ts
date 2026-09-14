import { describe, expect, it } from 'vitest'
import { matchesSearch, normalizeForSearch } from './fuzzyMatch'

const superCoto = ['Super Coto', 'Comida', 'con Leo']

describe('matchesSearch', () => {
  it('matches everything while the box is empty', () => {
    expect(matchesSearch('', superCoto)).toBe(true)
    expect(matchesSearch('   ', superCoto)).toBe(true)
  })

  it('ignores case and accents', () => {
    expect(matchesSearch('FARMACIA', ['Farmácia'])).toBe(true)
    expect(matchesSearch('farmácia', ['Farmacia'])).toBe(true)
  })

  it('matches a half-typed word', () => {
    expect(matchesSearch('sup', superCoto)).toBe(true)
  })

  it('matches terms in any order, each against a different word', () => {
    expect(matchesSearch('coto super', superCoto)).toBe(true)
    expect(matchesSearch('sup coto', superCoto)).toBe(true)
  })

  it('needs every term to match, not just one', () => {
    expect(matchesSearch('super plomero', superCoto)).toBe(false)
  })

  it('forgives a typo', () => {
    expect(matchesSearch('farmasia', ['Farmacia'])).toBe(true)
    expect(matchesSearch('mercaod', ['Mercado'])).toBe(true)
  })

  it('forgives two in a long word, but not in a short one', () => {
    expect(matchesSearch('monotribtu', ['Monotributo'])).toBe(true)
    // "gas" one edit away from "gis", "mas", "gap"... short terms match
    // literally or not at all, or the search stops meaning anything.
    expect(matchesSearch('gas', ['Gis'])).toBe(false)
  })

  it('searches the category and the comment, not only the name', () => {
    expect(matchesSearch('comida', superCoto)).toBe(true)
    expect(matchesSearch('leo', superCoto)).toBe(true)
  })

  it('ignores missing fields rather than throwing on them', () => {
    expect(matchesSearch('super', ['Super Coto', null, undefined])).toBe(true)
  })

  it('does not match something unrelated', () => {
    expect(matchesSearch('plomero', superCoto)).toBe(false)
    expect(matchesSearch('netflix', superCoto)).toBe(false)
  })
})

describe('normalizeForSearch', () => {
  it('strips accents, case and surrounding space', () => {
    expect(normalizeForSearch('  Categoría  ')).toBe('categoria')
  })
})
