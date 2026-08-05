# API Contract — Game Backend

Version 1.0 · base path shown as `{API}` (e.g. `https://api.domain.com` or, in
this phase's local testing, `http://localhost:3200`).

This is the exact contract the game frontend will build against in the next
phase. Nothing here calls the backend yet.

## Conventions

- All request/response bodies are JSON (`Content-Type: application/json`).
- Auth: protected routes require `Authorization: Bearer <accessToken>`.
- The refresh token is delivered/read as an **httpOnly cookie** (`game_rt`,
  path `/api/auth`). The browser sends it automatically; JS never reads it.
  Frontend `fetch` must use `credentials: 'include'` for `/api/auth/*`.
- CORS is locked to a single origin (`CORS_ORIGIN`). Requests from any other
  origin are rejected by the browser.
- Timestamps in responses are DB datetime strings in UTC (`YYYY-MM-DD HH:MM:SS`).

## Error shape

Every error returns an HTTP status plus:

```json
{ "error": "machine_slug", "message": "human readable", "details": { } }
```

`details` is present only on validation errors. Known `error` slugs:

| Slug | Status | Meaning |
|---|---|---|
| `missing_handoff` | 400 | No `handoff_token` in body |
| `invalid_handoff` | 401 | Handoff token bad signature / claims |
| `handoff_expired` | 401 | Handoff token past its expiry / max age |
| `missing_token` | 401 | No Bearer access token on a protected route |
| `token_expired` | 401 | Access token expired → call `/api/auth/refresh` |
| `invalid_token` | 401 | Access token malformed/invalid |
| `missing_refresh` | 401 | No refresh cookie on `/api/auth/refresh` |
| `refresh_expired` | 401 | Refresh token expired → re-run handoff exchange |
| `invalid_refresh` | 401 | Refresh token not recognized |
| `refresh_reuse_detected` | 401 | Old revoked token reused → all sessions revoked |
| `account_disabled` | 403 | User row marked `is_active = false` |
| `validation_failed` | 422 | Request body failed schema validation |
| `invalid_state` | 422 | `state` invalid for that `levelId` |
| `rate_limited` | 429 | Too many requests (see rate limits) |
| `not_found` | 404 | No such route |
| `internal_error` | 500 | Unexpected server error |

---

## POST `/api/auth/exchange`

Exchange a WordPress handoff token for a Node session. Public (token in body).
Creates the Node `users` row lazily on first call for a given `wp_user_id`.

**Request**
```json
{ "handoff_token": "eyJhbGciOiJIUzI1NiI..." }
```

**200 Response** — also sets the `game_rt` httpOnly refresh cookie.
```json
{
  "accessToken": "eyJhbGci...",
  "tokenType": "Bearer",
  "expiresIn": "15m",
  "user": { "id": 1, "wp_user_id": 101, "email": "tester@example.com" }
}
```

**Errors:** `missing_handoff` (400), `invalid_handoff` / `handoff_expired` (401),
`account_disabled` (403), `rate_limited` (429).

---

## POST `/api/auth/refresh`

Rotate the refresh token and get a new access token. Public — authenticated by
the `game_rt` cookie only. Call this when an access token expires (~every 15m)
or on page load to silently resume a session. Send with `credentials: 'include'`.

**Request:** empty body; cookie carries the token.

**200 Response** — sets a NEW `game_rt` cookie (rotation), returns:
```json
{ "accessToken": "eyJhbGci...", "tokenType": "Bearer", "expiresIn": "15m" }
```
(`"rotated": "grace"` is present if a just-rotated token was tolerated within
the grace window.)

**Errors:** `missing_refresh` / `refresh_expired` / `invalid_refresh` /
`refresh_reuse_detected` (all 401), `rate_limited` (429).

---

## POST `/api/auth/logout`

Revoke the current refresh token and clear the cookie. **Protected** (Bearer).

**200 Response**
```json
{ "ok": true }
```

---

## POST `/api/game/save`

Batched event-driven save. **Protected.** Inserts one `event_history` row per
array entry, then upserts the trailing `state` snapshot — atomically in one
transaction. Send a batch every ~2s or every ~5 events, whichever comes first.

**Request**
```json
{
  "levelId": 3,
  "events": [
    { "eventType": "coin_collected", "eventData": { "amount": 5 }, "clientTimestamp": "2026-07-29T22:14:35.000Z" },
    { "eventType": "coin_collected", "eventData": { "amount": 5 } },
    { "eventType": "health_lost", "eventData": { "amount": 1 } }
  ],
  "state": { "lives": 2, "points": 165, "levelData": { "l3_health": 79, "l3_coins": 47 } }
}
```

- `events`: 1–100 entries. `eventType` ∈ the enum below. `eventData` is a free
  object. `clientTimestamp` optional ISO string.
- Including a `level_complete` event also flags `current_state.is_completed`.
- `state` is validated per `levelId` (see State shapes).

**Event types:** `level_start`, `level_complete`, `coin_collected`,
`coin_spent`, `health_lost`, `health_gained`, `life_lost`, `life_gained`,
`checkpoint_reached`, `item_collected`, `custom_event`.

**200 Response**
```json
{ "ok": true, "eventsStored": 3, "levelId": 3 }
```

**Errors:** `validation_failed` (422), `invalid_state` (422),
`missing_token`/`token_expired` (401), `rate_limited` (429).

---

## POST `/api/game/autosave`

Heartbeat full-snapshot save (no events). **Protected.** Fire every 10–15s and
once from a `visibilitychange`/`beforeunload` best-effort handler on close.

**Request**
```json
{ "levelId": 3, "state": { "lives": 2, "points": 170, "levelData": { "l3_health": 75, "l3_coins": 49 } } }
```

**200 Response**
```json
{ "ok": true, "levelId": 3 }
```

**Errors:** as `save`. Rate limit is ~1 per 15s (2 per 15s window tolerated).

---

## GET `/api/game/state`

Resume snapshot. **Protected.**

- `GET /api/game/state?levelId=3` → that level's snapshot.
- `GET /api/game/state` (no query) → the user's most-recently-saved level
  (use on page load when the client doesn't know which level to resume).

**200 Response (found)**
```json
{
  "found": true,
  "state": {
    "levelId": 3,
    "lives": 2,
    "points": 170,
    "levelData": { "l3_health": 75, "l3_coins": 49 },
    "isCompleted": false,
    "saveSource": "heartbeat",
    "lastSave": "2026-07-29 22:14:36"
  }
}
```

**200 Response (nothing saved yet)**
```json
{ "found": false, "state": null }
```

---

## GET `/api/game/history`

Audit/analytics event log for the authenticated user. **Protected.**

Query params: `levelId` (optional filter), `limit` (default 100, max 500),
`offset` (default 0). Newest first.

**200 Response**
```json
{
  "count": 3,
  "limit": 5,
  "offset": 0,
  "events": [
    { "id": 9, "user_id": 1, "level_id": 3, "event_type": "health_lost", "event_data": { "amount": 1 }, "client_timestamp": null, "created_at": "2026-07-29 22:14:35" }
  ]
}
```

---

## GET `/health`

Liveness + DB reachability. Public. `200 {"status":"ok","db":"up",...}` or
`503 {"status":"degraded","db":"down",...}`.

---

## State shapes (validated per level)

`state` is always `{ lives, points, levelData }`:

- `lives`: integer 0–3
- `points`: integer ≥ 0
- `levelData`: shape depends on `levelId`:

| levelId | levelData schema |
|---|---|
| 1, 2, 5, 6, 7 | any object (permissive) |
| 3 | `{ l3_health: 0–100, l3_coins: ≥0 }` (both required) |
| 4 | `{ shadowHP: 0–3, currentCP: 1–3, collected: object }` + extra keys allowed |
| 8 | `{ l8_score: ≥0, l8_hp: 0–3 }` (both required) |
| 9 | `{ l9_score: ≥0, l9_hp: 0–3, l9_gifts: ≥0, l9_bows: ≥0 }` (all required) |
| other | any object of numbers/strings/booleans |

Invalid `levelData` returns `422 invalid_state` with `details.fields[]` naming
each bad path. Schemas live in `utils/levelSchemas.js`; add a new level there.

---

## Rate limits

| Endpoint | Limit | Key |
|---|---|---|
| `/api/auth/exchange` | 30 / 15 min | IP |
| `/api/auth/refresh` | 20 / min | IP |
| `/api/game/save` | 10 / sec (burst) | user |
| `/api/game/autosave` | ~1 / 15s (2 per 15s window) | user |

Exceeding any returns `429 rate_limited`.

---

## Token lifecycle (frontend integration notes)

1. On load, the game (already on the WP origin) calls WP
   `GET /wp-json/game/v1/handoff` → `{ handoff_token }`.
2. `POST {API}/api/auth/exchange { handoff_token }` → store `accessToken` in
   memory (a JS variable, NOT localStorage). Cookie is set automatically.
3. Attach `Authorization: Bearer <accessToken>` to every `/api/game/*` call.
4. On a `401 token_expired`, call `POST {API}/api/auth/refresh`
   (`credentials: 'include'`), replace the in-memory access token, retry once.
5. On `401 refresh_expired`/`invalid_refresh`, restart from step 1.
