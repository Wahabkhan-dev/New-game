'use strict';

const { ApiError } = require('../utils/errors');

function notFound(req, res, next) {
  next(new ApiError(404, 'not_found', `No route for ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars — Express needs the 4-arg signature.
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Body-parser JSON syntax errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'bad_json', message: 'Request body is not valid JSON' });
  }

  // Anything unexpected: log server-side, return an opaque 500.
  console.error('[error]', err);
  return res.status(500).json({ error: 'internal_error', message: 'Something went wrong' });
}

module.exports = { notFound, errorHandler };
