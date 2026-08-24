/**
 * Migration runner.
 *
 * Applies, in order:
 *   1. database/schema.sql          → recorded as 000_schema.sql
 *   2. database/seed.sql            → recorded as 001_reference_data.sql
 *   3. database/migrations/*.sql    → sorted by filename
 *
 * Every file is applied inside a transaction and recorded in `schema_migrations`
 * with a SHA-256 checksum, so re-running is safe and idempotent.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.resolve(__dirname, '../../../database');
const migrationsDir = path.join(databaseDir, 'migrations');

const checksum = (contents) => crypto.createHash('sha256').update(contents).digest('hex').slice(0, 16);

function collectMigrations() {
  const files = [];

  const schemaPath = path.join(databaseDir, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    files.push({ name: '000_schema.sql', path: schemaPath });
  }

  const seedPath = path.join(databaseDir, 'seed.sql');
  if (fs.existsSync(seedPath)) {
    files.push({ name: '001_reference_data.sql', path: seedPath });
  }

  if (fs.existsSync(migrationsDir)) {
    const incremental = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of incremental) {
      files.push({ name: file, path: path.join(migrationsDir, file) });
    }
  }

  return files;
}

export async function runMigrations({ silent = false } = {}) {
  const log = silent ? () => {} : (...args) => console.log(...args);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(160) PRIMARY KEY,
      checksum   VARCHAR(64)  NOT NULL,
      applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: applied } = await pool.query('SELECT name, checksum FROM schema_migrations');
  const appliedByName = new Map(applied.map((row) => [row.name, row.checksum]));

  const migrations = collectMigrations();
  let appliedCount = 0;

  for (const migration of migrations) {
    const sql = fs.readFileSync(migration.path, 'utf8');
    const hash = checksum(sql);
    const previous = appliedByName.get(migration.name);

    if (previous) {
      if (previous !== hash) {
        log(
          `  ~ ${migration.name} — already applied but the file changed. ` +
            'Roll the change forward in a new migration file.'
        );
      } else {
        log(`  · ${migration.name} — already applied`);
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
        migration.name,
        hash,
      ]);
      await client.query('COMMIT');
      appliedCount += 1;
      log(`  ✔ ${migration.name}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Migration failed in ${migration.name}: ${error.message}`);
    } finally {
      client.release();
    }
  }

  return { total: migrations.length, applied: appliedCount };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  console.log('\n🗄️  Running Smart Edu migrations…\n');
  runMigrations()
    .then(({ total, applied }) => {
      console.log(
        `\n✅ Migrations complete — ${applied} applied, ${total - applied} already up to date.\n` +
          '   Next: npm run db:seed\n'
      );
    })
    .catch((error) => {
      console.error(`\n❌ ${error.message}\n`);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
