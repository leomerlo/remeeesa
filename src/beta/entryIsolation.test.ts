import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

function sourceFiles(dir: string): readonly string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full))
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full)
    }
  }
  return found
}

const isTestFile = (path: string): boolean => /\.test\.tsx?$/.test(path)
const topFolder = (path: string): string | undefined =>
  relative(SRC, path).split('/')[0]

// The beta is a second entry point on this same branch (see
// docs/adr/0007). Two things keep that honest, and neither survives on good
// intentions alone -- they are the kind of boundary that erodes one
// convenient import at a time.
describe('the beta entry stays its own', () => {
  // Vite builds one HTML file at a time, so src/beta/ cannot reach v1's
  // bundle as long as nothing v1 builds imports from it. This is what says
  // so: the moment a feature or a component reaches for something under
  // beta/, beta code starts shipping inside the app Flor and Leo use daily.
  it('is imported by nothing outside itself', () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => topFolder(path) !== 'beta' && !isTestFile(path))
      .filter((path) =>
        /from\s+'(@\/beta|\.\.\/beta)/.test(readFileSync(path, 'utf8')),
      )
      .map((path) => relative(SRC, path))

    expect(offenders).toEqual([])
  })

  // The other direction, and the one that matters for the product: the
  // beta's interface is designed from zero. Reusing a screen or a control
  // from v1 "just to get going" is exactly how a from-scratch interface
  // quietly becomes the old one with a new colour. The domain is a
  // different matter -- @/lib is the whole point of sharing a repo, and is
  // deliberately allowed.
  it('builds its interface from zero, borrowing none of v1', () => {
    const offenders = sourceFiles(join(SRC, 'beta'))
      .filter((path) => !isTestFile(path))
      .flatMap((path) => {
        const source = readFileSync(path, 'utf8')
        return [
          ...source.matchAll(/from\s+'(@\/(?:features|components|app)[^']*)'/g),
        ].map((match) => `${relative(SRC, path)} -> ${String(match[1])}`)
      })

    expect(offenders).toEqual([])
  })
})
