import { QueryClient } from '@tanstack/react-query'

// Centralized defaults (Step 3) - every hook inherits these unless it has
// a specific reason to override, so retry/staleTime/etc. policy lives in
// exactly one place, not copy-pasted per hook.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data doesn't need to be refetched just because a component
      // remounted within this window - avoids the duplicate-fetch pattern
      // Phase 1's audit found across page navigations.
      staleTime: 30_000,
      // How long unused data stays in cache before garbage collection.
      gcTime: 5 * 60_000,
      // Refetch on window refocus (Step 12) - catches data that changed
      // while the tab was in the background, without the user doing
      // anything.
      refetchOnWindowFocus: true,
      // Refetch on reconnect (Step 12) - recovers automatically after a
      // temporary disconnect instead of showing stale data silently.
      refetchOnReconnect: true,
      // Don't hammer a genuinely down backend - 2 retries with backoff,
      // not infinite.
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
    mutations: {
      // Mutations are not safe to retry blindly (a failed "create
      // employee" retried automatically could double-create) - opt-in
      // per-mutation instead of a global default.
      retry: 0,
    },
  },
})
