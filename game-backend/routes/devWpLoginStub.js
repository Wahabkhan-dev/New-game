'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const cfg = require('../config/jwt');
const { asyncHandler } = require('../utils/errors');

// ════════════════════════════════════════════════════════════════════════════
// DEV-ONLY stand-in for the WordPress game-handoff plugin's
// /wp-json/game/v1/login + /forgot-password routes, so the real login screen
// (which POSTs to VITE_WP_URL + those paths) can be tested end-to-end
// locally without a live WordPress site.
//
// Hard-disabled in production — not just guarded inside the routes, but
// never mounted at all outside development (see server.js), same safety
// pattern as routes/dev.js's mint-handoff.
//
// Fixed test credential — NOT a real account, just for testing. Point
// ShadowGamma's VITE_WP_URL at this server to use it.
// ════════════════════════════════════════════════════════════════════════════
const DEV_EMAIL = 'admin@example.com';
const DEV_PASSWORD = 'admin!@#';
const DEV_WP_USER_ID = 999888001;

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    if (email !== DEV_EMAIL || password !== DEV_PASSWORD) {
      return res.status(401).json({ error: 'invalid_credentials', reason: 'Incorrect email or password.' });
    }

    const token = jwt.sign(
      { wp_user_id: DEV_WP_USER_ID, email: DEV_EMAIL, username: 'dev_tester' },
      cfg.handoff.secret,
      { expiresIn: cfg.handoff.maxAgeSeconds, issuer: cfg.handoff.issuer, algorithm: 'HS256' }
    );

    res.json({ handoff_token: token });
  })
);

router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    // Mirrors the real plugin route's always-generic response shape.
    res.json({ message: 'If an account with a game purchase exists for that email, a new password has been sent. (dev stub — check the server log)' });
    console.log(`[dev-wp-stub] forgot-password requested for: ${req.body && req.body.email}`);
  })
);

module.exports = router;
