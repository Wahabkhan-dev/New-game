# Game Backend — Node/Express + MySQL + WordPress handoff

Backend for the pet-care game's save/resume system. WordPress owns identity and
purchase status; this service owns game state. There is **no password sync** and
**no file-level gating** — access is enforced entirely at the API via a
short-lived WordPress **handoff token** exchanged for Node-issued JWTs.

> Status: backend phase only. The Phaser/Vite game is **not** wired to this yet.

## Architecture (this phase)

```
Browser on domain.com (already logged into WordPress, has purchased)
   │  1. GET /wp-json/game/v1/handoff        (Plugin 2, WP cookie auth)
   │        → { handoff_token }  (JWT, 60s, HS256, shared secret)
   ▼
Node backend
   │  2. POST /api/auth/exchange { handoff_token }
   │        → accessToken (15m JWT) + game_rt refresh cookie (7d, httpOnly)
   │  3. POST /api/game/save | /autosave  (Bearer accessToken)
   │  4. GET  /api/game/state            (resume)
   ▼
MySQL/MariaDB (Hostinger): users, current_state, event_history,
                           refresh_tokens, session_log
```

WordPress **Plugin 1 (Purchase Sync)** records completed purchases in
`wp_game_purchases`. **Plugin 2 (Game Handoff)** reads that table and mints the
handoff token. Node trusts the token's signature — it never queries WordPress.

## Requirements

- Node.js ≥ 18
- A MySQL 8 **or MariaDB 10.4+** database (Hostinger provides MariaDB)
- The two WordPress plugins installed on the WP site (for the real flow)

> **MariaDB note:** Hostinger runs MariaDB. The schema's `JSON` columns are
> stored as `LONGTEXT` + `json_valid()` there, which works transparently. The
> code inserts JSON as strings (no `CAST(... AS JSON)`, which MariaDB rejects).

## Local setup

```bash
cd game-backend
cp .env.example .env          # then edit values (see table below)
npm install
npm run migrate               # creates the 5 tables (idempotent)
npm run dev                   # nodemon, or: npm start
```

Server boots only if the DB is reachable; it pings on start and exits otherwise.

### Environment variables

| Var | Purpose |
|---|---|
| `NODE_ENV` | `development` / `production`. In production the dev handoff route is disabled. |
| `PORT` | Listen port (default 3000). |
| `CORS_ORIGIN` | The ONLY allowed browser origin, e.g. `https://domain.com`. |
| `DB_HOST/PORT/NAME/USER/PASSWORD` | MySQL/MariaDB connection. |
| `DB_CONNECTION_LIMIT` | Pool size (default 10). |
| `JWT_ACCESS_SECRET` | Secret for Node access tokens. 32+ random chars. |
| `JWT_ACCESS_EXPIRY` | Access token TTL (default `15m`). |
| `JWT_REFRESH_EXPIRY_DAYS` | Refresh token TTL in days (default 7). |
| `REFRESH_COOKIE_NAME` | Cookie name (default `game_rt`). |
| `REFRESH_ROTATION_GRACE_SECONDS` | Tolerate a just-rotated token this long (default 60). |
| `HANDOFF_SECRET` | **Must equal** the WP "Game Handoff" plugin secret. |
| `HANDOFF_MAX_AGE_SECONDS` | Max accepted handoff-token age (default 60). |
| `HANDOFF_ISSUER` | Expected `iss` claim (default `wordpress`). |
| `COOKIE_SECURE` | `true` in production (HTTPS). `false` for local http. |
| `COOKIE_SAMESITE` | Refresh cookie SameSite (default `Strict`). |

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Test the full flow without the game (curl)

This mirrors the exact sequence verified during the build. A dev-only route
`POST /api/dev/mint-handoff` stands in for WordPress Plugin 2 (disabled when
`NODE_ENV=production`). Uses `http://localhost:3000` below — adjust to your port.

```bash
BASE=http://localhost:3000

# 1) Mint a handoff token (simulates WordPress Plugin 2)
HANDOFF=$(curl -s -X POST $BASE/api/dev/mint-handoff \
  -H "Content-Type: application/json" \
  -d '{"wp_user_id":101,"email":"tester@example.com"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).handoff_token")

# 2) Exchange for a Node session (stores refresh cookie in cj.txt)
ACCESS=$(curl -s -c cj.txt -X POST $BASE/api/auth/exchange \
  -H "Content-Type: application/json" \
  -d "{\"handoff_token\":\"$HANDOFF\"}" \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")

# 3) Batched event-driven save (2 coins + 1 hit) on level 3
curl -s -X POST $BASE/api/game/save \
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d '{"levelId":3,"events":[
        {"eventType":"coin_collected","eventData":{"amount":5}},
        {"eventType":"coin_collected","eventData":{"amount":5}},
        {"eventType":"health_lost","eventData":{"amount":1}}],
       "state":{"lives":2,"points":165,"levelData":{"l3_health":79,"l3_coins":47}}}'

# 4) Heartbeat autosave (full snapshot)
curl -s -X POST $BASE/api/game/autosave \
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d '{"levelId":3,"state":{"lives":2,"points":170,"levelData":{"l3_health":75,"l3_coins":49}}}'

# 5) Resume: fetch current state (should show points 170, l3_health 75)
curl -s "$BASE/api/game/state?levelId=3" -H "Authorization: Bearer $ACCESS"

# 6) History (append-only log, newest first)
curl -s "$BASE/api/game/history?levelId=3&limit=5" -H "Authorization: Bearer $ACCESS"

# 7) Refresh (rotates the cookie, returns a new access token)
curl -s -b cj.txt -c cj.txt -X POST $BASE/api/auth/refresh

# 8) Logout (revokes the refresh token)
curl -s -b cj.txt -X POST $BASE/api/auth/logout -H "Authorization: Bearer $ACCESS"
```

Expected: step 3 → `{"ok":true,"eventsStored":3}`, step 5 shows the autosave
values with `"saveSource":"heartbeat"`, step 6 lists 3 events newest-first.
Confirm step 5 matches what you saved in step 4 — that is the resume guarantee.

Handy CLI variant of step 1: `npm run -s mint-handoff 101 tester@example.com`.

## WordPress plugin

Upload `../wordpress-plugins/game-handoff.zip` (Plugins → Add New → Upload
Plugin) and activate it — it's a single plugin covering purchase tracking,
login, and the game password (the former separate "Game Purchase Sync"
plugin was merged into it; its source is kept for reference at
`../wordpress-plugins/_absorbed-into-game-handoff_game-purchase-sync/` but
should not be installed alongside the merged plugin — it would register a
duplicate order-completed hook).

Settings → *Game Handoff*:
1. Set the WooCommerce **product ID** of the game. Completed orders containing
   it get recorded in `wp_game_purchases`.
2. Copy the **shared secret** into this backend's `.env` as `HANDOFF_SECRET`
   (they must match). Keep the token TTL ≤ `HANDOFF_MAX_AGE_SECONDS` and the
   issuer = `HANDOFF_ISSUER`.
3. Set the **Game URL** — used in the purchase-confirmation email and the
   My Account → Game "Play Now" link.

Three ways a handoff token gets minted, all producing the same token shape:
- `GET /wp-json/game/v1/handoff` — cookie-authed WP session. Returns
  `401 not_logged_in`, `403 no_purchase`, or `200 { handoff_token }`.
- `POST /wp-json/game/v1/login` — `{ email, password }`, checked against the
  separate game-only password (not the WP account password). Returns
  `401 invalid_credentials` or `200 { handoff_token }`.
- `POST /wp-json/game/v1/forgot-password` — `{ email }`, always `200`
  (generic response, no user enumeration); re-issues + re-emails a new game
  password if the email matches a purchased account.

## Deploying on Hostinger

- **DB:** already provisioned (remote MySQL/MariaDB). Add the backend server's
  IP under Hostinger *Remote MySQL* so it can connect. Run `npm run migrate`.
- **Node process:** needs a plan with Node support (VPS/Cloud). Run under **PM2**
  (`pm2 start server.js --name game-backend`) behind Nginx, TLS terminated,
  proxying to `PORT`. Shared hosting without Node → run the backend elsewhere
  (Railway/Render) and point the game at it; CORS + cookie flags still apply.
- **Production must set:** `NODE_ENV=production`, `COOKIE_SECURE=true`,
  `CORS_ORIGIN=https://domain.com`, strong `JWT_ACCESS_SECRET`, and a
  `HANDOFF_SECRET` matching the WP plugin.

## Project layout

```
game-backend/
├── server.js            # Express app + boot (DB ping, graceful shutdown)
├── config/              # database pool, jwt config, cors
├── middleware/          # requireAuth, errorHandler, rateLimit
├── models/              # User, GameState, EventHistory, RefreshToken
├── controllers/         # authController, gameController
├── routes/              # auth, game, health, dev
├── utils/               # tokens, levelSchemas (Joi), errors
├── migrations/          # 001_initial_schema.sql + migrate.js
├── scripts/             # mint-handoff.js (dev), cleanup-tokens.js (maintenance)
├── API_CONTRACT.md      # exact route/request/response spec for frontend
└── .env.example
```

## Maintenance

`refresh_tokens` gains ~1 row per login and ~1 per token refresh (every ~15
min of active play) and is never auto-pruned. Run this on a schedule (daily
is plenty) once deployed — Hostinger's hPanel has a Cron Jobs section under
Advanced:

```bash
npm run cleanup-tokens
```

Deletes rows that are naturally expired, or were revoked more than a day ago
(safely past the rotation grace window). `event_history` is intentionally
NOT pruned by this — it's the permanent audit log; see the growth note below.

## Security notes & known gaps (for review)

- **Trust boundary:** Node trusts any validly-signed, unexpired handoff token.
  Protect `HANDOFF_SECRET` like a password; rotating it in WP requires updating
  `.env` immediately or all new logins fail.
- **Client-authoritative state:** the client sends its own `state`. Joi bounds
  each field per level, but a modified client could still send plausible values
  (e.g. max legal coins). `event_history` is the audit trail to detect this
  later; server-side reconciliation (sum of events vs snapshot) is a future
  hardening step, not built this phase.
- **`event_history` growth:** unbounded append-only table. Add date-based
  archival/partitioning before it gets large (out of scope now).
- **Refresh reuse handling:** reusing a long-revoked token revokes all of that
  user's sessions (theft response); a just-rotated token is tolerated for
  `REFRESH_ROTATION_GRACE_SECONDS` to avoid lockouts on flaky networks.
- **Guest checkout:** Plugin 1 only records purchases tied to a WP user id. If
  WooCommerce guest checkout is enabled, ensure account creation on purchase, or
  those buyers can't get a handoff token.
```
