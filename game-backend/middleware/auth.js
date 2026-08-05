'use strict';

const { verifyAccessToken } = require('../utils/tokens');
const { ApiError } = require('../utils/errors');

// Verifies the Node-issued access token on protected routes.
// Expects: Authorization: Bearer <accessToken>
module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'missing_token', 'Authorization Bearer token required'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: Number(payload.sub),
      wp_user_id: payload.wp_user_id,
      email: payload.email,
    };
    return next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token';
    return next(new ApiError(401, code, 'Access token is invalid or expired'));
  }
};
