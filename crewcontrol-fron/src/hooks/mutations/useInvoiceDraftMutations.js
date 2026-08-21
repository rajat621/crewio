import { useApiMutation } from './useApiMutation'
import { draftApi } from '../useInvoiceDraftPoll'
import { queryKeys } from '../../queryKeys'

// Not optimistic - both are financial/document-generation mutations,
// explicitly on OPTIMISTIC_UPDATES.md's unsafe list ("Invoice generation
// - Never" / "AI extraction... no meaningful optimistic version"). The
// page's own autosave debounce timer (kept in InvoicePreviewWindow.jsx,
// not moved here - it's UI timing, not a query concern) decides when to
// call mutate(), not this hook.
//
// Neither invalidates the draft-detail poll query
// (queryKeys.invoices.drafts.detail) deliberately: the save mutation
// already reconciles the page's local `draft` state from its own
// response (matching the original exactly), so re-invalidating the poll
// query would trigger a redundant refetch that serves no purpose while
// adding a real risk - a refetch landing in the brief window between a
// save completing and the user's next keystroke could clobber a fresh,
// unsaved edit. The approve mutation does invalidate the finalized
// invoices list, which is genuinely useful (a newly-approved invoice
// should appear if the user navigates back to that list).
export const useSaveInvoiceDraftMutation = (draftId) =>
  useApiMutation({
    mutationFn: ({ payload, expectedVersion }) =>
      draftApi.patch(`/api/invoices/drafts/${draftId}`, { payload, expectedVersion }),
  })

export const useApproveInvoiceDraftMutation = (draftId) =>
  useApiMutation({
    mutationFn: ({ payload, expectedVersion }) =>
      draftApi.post(`/api/invoices/drafts/${draftId}/approve`, { payload, expectedVersion }),
    invalidateKeys: [queryKeys.invoices.all],
    invalidateTiming: 'settled',
  })
