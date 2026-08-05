'use strict';

// Purges refresh_tokens that can no longer affect auth decisions:
//   - naturally expired (expires_at in the past), regardless of revoked status
//   - revoked more than 1 day ago (well past the rotation grace window, so no
//     longer needed for reuse-detection forensics)
//
// Run on a schedule (Hostinger cron / hPanel cron job), e.g. daily:
//   node scripts/cleanup-tokens.js
//
// Without this, refresh_tokens grows by ~1 row per login + ~1 row per token
// refresh (every ~15 min of active play) forever, with no automatic pruning.

require('dotenv').config();
const { pool } = require('../config/database');

async function run() {
  const [expired] = await pool.query(
    `DELETE FROM refresh_tokens WHERE expires_at < NOW()`
  );
  const [staleRevoked] = await pool.query(
    `DELETE FROM refresh_tokens
     WHERE revoked_at IS NOT NULL AND revoked_at < (NOW() - INTERVAL 1 DAY)`
  );
  console.log(
    `[cleanup-tokens] removed ${expired.affectedRows} expired + ${staleRevoked.affectedRows} stale-revoked rows`
  );
  await pool.end();
}

run().catch((err) => {
  console.error('[cleanup-tokens] failed:', err.message);
  process.exit(1);
});
