'use strict';

// A small typed error so controllers can `throw new ApiError(403, 'no_purchase')`
// and the central errorHandler renders a consistent JSON shape + status code.
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code; // machine-readable slug, e.g. 'invalid_handoff'
    this.details = details; // optional extra info (validation errors, etc.)
  }
}

// Wraps an async route handler so thrown/rejected errors reach errorHandler
// without a try/catch in every controller.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ApiError, asyncHandler };
