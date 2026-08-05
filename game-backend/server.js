'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const corsMiddleware = require('./config/cors');
const { pool } = require('./config/database');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const healthRoutes = require('./routes/health');

const app = express();

// Behind Nginx/Hostinger reverse proxy — needed so req.ip + Secure cookies work.
app.set('trust proxy', 1);

// Baseline security headers (HSTS, X-Content-Type-Options, no X-Powered-By, etc).
// CSP is disabled here: this is a pure JSON API with no HTML views to protect.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(corsMiddleware);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

// Routes
app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);

// Dev-only handoff minting (stands in for the WordPress plugin locally).
// Not just guarded inside the route — not mounted at all outside development,
// so it can never appear in a production route table by accident.
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/dev', require('./routes/dev'));
}

// Stand-in for WordPress's own /wp-json/game/v1/login route, mounted at the
// SAME path WordPress would use — point ShadowGamma's VITE_WP_URL at this
// server and the real login screen works unmodified, no WordPress required.
// Opt-in via its own flag (independent of NODE_ENV) so it can be turned on
// for a production test deploy without also enabling /api/dev's other
// dev-only routes. See routes/devWpLoginStub.js.
if (process.env.ENABLE_TEST_LOGIN === 'true') {
  app.use('/wp-json/game/v1', require('./routes/devWpLoginStub'));
}

// 404 + centralized error handling (must be last)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    // Fail fast if the DB is unreachable at boot.
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('[db] connected to', process.env.DB_HOST + '/' + process.env.DB_NAME);

    app.listen(PORT, () => {
      console.log(`[server] listening on :${PORT} (${process.env.NODE_ENV})`);
    });
  } catch (err) {
    console.error('[server] failed to start — DB unreachable:', err.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[server] SIGTERM — closing pool');
  await pool.end().catch(() => {});
  process.exit(0);
});

start();

module.exports = app;
