import type { AppSupabaseClient } from '@/lib/supabase'

// The only place a test double is cast to AppSupabaseClient. No test implements
// the full SupabaseClient surface, so the cast is kept here where it is named
// and greppable rather than repeated in every test file.
export function createSupabaseStub(
  overrides: Partial<AppSupabaseClient> = {},
): AppSupabaseClient {
  return { ...overrides } as unknown as AppSupabaseClient
}
