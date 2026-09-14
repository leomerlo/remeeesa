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

function isTestFile(path: string): boolean {
  return /\.test\.tsx?$/.test(path)
}

function isDemoFile(path: string): boolean {
  return relative(SRC, path).split('/')[0] === 'demo'
}

// The demo page and the in-memory database it runs on must never reach a
// user. They stay out of the production bundle because Vite builds
// index.html alone -- nothing in vite.config.ts adds demo.html as an input,
// so src/demo is simply never traversed. That holds only while no file the
// real app *does* load reaches into src/test or src/demo, which is what
// this guards: one stray import from a component would pull the fake
// database into dist/ with no error anywhere.
describe('production isolation', () => {
  const appFiles = sourceFiles(SRC).filter(
    (path) => !isTestFile(path) && !isDemoFile(path),
  )

  it('finds the app source to check', () => {
    expect(appFiles.length).toBeGreaterThan(50)
  })

  it('never imports the in-memory database or the firebase stub outside tests and the demo', () => {
    const offenders = appFiles.filter((path) => {
      const source = readFileSync(path, 'utf8')
      return (
        source.includes("from '@/test/") || source.includes('from "@/test/')
      )
    })

    expect(offenders.map((path) => relative(SRC, path))).toEqual([])
  })

  it('never imports the demo from the app', () => {
    const offenders = appFiles.filter((path) => {
      const source = readFileSync(path, 'utf8')
      return (
        source.includes("from '@/demo") ||
        source.includes("from './demo/") ||
        source.includes("from '../demo/")
      )
    })

    expect(offenders.map((path) => relative(SRC, path))).toEqual([])
  })

  it('keeps demo.html out of the production build inputs', () => {
    const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8')

    // Adding a rollup/rolldown `input` map is the one change that would
    // start emitting demo.html into dist/.
    expect(config).not.toContain('demo.html')
    expect(config).not.toMatch(/rollupOptions|rolldownOptions/)
  })
})
