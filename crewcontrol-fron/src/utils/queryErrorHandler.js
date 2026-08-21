import { normalizeError } from './apiResponseNormalizer'

// Centralized error handling (Step 9). One place that turns any React
// Query error (query or mutation) into a decision about what the UI
// should do - hooks call this instead of each duplicating status-code
// branching.
//
// Integrates with the backend's response envelope via normalizeError
// (apiResponseNormalizer.js), which already knows both the new
// {success:false,message,error:{code}} shape and the legacy {message}
// shape.
//
// Deliberately returns a description, not a side effect (no toast call,
// no navigation) - this file stays UI-agnostic, same reasoning as the
// mutation infrastructure. A caller (a hook, an ErrorBoundary, a
// query.meta.onError) decides what to actually do with the classification.
export const classifyQueryError = (error) => {
  const normalized = normalizeError(error)

  if (normalized.isCancelled) {
    // A request cancelled by React Query itself (e.g. component unmounted
    // mid-fetch, or a newer query superseded this one) - not a real
    // error, never surface to the user.
    return { ...normalized, kind: 'cancelled', shouldNotify: false }
  }

  if (normalized.isNetworkError) {
    return { ...normalized, kind: 'offline', shouldNotify: true, userMessage: 'Connection lost. Retrying automatically once back online.' }
  }

  switch (normalized.status) {
    case 401:
      // Existing behavior (client.js's axios interceptor) already clears
      // the token and redirects on 401 - this classification exists so a
      // hook CAN react to it too if needed, not to duplicate that
      // redirect logic here.
      return { ...normalized, kind: 'unauthorized', shouldNotify: false }
    case 403:
      return { ...normalized, kind: 'forbidden', shouldNotify: true, userMessage: normalized.message || "You don't have permission to do that." }
    case 404:
      return { ...normalized, kind: 'not_found', shouldNotify: true, userMessage: normalized.message || 'Not found.' }
    case 409:
      return { ...normalized, kind: 'conflict', shouldNotify: true, userMessage: normalized.message || 'This conflicts with existing data.' }
    case 422:
      // Field-level validation errors (apiResponse.js's validationError
      // helper puts them at error.fields) - preserved, not collapsed, so
      // a form can still show per-field messages.
      return { ...normalized, kind: 'validation', shouldNotify: true, userMessage: normalized.message || 'Please check the highlighted fields.', fields: error?.response?.data?.error?.fields }
    case 500:
      return { ...normalized, kind: 'server_error', shouldNotify: true, userMessage: 'Something went wrong on our end. Please try again.' }
    default:
      return { ...normalized, kind: normalized.status ? 'unknown_status' : 'unknown', shouldNotify: true, userMessage: normalized.message }
  }
}
