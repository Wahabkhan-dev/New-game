'use strict';

const express = require('express');
const router = express.Router();

const requireAuth = require('../middleware/auth');
const { asyncHandler } = require('../utils/errors');
const { saveLimiter, autosaveLimiter } = require('../middleware/rateLimit');
const { save, autosave, getState, getHistory } = require('../controllers/gameController');

// All game routes require a valid Node-issued access token.
router.use(requireAuth);

router.post('/save', saveLimiter, asyncHandler(save));
router.post('/autosave', autosaveLimiter, asyncHandler(autosave));
router.get('/state', asyncHandler(getState));
router.get('/history', asyncHandler(getHistory));

module.exports = router;
