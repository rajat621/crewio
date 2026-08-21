// Centralized response helpers (Step 7). Every status code here matches
// what's already used throughout the codebase today (verified via grep
// across controllers) - these helpers standardize the JSON *shape*, not
// the status codes themselves, per the "preserve every status code"
// requirement.
//
// Envelope is additive over the existing {message, data, meta}/{message,
// error} shape already in use: `success` is a new field, nothing existing
// is renamed or removed. Verified against both real clients (React's
// axios interceptor, Flutter's dio client) - neither depends on the
// absence of a `success` field or any shape beyond the specific field
// names they already read (message, data, accessToken, etc.), so this is
// safe to add without breaking either.

export const success = (res, { data = undefined, message = 'Success', meta = undefined, status = 200 } = {}) => {
  const body = { success: true, message, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
};

export const created = (res, { data = undefined, message = 'Created' } = {}) =>
  success(res, { data, message, status: 201 });

// Error helpers never accept a raw Error/exception object - only a plain
// message string and an optional machine-readable code - so there's no
// path through these helpers that could leak a stack trace, a Mongo
// error's internal shape, a file path, or a secret. Matches Step 5's
// "do not leak" requirement structurally, not just by convention.
const errorResponse = (res, status, message, code) => {
  const body = { success: false, message };
  if (code) body.error = { code };
  return res.status(status).json(body);
};

export const badRequest = (res, message = 'Bad request', code) => errorResponse(res, 400, message, code);
export const unauthorized = (res, message = 'Not authenticated', code) => errorResponse(res, 401, message, code);
export const forbidden = (res, message = 'Forbidden', code) => errorResponse(res, 403, message, code);
export const notFound = (res, message = 'Not found', code) => errorResponse(res, 404, message, code);
export const conflict = (res, message = 'Conflict', code) => errorResponse(res, 409, message, code);

// Preserves detailed field-level validation errors (Step 9) - `errors` is
// passed through as-is (e.g. express-validator's array shape) rather than
// collapsed into a single message, so no validation detail is lost.
export const validationError = (res, errors, message = 'Validation failed') => {
  const body = { success: false, message, error: { code: 'VALIDATION_ERROR', fields: errors } };
  return res.status(422).json(body);
};

export const serverError = (res, message = 'Internal server error', code) => errorResponse(res, 500, message, code);
