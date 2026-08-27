import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type AppSupabaseClient = SupabaseClient<Database>

export type SupabaseEnv = {
  readonly url: string
  readonly anonKey: string
}

const URL_KEY = 'VITE_SUPABASE_URL'
const ANON_KEY = 'VITE_SUPABASE_ANON_KEY'

function readRequiredString(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key]
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function readSupabaseEnv(source: Record<string, unknown>): SupabaseEnv {
  const url = readRequiredString(source, URL_KEY)
  const anonKey = readRequiredString(source, ANON_KEY)

  if (url === null || anonKey === null) {
    const invalid = [
      url === null ? URL_KEY : null,
      anonKey === null ? ANON_KEY : null,
    ].filter((key) => key !== null)

    throw new Error(
      `Missing or empty Supabase environment variables: ${invalid.join(', ')}`,
    )
  }

  return { url, anonKey }
}

export function createSupabaseClient(env: SupabaseEnv): AppSupabaseClient {
  return createClient<Database>(env.url, env.anonKey)
}
