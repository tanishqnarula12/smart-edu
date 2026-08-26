/**
 * Test bootstrap.
 *
 * The suite runs against a REAL PostgreSQL database — mocking the database
 * would test the mock, not the authorization rules and constraints that are
 * the whole point of these tests.
 *
 * Point PGDATABASE (or DATABASE_URL) at a scratch database before running:
 *   PGDATABASE=smart_edu_test npm test
 */
process.env.NODE_ENV = 'test';

// Deterministic secrets so token tests do not depend on the developer's .env.
process.env.JWT_SECRET ??= 'test-only-access-secret-that-is-long-enough-to-pass';
process.env.JWT_REFRESH_SECRET ??= 'test-only-refresh-secret-that-is-long-enough-too';

// Keep bcrypt cheap — the suite hashes a lot of passwords.
process.env.BCRYPT_ROUNDS = '4';

// Never call a real AI provider from a test.
process.env.AI_PROVIDER = 'mock';
process.env.VECTOR_PROVIDER = 'mock';
