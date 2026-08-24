import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

/**
 * Rate limiting (§50). Limits are disabled under NODE_ENV=test so the suite
 * is not throttled by its own repeated login calls.
 */

const passthrough = (_req, _res, next) => next();

const jsonLimitResponse = (message) => (req, res) => {
  res.status(429).json({ success: false, message, errors: [] });
};

function build(options) {
  if (config.isTest) return passthrough;
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
  });
}

/** Applied to the whole API surface. */
export const apiLimiter = build({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  handler: jsonLimitResponse('Too many requests from this address. Please try again later.'),
});

/** Tighter bucket for credential endpoints, keyed by IP + e-mail. */
export const authLimiter = build({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email ?? '').toLowerCase()}`,
  handler: jsonLimitResponse('Too many authentication attempts. Please wait a few minutes and try again.'),
});

/** Password reset requests are cheap to send and expensive to abuse. */
export const passwordResetLimiter = build({
  windowMs: 60 * 60 * 1000,
  max: 5,
  handler: jsonLimitResponse('Too many password reset requests. Please try again in an hour.'),
});

/** AI generation is the most expensive thing a user can trigger. */
export const aiLimiter = build({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  handler: jsonLimitResponse('You are sending requests to the AI assistant too quickly. Please pause a moment.'),
});

export default { apiLimiter, authLimiter, passwordResetLimiter, aiLimiter };
