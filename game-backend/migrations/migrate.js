'use strict';

// Minimal migration runner: executes every *.sql file in this folder, in
// filename order, against the DB in .env. Safe to re-run — all schema uses
// CREATE TABLE IF NOT EXISTS.
//
//   npm run migrate

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true, // only enabled here, never in the app pool
  });

  try {
    const files = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
      process.stdout.write(`[migrate] running ${file} ... `);
      await conn.query(sql);
      process.stdout.write('ok\n');
    }
    console.log('[migrate] done');
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
