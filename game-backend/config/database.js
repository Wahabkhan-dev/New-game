'use strict';

const mysql = require('mysql2/promise');

// Single shared connection pool. All models use parameterized queries through
// this pool — never string concatenation — so the driver escapes every value.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  // Return DATE/DATETIME as JS strings (UTC-ish) rather than local Date objects,
  // so timestamps serialize predictably in JSON responses.
  dateStrings: true,
  // JSON columns come back already parsed by mysql2.
  namedPlaceholders: false,
});

module.exports = { pool };
