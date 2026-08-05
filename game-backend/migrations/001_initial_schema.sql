-- ════════════════════════════════════════════════════════════════════════════
-- GAME BACKEND SCHEMA (Node/Express side)  —  runnable CREATE TABLE statements
--
-- Target: the existing Hostinger database named in .env (DB_NAME). Do NOT issue
-- CREATE DATABASE here — Hostinger provisions the DB for you and the app user
-- has no CREATE DATABASE privilege. Just run these tables inside that DB.
--
-- Correction 2 applied: users has NO password_hash. WordPress is the sole
-- source of identity; Node only stores wp_user_id + email.
-- Engine InnoDB + utf8mb4 throughout (needed for JSON + emoji in level data).
-- ════════════════════════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ────────────────────────────────────────────────────────────────────────────
-- users — one row per WordPress buyer, created lazily on first /auth/exchange.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  wp_user_id   BIGINT UNSIGNED NOT NULL,
  email        VARCHAR(255) NOT NULL,
  username     VARCHAR(100) NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login   TIMESTAMP NULL,

  UNIQUE KEY uq_wp_user_id (wp_user_id),
  UNIQUE KEY uq_email (email),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- current_state — fast-read "resume" snapshot; ONE row per (user, level).
-- level_data is a JSON column: different shape per level (validated in Node).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS current_state (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  user_id       INT NOT NULL,
  level_id      INT NOT NULL,

  lives         INT NOT NULL DEFAULT 3,
  points        INT NOT NULL DEFAULT 0,
  level_data    JSON NULL,

  save_source   ENUM('event','heartbeat','close') NOT NULL DEFAULT 'heartbeat',
  is_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMP NULL,

  timestamp     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_save     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_user_level (user_id, level_id),
  KEY idx_user_lastsave (user_id, last_save),
  CONSTRAINT fk_state_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- event_history — APPEND-ONLY audit log. One row per game event.
-- Never UPDATE/DELETE in normal operation (archival job only, out of scope).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_history (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id           INT NOT NULL,
  level_id          INT NOT NULL,

  event_type        ENUM(
                      'level_start','level_complete','coin_collected','coin_spent',
                      'health_lost','health_gained','life_lost','life_gained',
                      'checkpoint_reached','item_collected','custom_event'
                    ) NOT NULL,
  event_data        JSON NULL,
  state_snapshot    JSON NULL,

  client_timestamp  VARCHAR(40) NULL,          -- ISO string as sent by the client
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address        VARCHAR(45) NULL,
  user_agent        VARCHAR(500) NULL,

  KEY idx_user_level_time (user_id, level_id, id),
  KEY idx_event_type (event_type),
  KEY idx_created_at (created_at),
  CONSTRAINT fk_event_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- refresh_tokens — only the SHA-256 hash is stored. replaced_by_hash powers
-- the rotation grace window and reuse detection.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  user_id           INT NOT NULL,
  token_hash        CHAR(64) NOT NULL,
  replaced_by_hash  CHAR(64) NULL,

  expires_at        TIMESTAMP NOT NULL,
  revoked_at        TIMESTAMP NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address        VARCHAR(45) NULL,
  user_agent        VARCHAR(500) NULL,

  UNIQUE KEY uq_token_hash (token_hash),
  KEY idx_user (user_id),
  KEY idx_expires (expires_at),
  KEY idx_revoked (revoked_at),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- session_log — optional analytics: login/logout times per user.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_log (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  user_id      INT NOT NULL,
  login_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logout_at    TIMESTAMP NULL,
  ip_address   VARCHAR(45) NULL,
  user_agent   VARCHAR(500) NULL,

  KEY idx_user_login (user_id, login_at),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;
