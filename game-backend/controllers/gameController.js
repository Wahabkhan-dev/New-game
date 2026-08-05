'use strict';

const { pool } = require('../config/database');
const { ApiError } = require('../utils/errors');
const {
  validateState,
  saveBodySchema,
  autosaveBodySchema,
  stateQuerySchema,
  historyQuerySchema,
} = require('../utils/levelSchemas');
const GameState = require('../models/GameState');
const EventHistory = require('../models/EventHistory');

function meta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

// Run validate + throw a 422 with per-field details on failure.
function ensureValid(schema, body) {
  const { value, error } = schema.validate(body, { abortEarly: false, convert: true });
  if (error) {
    throw new ApiError(422, 'validation_failed', 'Request failed validation', {
      fields: error.details.map((d) => ({ path: d.path.join('.'), message: d.message })),
    });
  }
  return value;
}

function ensureValidState(levelId, state) {
  const { value, error } = validateState(levelId, state);
  if (error) {
    throw new ApiError(422, 'invalid_state', `state is invalid for level ${levelId}`, {
      fields: error.details.map((d) => ({ path: d.path.join('.'), message: d.message })),
    });
  }
  return value;
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/game/save  — batched event-driven save
// Body: { levelId, events: [...], state: {...} }
// Inserts one event_history row per event, then upserts the trailing snapshot,
// all inside one transaction so the log and the snapshot never diverge.
// ════════════════════════════════════════════════════════════════════════════
async function save(req, res) {
  const body = ensureValid(saveBodySchema, req.body);
  const state = ensureValidState(body.levelId, body.state);
  const userId = req.user.id;

  const hasComplete = body.events.some((e) => e.eventType === 'level_complete');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const inserted = await EventHistory.insertMany(userId, body.levelId, body.events, meta(req), conn);
    await GameState.upsert(userId, body.levelId, state, 'event', conn);
    if (hasComplete) await GameState.markCompleted(userId, body.levelId, conn);
    await conn.commit();

    return res.json({ ok: true, eventsStored: inserted, levelId: body.levelId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// POST /api/game/autosave — heartbeat full-snapshot save (no events)
// Body: { levelId, state: {...} }
// ════════════════════════════════════════════════════════════════════════════
async function autosave(req, res) {
  const body = ensureValid(autosaveBodySchema, req.body);
  const state = ensureValidState(body.levelId, body.state);

  await GameState.upsert(req.user.id, body.levelId, state, 'heartbeat');
  return res.json({ ok: true, levelId: body.levelId });
}

// ════════════════════════════════════════════════════════════════════════════
// GET /api/game/state[?levelId=]  — resume snapshot
// Without levelId: returns the user's most recently saved level.
// ════════════════════════════════════════════════════════════════════════════
async function getState(req, res) {
  const userId = req.user.id;
  const query = ensureValid(stateQuerySchema, req.query);

  const row = query.levelId != null
    ? await GameState.getState(userId, query.levelId)
    : await GameState.getLatestForUser(userId);

  if (!row) {
    return res.json({ found: false, state: null });
  }

  return res.json({
    found: true,
    state: {
      levelId: row.level_id,
      lives: row.lives,
      points: row.points,
      levelData: row.level_data || {},
      isCompleted: !!row.is_completed,
      saveSource: row.save_source,
      lastSave: row.last_save,
    },
  });
}

// ════════════════════════════════════════════════════════════════════════════
// GET /api/game/history[?levelId=&limit=&offset=]  — audit/analytics log
// ════════════════════════════════════════════════════════════════════════════
async function getHistory(req, res) {
  const { levelId, limit, offset } = ensureValid(historyQuerySchema, req.query);

  const rows = await EventHistory.listForUser(req.user.id, { levelId, limit, offset });
  return res.json({ count: rows.length, limit, offset, events: rows });
}

module.exports = { save, autosave, getState, getHistory };
