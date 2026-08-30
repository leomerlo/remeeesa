import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('vercel.json', () => {
  it('rewrites unknown paths to index.html so invite links load the app', () => {
    const config: unknown = JSON.parse(
      readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
    )

    expect(config).toEqual({
      rewrites: [{ source: '/(.*)', destination: '/index.html' }],
    })
  })
})
