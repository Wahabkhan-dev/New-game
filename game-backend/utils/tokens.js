'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cfg = require('../config/jwt');

// ─── Node access token (JWT, HS256) ─────────────────────────────────────────
function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), wp_user_id: user.wp_user_id, email: user.email },
    cfg.access.secret,
    {
      expiresIn: cfg.access.expiresIn,
      issuer: cfg.access.issuer,
      audience: cfg.access.audience,
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, cfg.access.secret, {
    issuer: cfg.access.issuer,
    audience: cfg.access.audience,
  });
}

// ─── WordPress handoff token (JWT, HS256, signed by Plugin 2) ────────────────
// Verified with the shared HANDOFF_SECRET. We enforce both the token's own exp
// AND an independent maxAge ceiling, and require the expected issuer.
function verifyHandoffToken(token) {
  return jwt.verify(token, cfg.handoff.secret, {
    issuer: cfg.handoff.issuer,
    maxAge: cfg.handoff.maxAgeSeconds,
    algorithms: ['HS256'],
  });
}

// ─── Refresh token (opaque random string; only its hash is stored) ───────────
function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

// SHA-256 is fine here: the token is 384 bits of entropy, not a low-entropy
// password, so a fast hash is appropriate and lets us index/lookup by hash.
function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + cfg.refresh.expiryDays);
  return d;
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  verifyHandoffToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiryDate,
};
