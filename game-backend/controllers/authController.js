'use strict';

const cfg = require('../config/jwt');
const { ApiError } = require('../utils/errors');
const {
  signAccessToken,
  verifyHandoffToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiryDate,
} = require('../utils/tokens');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const SessionLog = require('../models/SessionLog');

// ─── refresh cookie helpers ──────────────────────────────────────────────────
function setRefreshCookie(res, token) {
  res.cookie(cfg.refresh.cookieName, token, {
    httpOnly: true,
    secure: cfg.cookie.secure,
    sameSite: cfg.cookie.sameSite,
    maxAge: cfg.refresh.expiryDays * 24 * 60 * 60 * 1000,
    path: '/api/auth', // cookie is only ever needed by refresh + logout
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(cfg.refresh.cookieName, { path: '/api/auth' });
}

// Issue a fresh access + refresh pair for a user and persist the refresh hash.
async function issueSession(res, user, req) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  await RefreshToken.create({
    userId: user.id,
    tokenHash,
    expiresAt: refreshExpiryDate(),
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  setRefreshCookie(res, refreshToken);
  return { accessToken, tokenHash };
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/auth/exchange  { handoff_token }
// Verify the WordPress handoff token, lazily upsert the user, issue Node tokens.
// ════════════════════════════════════════════════════════════════════════════
async function exchange(req, res) {
  const { handoff_token: handoffToken } = req.body || {};
  if (!handoffToken || typeof handoffToken !== 'string') {
    throw new ApiError(400, 'missing_handoff', 'handoff_token is required');
  }

  let claims;
  try {
    claims = verifyHandoffToken(handoffToken);
  } catch (err) {
    const code =
      err.name === 'TokenExpiredError' ? 'handoff_expired' : 'invalid_handoff';
    throw new ApiError(401, code, 'Handoff token is invalid or expired');
  }

  const wpUserId = claims.wp_user_id;
  const email = claims.email;
  if (!wpUserId || !email) {
    throw new ApiError(401, 'invalid_handoff', 'Handoff token missing wp_user_id/email');
  }

  const user = await User.findOrCreate({ wpUserId, email, username: claims.username });
  if (!user.is_active) {
    throw new ApiError(403, 'account_disabled', 'This account is disabled');
  }

  const { accessToken } = await issueSession(res, user, req);
  // A fresh handoff exchange is a new login boundary (unlike /refresh, which
  // continues an existing session) — record it for analytics.
  await SessionLog.open(user.id, { ip: req.ip, userAgent: req.headers['user-agent'] });

  return res.json({
    accessToken,
    tokenType: 'Bearer',
    expiresIn: cfg.access.expiresIn,
    user: { id: user.id, wp_user_id: user.wp_user_id, email: user.email },
  });
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/auth/refresh   (refresh token in httpOnly cookie)
// Rotate the refresh token, issue a new access token.
// ════════════════════════════════════════════════════════════════════════════
async function refresh(req, res) {
  const presented = req.cookies[cfg.refresh.cookieName];
  if (!presented) {
    throw new ApiError(401, 'missing_refresh', 'No refresh token cookie');
  }

  const presentedHash = hashRefreshToken(presented);
  const record = await RefreshToken.findByHash(presentedHash);

  if (!record) {
    clearRefreshCookie(res);
    throw new ApiError(401, 'invalid_refresh', 'Refresh token not recognized');
  }

  // Expired?
  if (new Date(record.expires_at).getTime() <= Date.now()) {
    clearRefreshCookie(res);
    throw new ApiError(401, 'refresh_expired', 'Refresh token has expired');
  }

  // Revoked already? Distinguish "just-rotated within grace" from real reuse.
  if (record.revoked_at) {
    const revokedAgoMs = Date.now() - new Date(record.revoked_at).getTime();
    const graceMs = cfg.refresh.rotationGraceSeconds * 1000;

    if (revokedAgoMs <= graceMs) {
      // Client likely never received the rotated token (network drop). Tolerate:
      // issue a brand-new session rather than locking the user out.
      const user = await User.findById(record.user_id);
      if (!user) throw new ApiError(401, 'invalid_refresh', 'User not found');
      if (!user.is_active) {
        clearRefreshCookie(res);
        throw new ApiError(403, 'account_disabled', 'This account is disabled');
      }
      const { accessToken } = await issueSession(res, user, req);
      return res.json({ accessToken, tokenType: 'Bearer', expiresIn: cfg.access.expiresIn, rotated: 'grace' });
    }

    // Reuse of an old, long-revoked token → likely theft. Revoke everything.
    await RefreshToken.revokeAllForUser(record.user_id);
    clearRefreshCookie(res);
    throw new ApiError(401, 'refresh_reuse_detected', 'Refresh token reuse detected; all sessions revoked');
  }

  // Normal rotation: mint new pair, then revoke the old one pointing at the new.
  const user = await User.findById(record.user_id);
  if (!user) {
    clearRefreshCookie(res);
    throw new ApiError(401, 'invalid_refresh', 'User not found');
  }
  if (!user.is_active) {
    // Revoke the presented token too — a disabled account shouldn't get to
    // keep rotating a live session indefinitely just because it already had one.
    await RefreshToken.revoke(presentedHash);
    clearRefreshCookie(res);
    throw new ApiError(403, 'account_disabled', 'This account is disabled');
  }

  const { accessToken, tokenHash: newHash } = await issueSession(res, user, req);
  await RefreshToken.revoke(presentedHash, newHash);

  return res.json({ accessToken, tokenType: 'Bearer', expiresIn: cfg.access.expiresIn });
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/auth/logout   (requires access token; revokes refresh cookie)
// ════════════════════════════════════════════════════════════════════════════
async function logout(req, res) {
  const presented = req.cookies[cfg.refresh.cookieName];
  if (presented) {
    await RefreshToken.revoke(hashRefreshToken(presented));
  }
  await SessionLog.closeLatestOpen(req.user.id);
  clearRefreshCookie(res);
  return res.json({ ok: true });
}

module.exports = { exchange, refresh, logout };
