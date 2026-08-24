import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';

/**
 * Access token. The payload deliberately carries only identity + role (§5) —
 * never e-mail, name, permissions or anything else that could go stale or leak.
 */
export function signAccessToken({ id, role }) {
  return jwt.sign({ userId: id, role }, config.auth.jwtSecret, {
    expiresIn: config.auth.accessTokenTtl,
    issuer: config.auth.issuer,
    subject: String(id),
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.auth.jwtSecret, { issuer: config.auth.issuer });
}

/**
 * Refresh token. A random opaque value signed as a JWT so it carries its own
 * expiry; only its SHA-256 hash is stored, so a database leak cannot be
 * replayed against the API.
 */
export function signRefreshToken({ id, role }) {
  const tokenId = crypto.randomUUID();
  const token = jwt.sign({ userId: id, role, tid: tokenId }, config.auth.jwtRefreshSecret, {
    expiresIn: config.auth.refreshTokenTtl,
    issuer: config.auth.issuer,
    subject: String(id),
  });
  return { token, tokenId };
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.auth.jwtRefreshSecret, { issuer: config.auth.issuer });
}

/** Deterministic hash for storing/looking up refresh and reset tokens. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Single-use password reset token: raw value is e-mailed, hash is stored. */
export function createResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

export function hashPassword(password) {
  return bcrypt.hash(password, config.auth.bcryptRounds);
}

export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

/**
 * Constant-work password check for accounts that do not exist, so response
 * timing does not reveal whether an e-mail is registered.
 */
const DUMMY_HASH = bcrypt.hashSync('smart-edu-timing-equaliser', 10);
export async function equaliseTiming(password) {
  await bcrypt.compare(password ?? '', DUMMY_HASH);
}

/** Turn "15m" / "7d" / "3600" into milliseconds. */
export function ttlToMs(ttl) {
  if (typeof ttl === 'number') return ttl * 1000;
  const match = /^(\d+)\s*([smhd])?$/.exec(String(ttl).trim());
  if (!match) return 15 * 60 * 1000;

  const value = Number(match[1]);
  const unit = match[2] || 's';
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[unit];
}

export default {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  createResetToken,
  hashPassword,
  verifyPassword,
  equaliseTiming,
  ttlToMs,
};
