import { queryOne, queryMany } from '../db/pool.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Authentication & role-based authorization.
 *
 * Rule from §50/§69: the backend never trusts a role sent by the frontend.
 * The role attached to `req.user` is re-read from the database on every
 * request, so a token minted before a demotion cannot outlive it.
 */

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  // Cookie fallback keeps refresh-on-reload working without exposing the
  // access token to page scripts when the client opts into cookie mode.
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  return null;
}

/** Require a valid access token; populates `req.user`. */
export const authenticateToken = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Session expired, please sign in again');
    }
    throw ApiError.unauthorized('Invalid authentication token');
  }

  const user = await queryOne(
    `SELECT id, name, email, role, phone, avatar_url, is_active
       FROM users
      WHERE id = $1`,
    [payload.userId]
  );

  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.is_active) throw ApiError.forbidden('This account has been deactivated');

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    avatarUrl: user.avatar_url,
  };
  req.token = token;
  next();
});

/**
 * Populate `req.user` when a valid token is present, but never reject.
 * Used by endpoints that behave differently for signed-in visitors.
 */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const user = await queryOne(
      'SELECT id, name, email, role, avatar_url, is_active FROM users WHERE id = $1',
      [payload.userId]
    );
    if (user?.is_active) {
      req.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatar_url,
      };
    }
  } catch {
    // An invalid token on an optional route is simply an anonymous visitor.
  }
  next();
});

/** Require exactly this role. */
export function requireRole(role) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));
    if (req.user.role !== role) {
      return next(ApiError.forbidden(`This area is restricted to ${role} accounts`));
    }
    next();
  };
}

/** Require any one of these roles. */
export function requireAnyRole(...roles) {
  const allowed = roles.flat();
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));
    if (!allowed.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to access this resource'));
    }
    next();
  };
}

/**
 * Effective permissions = role baseline, plus per-user grants, minus per-user
 * revocations. Cached on the request so a handler checking several permissions
 * only hits the database once.
 */
export async function getEffectivePermissions(userId, role) {
  const rows = await queryMany(
    `SELECT p.code,
            COALESCE(up.granted, TRUE) AS granted,
            (rp.role IS NOT NULL)      AS from_role,
            (up.user_id IS NOT NULL)   AS overridden
       FROM permissions p
       LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role = $2
       LEFT JOIN user_permissions up ON up.permission_id = p.id AND up.user_id = $1
      WHERE rp.role IS NOT NULL OR up.user_id IS NOT NULL`,
    [userId, role]
  );

  return new Set(
    rows.filter((row) => (row.overridden ? row.granted : row.from_role)).map((row) => row.code)
  );
}

/** Require a granular permission code (§30) on top of the role gate. */
export function requirePermission(...codes) {
  const required = codes.flat();
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized('Authentication required');

    if (!req.permissions) {
      req.permissions = await getEffectivePermissions(req.user.id, req.user.role);
    }

    const missing = required.filter((code) => !req.permissions.has(code));
    if (missing.length) {
      throw ApiError.forbidden(`Missing required permission: ${missing.join(', ')}`);
    }
    next();
  });
}

/**
 * Guard a `/:userId`-style route so a non-admin can only reach their own
 * record — closes the "change the id in the URL" hole from §5.
 */
export function requireSelfOrRoles(paramName = 'userId', ...roles) {
  const privileged = roles.flat();
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required'));

    const target = req.params[paramName];
    if (target === req.user.id) return next();
    if (privileged.includes(req.user.role)) return next();

    next(ApiError.forbidden('You can only access your own records'));
  };
}

export default {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireAnyRole,
  requirePermission,
  requireSelfOrRoles,
  getEffectivePermissions,
};
