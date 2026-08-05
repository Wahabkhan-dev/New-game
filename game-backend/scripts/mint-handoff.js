'use strict';

// CLI: mint a handoff token for local testing.
//   node scripts/mint-handoff.js [wp_user_id] [email]
// Prints just the token so it's easy to capture:  TOKEN=$(npm run -s mint-handoff)

require('dotenv').config();
const jwt = require('jsonwebtoken');
const cfg = require('../config/jwt');

const wpUserId = Number(process.argv[2]) || 101;
const email = process.argv[3] || 'tester@example.com';

const token = jwt.sign(
  { wp_user_id: wpUserId, email },
  cfg.handoff.secret,
  { expiresIn: cfg.handoff.maxAgeSeconds, issuer: cfg.handoff.issuer, algorithm: 'HS256' }
);

process.stdout.write(token + '\n');
