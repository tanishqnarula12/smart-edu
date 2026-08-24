import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'node:path';

import { config } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { uploadRoot } from './middleware/upload.js';
import { healthCheck } from './db/pool.js';
import { providerInfo } from './ai/aiService.js';

/**
 * Express application (§50).
 *
 * Exported without starting a listener so the test suite can drive it through
 * supertest directly.
 */
export function createApp() {
  const app = express();

  // Behind a reverse proxy, trust one hop so req.ip is the real client and
  // rate limiting keys on something meaningful.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves uploaded files cross-origin to the Vite dev server.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: config.isProduction ? undefined : false,
    })
  );

  const allowedOrigins = new Set(
    [config.clientUrl, 'http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173'].filter(
      Boolean
    )
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and non-browser callers (curl, tests) send no Origin.
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        callback(new Error(`Origin ${origin} is not permitted by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  if (!config.isTest) {
    app.use(morgan(config.isProduction ? 'combined' : 'dev'));
  }

  // Uploaded files. `index: false` stops directory listings, and the
  // extension allow-list at upload time is what keeps this safe to serve.
  app.use(
    '/uploads',
    express.static(uploadRoot, {
      index: false,
      dotfiles: 'deny',
      maxAge: config.isProduction ? '7d' : 0,
    })
  );

  // ── Health checks (unauthenticated, and outside the rate limiter) ───────
  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime() }, message: 'Healthy' });
  });

  app.get('/api/health', async (_req, res) => {
    let database;
    try {
      database = await healthCheck();
    } catch (error) {
      database = { connected: false, error: error.message };
    }

    const healthy = database.connected;
    res.status(healthy ? 200 : 503).json({
      success: healthy,
      data: {
        status: healthy ? 'ok' : 'degraded',
        environment: config.nodeEnv,
        uptime: Math.round(process.uptime()),
        database,
        ai: providerInfo(),
      },
      message: healthy ? 'All systems operational' : 'Database unavailable',
    });
  });

  app.use('/api', apiLimiter, routes);

  // ── Production: serve the built client ──────────────────────────────────
  if (config.isProduction) {
    const clientDist = path.resolve(process.cwd(), '../client/dist');
    app.use(express.static(clientDist));

    // Anything that is not an API route falls through to the SPA so client
    // routing works on a hard refresh.
    app.get(/^(?!\/api|\/uploads|\/health).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
