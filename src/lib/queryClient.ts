import { QueryClient } from '@tanstack/react-query'

// A factory rather than a shared instance: every caller gets a clean cache, so
// a stale entry from one test cannot satisfy the next. React Query's defaults
// are shipped untouched until an observation justifies changing one.
export function createQueryClient(): QueryClient {
  return new QueryClient()
}
