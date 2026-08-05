'use strict';

// Centralized token configuration so expiries/secrets live in exactly one place.
module.exports = {
  access: {
    secret: process.env.JWT_ACCESS_SECRET,
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
    // Node-issued tokens are self-identified so a leaked handoff token can never
    // be replayed as an access token (different iss + different secret).
    issuer: 'game-backend',
    audience: 'game-client',
  },
  refresh: {
    expiryDays: Number(process.env.JWT_REFRESH_EXPIRY_DAYS) || 7,
    cookieName: process.env.REFRESH_COOKIE_NAME || 'game_rt',
    rotationGraceSeconds: Number(process.env.REFRESH_ROTATION_GRACE_SECONDS) || 60,
  },
  handoff: {
    secret: process.env.HANDOFF_SECRET,
    maxAgeSeconds: Number(process.env.HANDOFF_MAX_AGE_SECONDS) || 60,
    issuer: process.env.HANDOFF_ISSUER || 'wordpress',
  },
  cookie: {
    secure: String(process.env.COOKIE_SECURE).toLowerCase() === 'true',
    sameSite: process.env.COOKIE_SAMESITE || 'Strict',
  },
};
