import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import { queryKeys } from '../queryKeys'

// Same unwrap behavior as the original: axios responses arrive as
// {data: <backend body>}, and every backend route here responds with
// {message, data: {...}} - unwrap once so callers just read the result
// directly. A rejected promise gets the backend's actual error message
// (not axios's generic "Request failed with status code X"), exactly as
// the original's unwrap() did.
const unwrap = (axiosPromise) =>
  axiosPromise.then(
    (response) => response.data,
    (error) => {
      const backendMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message;
      throw new Error(backendMessage);
    }
  );

export const draftApi = {
  get: (url) => unwrap(api.get(url)),
  patch: (url, body) => unwrap(api.patch(url, body)),
  post: (url, body) => unwrap(api.post(url, body)),
};

const POLL_INTERVAL_MS = 2000;

// Replaces the original's hand-rolled recursive setTimeout poll loop with
// React Query's native refetchInterval - polls every POLL_INTERVAL_MS
// while the draft is still 'extracting' or 'approving', stops
// automatically once it resolves to any other status. React Query owns
// the timer/cleanup instead of the original's manual cancelled-flag +
// clearTimeout pattern. 'approving' added when invoice approval became
// asynchronous (BullMQ job, see invoiceDraft.controller.js's
// approveInvoiceDraft) - the draft sits in 'approving' while the worker
// does the actual AI-recompute/PDF-render/save work, same polling need as
// the pre-existing 'extracting' state.
export const useInvoiceDraftPoll = (draftId) =>
  useQuery({
    queryKey: queryKeys.invoices.drafts.detail(draftId),
    queryFn: () => draftApi.get(`/api/invoices/drafts/${draftId}`),
    enabled: Boolean(draftId),
    refetchInterval: (query) =>
      ['extracting', 'approving'].includes(query.state.data?.status) ? POLL_INTERVAL_MS : false,
    // Matches the original's "poll stops entirely once resolved" - no
    // reason to ever background-refetch a draft that's already
    // ready/failed/approved just because the window refocused.
    refetchOnWindowFocus: false,
  });
