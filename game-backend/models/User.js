'use strict';

const { pool } = require('../config/database');

const User = {
  async findByWpUserId(wpUserId) {
    const [rows] = await pool.query(
      'SELECT id, wp_user_id, email, username, created_at, last_login, is_active FROM users WHERE wp_user_id = ? LIMIT 1',
      [wpUserId]
    );
    return rows[0] || null;
  },

  async findById(id) {
    const [rows] = await pool.query(
      'SELECT id, wp_user_id, email, username, created_at, last_login, is_active FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  },

  // Lazily create a user on first handoff exchange. Uses INSERT ... ON DUPLICATE
  // KEY UPDATE so two concurrent exchanges for the same wp_user_id can't create
  // duplicate rows (wp_user_id has a UNIQUE index).
  async findOrCreate({ wpUserId, email, username }) {
    await pool.query(
      `INSERT INTO users (wp_user_id, email, username, last_login)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         email = VALUES(email),
         last_login = NOW()`,
      [wpUserId, email, username || null]
    );
    return this.findByWpUserId(wpUserId);
  },
};

module.exports = User;
