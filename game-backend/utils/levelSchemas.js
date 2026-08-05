'use strict';

const Joi = require('joi');

// ════════════════════════════════════════════════════════════════════════════
// Per-level validation for the `state` object the client sends on save/autosave.
//
//   state = { lives, points, levelData }
//
// `lives` and `points` are global and validated the same everywhere. `levelData`
// has a DIFFERENT shape per level, so each level gets its own sub-schema. A level
// not listed here falls back to a permissive default (object of finite numbers),
// so adding a new level never hard-fails saves before its schema is written.
// ════════════════════════════════════════════════════════════════════════════

const finiteInt = Joi.number().integer();
const nonNeg = finiteInt.min(0);

// levelData sub-schemas keyed by levelId.
const levelDataSchemas = {
  1: Joi.object({}).unknown(true),
  2: Joi.object({}).unknown(true),
  3: Joi.object({
    l3_health: nonNeg.max(100).required(),
    l3_coins: nonNeg.required(),
  }),
  4: Joi.object({
    shadowHP: finiteInt.min(0).max(3),
    currentCP: finiteInt.min(1).max(3),
    collected: Joi.object().unknown(true),
  }).unknown(true),
  5: Joi.object({}).unknown(true),
  6: Joi.object({}).unknown(true),
  7: Joi.object({}).unknown(true),
  8: Joi.object({
    l8_score: nonNeg.required(),
    l8_hp: finiteInt.min(0).max(3).required(),
  }),
  9: Joi.object({
    l9_score: nonNeg.required(),
    l9_hp: finiteInt.min(0).max(3).required(),
    l9_gifts: nonNeg.required(),
    l9_bows: nonNeg.required(),
  }),
};

// Permissive fallback for unknown levels: any object of finite numbers/strings.
const defaultLevelData = Joi.object()
  .pattern(Joi.string(), Joi.alternatives(Joi.number(), Joi.string(), Joi.boolean()))
  .unknown(true);

function stateSchemaFor(levelId) {
  const levelData = levelDataSchemas[levelId] || defaultLevelData;
  return Joi.object({
    lives: finiteInt.min(0).max(3).required(),
    points: nonNeg.required(),
    levelData: levelData.default({}),
  });
}

// Returns { value } on success or throws ApiError-friendly details on failure.
function validateState(levelId, state) {
  const schema = stateSchemaFor(levelId);
  const { value, error } = schema.validate(state, {
    abortEarly: false,
    stripUnknown: false,
    convert: true,
  });
  return { value, error };
}

// Allowed event types — kept in sync with the ENUM in event_history.
const EVENT_TYPES = [
  'level_start',
  'level_complete',
  'coin_collected',
  'coin_spent',
  'health_lost',
  'health_gained',
  'life_lost',
  'life_gained',
  'checkpoint_reached',
  'item_collected',
  'custom_event',
];

const eventSchema = Joi.object({
  eventType: Joi.string().valid(...EVENT_TYPES).required(),
  eventData: Joi.object().unknown(true).default({}),
  clientTimestamp: Joi.string().isoDate().optional(),
});

const saveBodySchema = Joi.object({
  levelId: finiteInt.min(1).max(99).required(),
  events: Joi.array().items(eventSchema).min(1).max(100).required(),
  state: Joi.object().required(), // shape validated separately via validateState
});

const autosaveBodySchema = Joi.object({
  levelId: finiteInt.min(1).max(99).required(),
  state: Joi.object().required(),
});

// Query-string params arrive as strings (or are absent) — never trust
// Number(req.query.x) directly, a non-numeric value becomes NaN and DBs can
// interpret an unparameterized NaN as a bare identifier (real bug found in
// testing: `?levelId=abc` produced "Unknown column 'NaN' in 'WHERE'").
const stateQuerySchema = Joi.object({
  levelId: finiteInt.min(1).max(99).optional(),
});

const historyQuerySchema = Joi.object({
  levelId: finiteInt.min(1).max(99).optional(),
  limit: finiteInt.min(1).max(500).default(100),
  offset: nonNeg.default(0),
});

module.exports = {
  validateState,
  saveBodySchema,
  autosaveBodySchema,
  stateQuerySchema,
  historyQuerySchema,
  EVENT_TYPES,
};
