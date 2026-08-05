'use strict';

const express = require('express');
const router = express.Router();

const requireAuth = require('../middleware/auth');
const { asyncHandler } = require('../utils/errors');
const { exchangeLimiter, refreshLimiter } = require('../middleware/rateLimit');
const { exchange, refresh, logout } = require('../controllers/authController');

router.post('/exchange', exchangeLimiter, asyncHandler(exchange));
router.post('/refresh', refreshLimiter, asyncHandler(refresh));
router.post('/logout', requireAuth, asyncHandler(logout));

module.exports = router;
