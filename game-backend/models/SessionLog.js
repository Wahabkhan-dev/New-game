'use strict';

const { pool } = require('../config/database');

// Session boundaries: one row per login (exchange), closed on logout. A
// refresh does NOT open a new row — it's the same continuous session.
const SessionLog = {
  async open(userId, { ip, userAgent } = {}) {
    const [res] = await pool.query(
      `INSERT INTO session_log (user_id, ip_address, user_agent) VALUES (?, ?, ?)`,
      [userId, ip || null, (userAgent || '').slice(0, 500)]
    );
    return res.insertId;
  },

  // Closes the user's most recent still-open session, if any. Safe to call
  // even if no open session exists (e.g. logout called twice).
  async closeLatestOpen(userId) {
    await pool.query(
      `UPDATE session_log
       SET logout_at = NOW()
       WHERE user_id = ? AND logout_at IS NULL
       ORDER BY login_at DESC
       LIMIT 1`,
      [userId]
    );
  },
};

module.exports = SessionLog;
