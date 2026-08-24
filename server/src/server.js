import { createApp } from './app.js';
import { config, assertProductionSecrets } from './config/env.js';
import { pool, healthCheck, closePool } from './db/pool.js';
import { providerInfo } from './ai/aiService.js';

/**
 * Server entry point.
 *
 * Boots with a real database check so a misconfigured connection surfaces as a
 * clear message at startup rather than as a 500 on the first request.
 */

async function start() {
  assertProductionSecrets();

  const app = createApp();

  // Confirm the database before accepting traffic.
  let database;
  try {
    database = await healthCheck();
  } catch (error) {
    console.error('\n❌ Could not connect to PostgreSQL.\n');
    console.error(`   ${error.message}\n`);

    if (error.code === 'ECONNREFUSED') {
      console.error('   PostgreSQL does not appear to be running, or the host/port is wrong.');
    } else if (error.code === '28P01') {
      console.error('   Authentication failed — check PGUSER / PGPASSWORD (or DATABASE_URL) in .env.');
    } else if (error.code === '3D000') {
      console.error('   That database does not exist. Run: npm run db:setup');
    }

    console.error('\n   Configuration is read from the .env file at the repository root.');
    console.error('   Copy .env.example to .env and fill it in, then run:\n');
    console.error('     npm run db:setup && npm run db:seed\n');
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    const ai = providerInfo();

    console.log('\n' + '─'.repeat(58));
    console.log('  SMART EDU API');
    console.log('─'.repeat(58));
    console.log(`  Environment   ${config.nodeEnv}`);
    console.log(`  Listening     http://localhost:${config.port}`);
    console.log(`  Health        http://localhost:${config.port}/api/health`);
    console.log(`  Database      ${database.database} (${database.latencyMs}ms)`);
    console.log(`  Client origin ${config.clientUrl}`);
    console.log(
      `  AI provider   ${ai.provider}${ai.fallbackActive ? ' (no key — mock fallback active)' : ''}`
    );
    console.log(`  Payments      ${config.payments.enabled ? 'razorpay' : 'mock mode'}`);
    console.log('─'.repeat(58) + '\n');
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────
  // Stop accepting connections, let in-flight requests finish, then close the
  // pool — so a deploy does not sever a request mid-transaction.
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n${signal} received — shutting down gracefully…`);

    server.close(async () => {
      try {
        await closePool();
        console.log('Database pool closed. Goodbye.');
        process.exit(0);
      } catch (error) {
        console.error('Error closing the database pool:', error.message);
        process.exit(1);
      }
    });

    // Do not hang forever if a connection refuses to close.
    setTimeout(() => {
      console.error('Shutdown timed out after 10s — forcing exit.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('[fatal] Unhandled promise rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[fatal] Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  return server;
}

start().catch((error) => {
  console.error(`\n❌ Failed to start: ${error.message}\n`);
  pool.end().catch(() => {});
  process.exit(1);
});
