'use strict';

const rateLimit = require('express-rate-limit');
const { ApiError } = require('../utils/errors');

// Key authed routes by user id (set by requireAuth, which runs first), so one
// user's traffic never rate-limits another sharing an IP (e.g. a school NAT).
const byUser = (req) => (req.user && req.user.id ? `u:${req.user.id}` : `ip:${req.ip}`);
const byIp = (req) => `ip:${req.ip}`;

function reject(code, message) {
  return (req, res, next) => next(new ApiError(429, code, message));
}

const common = { standardHeaders: true, legacyHeaders: false };

// Auth handoff exchange — abuse/brute-force guard, per IP.
const exchangeLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30,
  keyGenerator: byIp,
  handler: reject('rate_limited', 'Too many exchange attempts, slow down'),
});

// Event-driven save — allow bursts (client batches events): 10 requests / second.
const saveLimiter = rateLimit({
  ...common,
  windowMs: 1000,
  limit: 10,
  keyGenerator: byUser,
  handler: reject('rate_limited', 'Save rate exceeded (max 10/sec)'),
});

// Heartbeat autosave — nominally 1 per 15s. We allow 2 per 15s window so normal
// clock jitter around the 15s cadence never trips the limiter, while still
// blocking anyone hammering full snapshots.
const autosaveLimiter = rateLimit({
  ...common,
  windowMs: 15 * 1000,
  limit: 2,
  keyGenerator: byUser,
  handler: reject('rate_limited', 'Autosave rate exceeded (max ~1 per 15s)'),
});

// Refresh — modest per-IP cap; refresh happens ~every 15 min normally.
const refreshLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: byIp,
  handler: reject('rate_limited', 'Too many refresh attempts'),
});

module.exports = { exchangeLimiter, saveLimiter, autosaveLimiter, refreshLimiter };
