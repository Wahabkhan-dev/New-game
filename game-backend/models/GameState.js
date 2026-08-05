'use strict';

const { pool } = require('../config/database');

// current_state holds ONE row per (user_id, level_id): the fast-read "resume"
// snapshot. Writes are upserts; the unique key (user_id, level_id) makes this
// last-write-wins with no duplicate rows.
const GameState = {
  async getState(userId, levelId) {
    const [rows] = await pool.query(
      `SELECT user_id, level_id, lives, points, level_data, save_source,
              is_completed, completed_at, timestamp, last_save
       FROM current_state
       WHERE user_id = ? AND level_id = ? LIMIT 1`,
      [userId, levelId]
    );
    return rows[0] || null;
  },

  // Most-recently-saved level for a user — what the client resumes into on load
  // when it doesn't already know which level to ask for.
  async getLatestForUser(userId) {
    const [rows] = await pool.query(
      `SELECT user_id, level_id, lives, points, level_data, save_source,
              is_completed, completed_at, timestamp, last_save
       FROM current_state
       WHERE user_id = ?
       ORDER BY last_save DESC LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  },

  // Upsert the snapshot. `conn` lets callers run this inside a transaction
  // (e.g. batched save) so events + snapshot commit atomically.
  async upsert(userId, levelId, state, saveSource, conn = pool) {
    const { lives, points, levelData } = state;
    // Pass level_data as a JSON string. MariaDB's JSON type is LONGTEXT+json_valid
    // check, which accepts a JSON string directly (and CAST(... AS JSON) is not
    // supported there), so no CAST is used.
    await conn.query(
      `INSERT INTO current_state (user_id, level_id, lives, points, level_data, save_source)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         lives = VALUES(lives),
         points = VALUES(points),
         level_data = VALUES(level_data),
         save_source = VALUES(save_source)`,
      [userId, levelId, lives, points, JSON.stringify(levelData || {}), saveSource]
    );
  },

  async markCompleted(userId, levelId, conn = pool) {
    await conn.query(
      `UPDATE current_state SET is_completed = TRUE, completed_at = NOW()
       WHERE user_id = ? AND level_id = ?`,
      [userId, levelId]
    );
  },
};

module.exports = GameState;
