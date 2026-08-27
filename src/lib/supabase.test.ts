import { describe, expect, it } from 'vitest'
import { createSupabaseClient, readSupabaseEnv } from './supabase'

const complete = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
}

describe('readSupabaseEnv', () => {
  it('returns both values when the source is complete', () => {
    expect(readSupabaseEnv(complete)).toEqual({
      url: 'https://example.supabase.co',
      anonKey: 'anon-key',
    })
  })

  it('trims surrounding whitespace from the values', () => {
    expect(
      readSupabaseEnv({
        VITE_SUPABASE_URL: '  https://example.supabase.co\n',
        VITE_SUPABASE_ANON_KEY: ' anon-key ',
      }),
    ).toEqual({ url: 'https://example.supabase.co', anonKey: 'anon-key' })
  })

  it('throws naming a missing key', () => {
    expect(() =>
      readSupabaseEnv({ VITE_SUPABASE_ANON_KEY: 'anon-key' }),
    ).toThrow('VITE_SUPABASE_URL')
  })

  it('throws naming an empty key', () => {
    expect(() =>
      readSupabaseEnv({ ...complete, VITE_SUPABASE_URL: '' }),
    ).toThrow('VITE_SUPABASE_URL')
  })

  it('throws naming a whitespace-only key', () => {
    expect(() =>
      readSupabaseEnv({ ...complete, VITE_SUPABASE_ANON_KEY: '   ' }),
    ).toThrow('VITE_SUPABASE_ANON_KEY')
  })

  it('names every invalid key at once', () => {
    expect(() => readSupabaseEnv({})).toThrow(
      'VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY',
    )
  })
})

describe('createSupabaseClient', () => {
  it('builds a client from placeholder credentials without any network call', () => {
    const client = createSupabaseClient({
      url: 'https://example.supabase.co',
      anonKey: 'anon-key',
    })

    expect(typeof client.from).toBe('function')
  })
})
