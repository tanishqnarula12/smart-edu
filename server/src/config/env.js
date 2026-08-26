import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The repo keeps a single .env at the root; a server/.env wins if present so a
// deployment can override without touching the shared file.
const rootEnv = path.resolve(__dirname, '../../../.env');
const serverEnv = path.resolve(__dirname, '../../.env');

if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
if (fs.existsSync(serverEnv)) dotenv.config({ path: serverEnv, override: true });

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

// Development gets a stable fallback so `npm run dev` works before anyone edits
// .env. Production refuses to boot without real secrets — see assertProductionSecrets().
const DEV_JWT_SECRET = 'smart-edu-development-only-access-secret';
const DEV_JWT_REFRESH_SECRET = 'smart-edu-development-only-refresh-secret';

export const config = {
  nodeEnv,
  isProduction,
  isTest,
  isDevelopment: !isProduction && !isTest,
  port: int(process.env.PORT, 5000),

  db: {
    connectionString: process.env.DATABASE_URL || '',
    host: process.env.PGHOST || 'localhost',
    port: int(process.env.PGPORT, 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'smart_edu',
    ssl: bool(process.env.PGSSL, false),
    maxPoolSize: int(process.env.PG_POOL_MAX, 10),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || DEV_JWT_REFRESH_SECRET,
    accessTokenTtl: process.env.JWT_EXPIRES_IN || '15m',
    refreshTokenTtl: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 12),
    issuer: 'smart-edu',
  },

  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // Set true only when the client and API are on different registrable
  // domains (e.g. a Vercel client + a Render API) — the refresh cookie needs
  // SameSite=None to survive that cross-origin request at all. Leave false
  // for a same-host deployment; 'strict' is the tighter default there.
  crossSiteCookies: bool(process.env.CROSS_SITE_COOKIES, false),

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: int(process.env.RATE_LIMIT_MAX, 500),
    authMax: int(process.env.AUTH_RATE_LIMIT_MAX, 25),
  },

  ai: {
    provider: (process.env.AI_PROVIDER || 'mock').toLowerCase(),
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || '',
    baseUrl: process.env.AI_BASE_URL || '',
    // Optional second tier, tried between a failed live provider and the
    // templated mock: a local model on the operator's own machine via
    // Ollama. Off by default — enabling it costs nothing when Ollama isn't
    // running (the attempt just fails fast), but there's no reason to make
    // every request pay even that cost for people who never installed it.
    ollamaFallback: bool(process.env.AI_OLLAMA_FALLBACK, false),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  },

  vector: {
    provider: (process.env.VECTOR_PROVIDER || 'mock').toLowerCase(),
    apiKey: process.env.VECTOR_API_KEY || '',
    index: process.env.VECTOR_INDEX || 'smart-edu',
    url: process.env.VECTOR_URL || '',
  },

  payments: {
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
    get enabled() {
      return Boolean(this.razorpayKeyId && this.razorpayKeySecret);
    },
  },

  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    dir: process.env.STORAGE_DIR || 'uploads',
    bucket: process.env.STORAGE_BUCKET || '',
    accessKey: process.env.STORAGE_ACCESS_KEY || '',
    secretKey: process.env.STORAGE_SECRET_KEY || '',
    region: process.env.STORAGE_REGION || '',
    maxFileSizeMb: int(process.env.STORAGE_MAX_FILE_MB, 10),
  },

  academic: {
    attendanceThreshold: int(process.env.ATTENDANCE_WARNING_THRESHOLD, 75),
    defaultPageSize: int(process.env.DEFAULT_PAGE_SIZE, 20),
    maxPageSize: int(process.env.MAX_PAGE_SIZE, 100),
  },

  seed: {
    demoPassword: process.env.SEED_DEMO_PASSWORD || 'Demo@12345',
  },
};

/**
 * Refuse to start a production server on the development fallback secrets.
 * Called from server.js at boot, not at import time, so tests and tooling can
 * import this module freely.
 */
export function assertProductionSecrets() {
  if (!config.isProduction) return;

  const problems = [];
  if (!process.env.JWT_SECRET || config.auth.jwtSecret === DEV_JWT_SECRET) {
    problems.push('JWT_SECRET is not set');
  }
  if (!process.env.JWT_REFRESH_SECRET || config.auth.jwtRefreshSecret === DEV_JWT_REFRESH_SECRET) {
    problems.push('JWT_REFRESH_SECRET is not set');
  }
  if (config.auth.jwtSecret === config.auth.jwtRefreshSecret) {
    problems.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (String(config.auth.jwtSecret).length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters');
  }
  if (!config.db.connectionString && !process.env.PGPASSWORD) {
    problems.push('No database credentials configured');
  }

  if (problems.length) {
    throw new Error(
      `Refusing to start in production with an insecure configuration:\n  - ${problems.join('\n  - ')}\n` +
        'Set these in your environment (see .env.example).'
    );
  }
}

export default config;
