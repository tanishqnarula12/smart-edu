/**
 * One-shot local bootstrap: create the database if it is missing, then migrate
 * and seed. Connects to the maintenance `postgres` database to issue CREATE
 * DATABASE, since you cannot create a database from inside itself.
 *
 *   npm run db:setup
 */
import pg from 'pg';
import { config } from '../config/env.js';
import { runMigrations } from './migrate.js';
import { closePool } from './pool.js';

function adminConnection() {
  if (config.db.connectionString) {
    const url = new URL(config.db.connectionString);
    const target = url.pathname.replace(/^\//, '') || config.db.database;
    url.pathname = '/postgres';
    return { adminConfig: { connectionString: url.toString() }, database: target };
  }
  return {
    adminConfig: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: 'postgres',
      ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
    },
    database: config.db.database,
  };
}

async function ensureDatabase() {
  const { adminConfig, database } = adminConnection();
  const client = new pg.Client(adminConfig);

  await client.connect();
  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (rows.length) {
      console.log(`  · database "${database}" already exists`);
      return false;
    }
    // Identifiers cannot be parameterised; the name comes from our own config,
    // and quoting it defends against anything odd in the configured value.
    await client.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
    console.log(`  ✔ created database "${database}"`);
    return true;
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('\n🚀 Smart Edu database setup\n');
  console.log('Step 1 — database');
  await ensureDatabase();

  console.log('\nStep 2 — schema');
  const { applied, total } = await runMigrations();
  console.log(`  ${applied} migration(s) applied, ${total - applied} already up to date.`);

  console.log('\n✅ Database ready. Next: npm run db:seed\n');
}

main()
  .catch((error) => {
    console.error(`\n❌ Setup failed: ${error.message}`);
    if (error.code === 'ECONNREFUSED') {
      console.error('   PostgreSQL does not appear to be running, or the host/port is wrong.');
    } else if (error.code === '28P01') {
      console.error('   Authentication failed — check PGUSER / PGPASSWORD (or DATABASE_URL) in .env.');
    }
    console.error('');
    process.exitCode = 1;
  })
  .finally(() => closePool().catch(() => {}));
