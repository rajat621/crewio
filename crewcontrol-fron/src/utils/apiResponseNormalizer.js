// Response normalization (Step 3). The backend is mid-migration to a
// standardized envelope (see backend/src/utils/apiResponse.js) - some
// endpoints (e.g. notification.controller.js) already return
// {success, message, data, meta, page, limit, total, hasMore}; most still
// return the legacy {message, data, ...top-level fields} shape, or in
// Employees' case {data: {employees: [...], meta: {...}}}. This is the one
// place that understands both, so every hook gets an identical shape back
// regardless of which shape the backend endpoint it calls happens to be in
// today.
//
// Deliberately NOT "fixing" the backend's inconsistency - just absorbing
// it here so the frontend doesn't have to know or care.

// Pulls the actual list out of a response body that might be
// response.data.data, response.data.employees, response.data.companies,
// or (rare) the array directly - every shape actually seen across the
// existing api/*.js callers, verified by grep rather than guessed.
const extractList = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.employees)) return body.employees;
  if (Array.isArray(body?.companies)) return body.companies;
  return [];
};

// Pulls pagination metadata from either the new `meta` object or the
// legacy top-level page/limit/total/hasMore fields - prefers `meta` when
// both are present (new backend responses intentionally send both during
// the transition, per apiResponse.js's compatibility strategy), falls back
// to top-level otherwise.
const extractMeta = (body) => {
  if (body?.meta && typeof body.meta === 'object') return body.meta;
  const { page, limit, total, hasMore } = body || {};
  if (page === undefined && limit === undefined && total === undefined && hasMore === undefined) {
    return undefined;
  }
  return { page, limit, total, hasMore };
};

// For a single-resource response (not a list) - response.data.data is the
// resource itself when present, otherwise response.data is assumed to be
// the resource directly (legacy shape for several existing endpoints).
const extractItem = (body) => {
  if (body && typeof body === 'object' && 'data' in body && !Array.isArray(body.data)) {
    return body.data;
  }
  return body;
};

export const normalizeListResponse = (response) => {
  const body = response?.data || {};
  return {
    items: extractList(body),
    meta: extractMeta(body),
    message: body.message,
    success: body.success !== false, // legacy responses have no `success` field - treat as success unless explicitly false
  };
};

export const normalizeItemResponse = (response) => {
  const body = response?.data || {};
  return {
    item: extractItem(body),
    message: body.message,
    success: body.success !== false,
  };
};

// Error normalization - axios error -> a consistent shape regardless of
// which backend error format produced it (apiResponse.js's
// {success:false,message,error:{code}}, error.middleware.js's
// {success:false,message,error:{status,message,requestId}}, or a legacy
// unconverted {message} response).
export const normalizeError = (error) => {
  const body = error?.response?.data;
  return {
    status: error?.response?.status ?? null,
    message: body?.message || error?.message || 'Something went wrong',
    code: body?.error?.code ?? null,
    requestId: body?.error?.requestId ?? null,
    isNetworkError: !error?.response,
    isCancelled: error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError',
  };
};
