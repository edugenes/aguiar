/**
 * Camada de banco: SQLite (local) ou PostgreSQL/Supabase (DATABASE_URL).
 * Expõe get, all, run compatíveis com o uso atual do server.js.
 */

const path = require('path');
const fs = require('fs');

const DATABASE_URL = process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== ''
  ? process.env.DATABASE_URL.trim()
  : null;

let db = null;
let isPg = false;

/** Converte placeholders ? para $1, $2, ... (PostgreSQL) */
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

if (DATABASE_URL) {
  // ------------------------- PostgreSQL (Supabase) -------------------------
  const { Pool } = require('pg');

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  });

  isPg = true;

  db = {
    _pool: pool,

    get(sql, params, callback) {
      const pgSql = toPgPlaceholders(sql);
      pool.query(pgSql, params || [], (err, result) => {
        if (err) return callback(err);
        callback(null, result.rows[0] || null);
      });
    },

    all(sql, params, callback) {
      const pgSql = toPgPlaceholders(sql);
      pool.query(pgSql, params || [], (err, result) => {
        if (err) return callback(err);
        callback(null, result.rows || []);
      });
    },

    run(sql, params, callback) {
      const isInsert = /^\s*INSERT\s+INTO\s+/i.test(sql);
      const pgSql = isInsert ? toPgPlaceholders(sql) + ' RETURNING id' : toPgPlaceholders(sql);

      pool.query(pgSql, params || [], (err, result) => {
        if (err) return callback(err);
        const ctx = {};
        if (isInsert && result.rows && result.rows[0]) {
          ctx.lastID = result.rows[0].id;
        }
        callback.call(ctx, null);
      });
    },

    /** Cria tabelas no Postgres se não existirem (equivalente ao schema SQLite). */
    initSchema(callback) {
      const sql = `
        CREATE TABLE IF NOT EXISTS products (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          price_cents INTEGER NOT NULL,
          image_path TEXT,
          category TEXT DEFAULT '',
          sku TEXT DEFAULT '',
          promotional INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          google_id TEXT UNIQUE,
          phone TEXT,
          city TEXT,
          district TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY,
          customer_name TEXT NOT NULL,
          customer_phone TEXT NOT NULL,
          customer_address TEXT NOT NULL,
          notes TEXT,
          total_cents INTEGER NOT NULL,
          status TEXT NOT NULL,
          items_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          customer_id INTEGER REFERENCES customers(id)
        );
      `;
      pool.query(sql, (err) => {
        if (err) {
          console.error('Erro ao criar schema PostgreSQL', err);
          return callback(err);
        }
        callback(null);
      });
    },
  };

  console.log('Usando banco PostgreSQL (Supabase).');
} else {
  // ------------------------- SQLite (local / dev) -------------------------
  const sqlite3 = require('sqlite3').verbose();
  const ROOT_DIR = path.resolve(__dirname, '..');
  const DEFAULT_DB_DIR =
    (process.env.DB_DIR && process.env.DB_DIR.trim() !== '')
      ? process.env.DB_DIR
      : path.join(ROOT_DIR, 'data');
  const DB_PATH =
    process.env.DB_PATH && process.env.DB_PATH.trim() !== ''
      ? process.env.DB_PATH
      : path.join(DEFAULT_DB_DIR, 'catalog.db');

  const DB_DIR = path.dirname(DB_PATH);
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const sqliteDb = new sqlite3.Database(DB_PATH);
  console.log('Usando banco SQLite em:', DB_PATH);

  db = {
    _raw: sqliteDb,

    get(sql, params, callback) {
      sqliteDb.get(sql, params || [], callback);
    },

    all(sql, params, callback) {
      sqliteDb.all(sql, params || [], callback);
    },

    run(sql, params, callback) {
      sqliteDb.run(sql, params || [], callback);
    },

    /** No SQLite o schema é aplicado no server.js (CREATE TABLE IF NOT EXISTS + migrações). */
    initSchema(callback) {
      callback(null);
    },
  };
}

/** Retorna true se o banco em uso for PostgreSQL. */
function isPostgres() {
  return isPg;
}

module.exports = db;
module.exports.isPostgres = isPostgres;
