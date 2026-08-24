import pg from 'pg';
import { config } from '../config/env.js';

const { Pool, types } = pg;

// node-postgres hands NUMERIC back as a string to preserve arbitrary precision.
// Every numeric column here (marks, percentages, fees) fits comfortably in a
// double, and the API is much easier to consume with real numbers.
types.setTypeParser(types.builtins.NUMERIC, (value) => (value === null ? null : Number.parseFloat(value)));
types.setTypeParser(types.builtins.INT8, (value) => (value === null ? null : Number.parseInt(value, 10)));
// DATE as a plain YYYY-MM-DD string — avoids the timezone shift that bit
// every "attendance is off by one day" bug.
types.setTypeParser(types.builtins.DATE, (value) => value);

const poolConfig = config.db.connectionString
  ? { connectionString: config.db.connectionString }
  : {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
    };

poolConfig.max = config.db.maxPoolSize;
poolConfig.idleTimeoutMillis = 30_000;
poolConfig.connectionTimeoutMillis = 10_000;
if (config.db.ssl) poolConfig.ssl = { rejectUnauthorized: false };

export const pool = new Pool(poolConfig);

pool.on('error', (error) => {
  // An idle client erroring out must not take the process down.
  console.error('[db] idle client error:', error.message);
});

/**
 * Run a parameterised query. Every call site passes values as `$1, $2 …` —
 * string interpolation into SQL is never used anywhere in this codebase.
 */
export async function query(text, params = []) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (config.isDevelopment && duration > 400) {
    console.warn(`[db] slow query (${duration}ms): ${text.replace(/\s+/g, ' ').slice(0, 120)}…`);
  }
  return result;
}

/** First row, or null. */
export async function queryOne(text, params = []) {
  const { rows } = await query(text, params);
  return rows[0] ?? null;
}

/** Rows array. */
export async function queryMany(text, params = []) {
  const { rows } = await query(text, params);
  return rows;
}

/**
 * Run `callback` inside a transaction, committing on success and rolling back
 * on any throw. The callback receives a dedicated client — use `client.query`,
 * not the module-level `query`, or the statement escapes the transaction.
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[db] rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function healthCheck() {
  const started = Date.now();
  const { rows } = await pool.query('SELECT NOW() AS now, current_database() AS database');
  return {
    connected: true,
    database: rows[0].database,
    serverTime: rows[0].now,
    latencyMs: Date.now() - started,
  };
}

export async function closePool() {
  await pool.end();
}

export default pool;
