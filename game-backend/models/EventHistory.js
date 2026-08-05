'use strict';

const { pool } = require('../config/database');

// Append-only audit log. Never UPDATE or DELETE here in normal operation —
// only INSERT and SELECT.
const EventHistory = {
  // Bulk-insert an array of events in one statement (one row per event).
  // `conn` lets this participate in the save transaction.
  async insertMany(userId, levelId, events, meta, conn = pool) {
    if (!events || events.length === 0) return 0;

    const rows = events.map((e) => [
      userId,
      levelId,
      e.eventType,
      JSON.stringify(e.eventData || {}),
      e.stateSnapshot ? JSON.stringify(e.stateSnapshot) : null,
      e.clientTimestamp || null,
      meta.ip || null,
      (meta.userAgent || '').slice(0, 500),
    ]);

    const [res] = await conn.query(
      `INSERT INTO event_history
         (user_id, level_id, event_type, event_data, state_snapshot,
          client_timestamp, ip_address, user_agent)
       VALUES ?`,
      [rows]
    );
    return res.affectedRows;
  },

  async listForUser(userId, { levelId, limit = 100, offset = 0 } = {}) {
    const params = [userId];
    let where = 'user_id = ?';
    if (levelId != null) {
      where += ' AND level_id = ?';
      params.push(levelId);
    }
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.query(
      `SELECT id, user_id, level_id, event_type, event_data, client_timestamp, created_at
       FROM event_history
       WHERE ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      params
    );
    return rows;
  },
};

module.exports = EventHistory;
