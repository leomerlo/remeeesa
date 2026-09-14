// Matching for the in-app search box.
//
// Deliberately not a literal substring test: the household types "farmasia"
// and "sup coto" and expects to find "Farmacia" and "Super Coto". Per direct
// feedback -- the search should be forgiving, without pulling in a search
// service to do it.
//
// Three forgivenesses, in order of how often they matter:
//   - accents and case are ignored, so "farmacia" finds "Farmácia"
//   - the query is split into terms, and each must match *somewhere*, in any
//     order -- "coto super" finds "Super Coto"
//   - a term may be one or two characters wrong, for a typo

// Strips accents by decomposing each letter into its base plus its combining
// mark, then dropping the marks.
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

// How wrong a term is allowed to be. Short terms get no slack at all: at one
// edit, "gas" would match "gis", "mas", "gap" and half the alphabet, which
// makes the search feel broken rather than forgiving.
function allowedEdits(term: string): number {
  if (term.length <= 3) {
    return 0
  }
  return term.length >= 7 ? 2 : 1
}

// Levenshtein, stopped early once the distance can no longer come in under
// the limit -- most comparisons fail on the first row or two, and this runs
// once per word per term per row.
function isWithinEdits(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) {
    return false
  }
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    let rowBest = i
    for (let j = 1; j <= b.length; j += 1) {
      const substitution =
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      const insertion = (current[j - 1] ?? 0) + 1
      const deletion = (previous[j] ?? 0) + 1
      const best = Math.min(substitution, insertion, deletion)
      current.push(best)
      rowBest = Math.min(rowBest, best)
    }
    if (rowBest > limit) {
      return false
    }
    previous = current
  }
  return (previous[b.length] ?? Infinity) <= limit
}

function termMatches(term: string, words: readonly string[]): boolean {
  const limit = allowedEdits(term)
  for (const word of words) {
    // Substring first: it is both the common case and the cheap one, and it
    // is what makes a half-typed word match the whole one.
    if (word.includes(term)) {
      return true
    }
    if (limit > 0 && isWithinEdits(term, word, limit)) {
      return true
    }
  }
  return false
}

// True when every term in the query matches somewhere in the haystack. An
// empty query matches everything, so a blank search box filters nothing.
export function matchesSearch(
  query: string,
  haystack: readonly (string | null | undefined)[],
): boolean {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) {
    return true
  }
  const words = haystack
    .filter((part): part is string => typeof part === 'string')
    .flatMap((part) => normalizeForSearch(part).split(/\s+/))
    .filter(Boolean)
  return terms.every((term) => termMatches(term, words))
}
