'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const cfg = require('../config/jwt');
const { asyncHandler, ApiError } = require('../utils/errors');

// ════════════════════════════════════════════════════════════════════════════
// DEV-ONLY: mint a handoff token the way the WordPress plugin would, so the
// whole flow can be tested with curl/Postman WITHOUT WordPress running.
//
// Hard-disabled when NODE_ENV=production — the route returns 404 there, so it
// can never be used to forge identities in prod.
// ════════════════════════════════════════════════════════════════════════════
router.post(
  '/mint-handoff',
  asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      throw new ApiError(404, 'not_found', 'No route');
    }

    const wpUserId = Number(req.body.wp_user_id) || 101;
    const email = req.body.email || 'tester@example.com';

    const token = jwt.sign(
      { wp_user_id: wpUserId, email },
      cfg.handoff.secret,
      { expiresIn: cfg.handoff.maxAgeSeconds, issuer: cfg.handoff.issuer, algorithm: 'HS256' }
    );

    res.json({ handoff_token: token, note: 'DEV ONLY — mirrors WordPress Plugin 2' });
  })
);

module.exports = router;
