'use strict';

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Liveness + DB reachability. Hostinger/uptime monitors hit this.
router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'down', error: err.code || 'db_error' });
  }
});

module.exports = router;
