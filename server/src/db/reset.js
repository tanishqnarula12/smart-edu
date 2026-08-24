/**
 * Drop every application object and rebuild from scratch, then seed.
 *
 *   npm run db:reset
 *
 * Destructive by design and refuses to run when NODE_ENV=production.
 */
import { pool, closePool } from './pool.js';
import { config } from '../config/env.js';
import { runMigrations } from './migrate.js';

async function dropEverything() {
  // Dropping and recreating the schema is far more reliable than trying to
  // drop tables in dependency order.
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');

  const { rows } = await pool.query('SELECT current_user AS user');
  await pool.query(`GRANT ALL ON SCHEMA public TO "${rows[0].user.replace(/"/g, '""')}"`);
  await pool.query('GRANT ALL ON SCHEMA public TO public');
}

async function main() {
  if (config.isProduction) {
    throw new Error('db:reset is disabled when NODE_ENV=production.');
  }

  console.log('\n♻️  Resetting the Smart Edu database…\n');
  console.log('Step 1 — dropping existing objects');
  await dropEverything();
  console.log('  ✔ schema dropped and recreated');

  console.log('\nStep 2 — rebuilding schema');
  await runMigrations();

  console.log('\n✅ Reset complete. Next: npm run db:seed\n');
}

main()
  .catch((error) => {
    console.error(`\n❌ Reset failed: ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => closePool().catch(() => {}));
