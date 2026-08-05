'use strict';

const cors = require('cors');

// Locked to a single origin (the WordPress site that also serves /game).
// credentials:true is required so the browser sends/receives the httpOnly
// refresh cookie on same-site requests.
const origin = process.env.CORS_ORIGIN || 'http://localhost:8080';

module.exports = cors({
  origin,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
});
