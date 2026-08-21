import { useQuery } from '@tanstack/react-query'
import { authApi } from '../api/auth'
import { queryKeys } from '../queryKeys'

// Kept as its own explicit fetch rather than reading AuthContext's user
// object (which also gets populated from getMe on app load) - deliberate,
// conservative choice: AuthContext's session-restore effect and this
// hook's mount could both fire around the same time on a direct page
// load/refresh, and relying on AuthContext's implicit timing for a
// security-sensitive field (twoFactorEnabled) adds real risk for
// uncertain benefit versus a page-owned, deterministic fetch.
export const useMe = () =>
  useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: async () => {
      const response = await authApi.getMe();
      return response?.data?.user || null;
    },
  })
