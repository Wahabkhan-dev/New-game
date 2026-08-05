'use strict';

const { pool } = require('../config/database');

// Only the SHA-256 hash of a refresh token is ever stored. `replaced_by_hash`
// records the token that rotated this one, powering the rotation grace window
// and reuse detection.
const RefreshToken = {
  async create({ userId, tokenHash, expiresAt, ip, userAgent }) {
    const [res] = await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, tokenHash, expiresAt, ip || null, (userAgent || '').slice(0, 500)]
    );
    return res.insertId;
  },

  async findByHash(tokenHash) {
    const [rows] = await pool.query(
      `SELECT id, user_id, token_hash, expires_at, revoked_at, replaced_by_hash
       FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
      [tokenHash]
    );
    return rows[0] || null;
  },

  // Revoke one token and record what replaced it (for grace + reuse detection).
  async revoke(tokenHash, replacedByHash = null) {
    await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW(), replaced_by_hash = ?
       WHERE token_hash = ? AND revoked_at IS NULL`,
      [replacedByHash, tokenHash]
    );
  },

  // Nuke every live token for a user — used when token reuse is detected.
  async revokeAllForUser(userId) {
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = ? AND revoked_at IS NULL`,
      [userId]
    );
  },
};

module.exports = RefreshToken;
