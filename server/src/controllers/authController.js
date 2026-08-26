import { query, queryOne } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { publicUser } from '../utils/sanitize.js';
import { recordAudit, AUDIT_ACTIONS, clientIp } from '../utils/audit.js';
import { config } from '../config/env.js';
import { ttlToMs } from '../utils/tokens.js';
import * as authService from '../services/authService.js';

/**
 * Auth endpoints (§5). Responses never include password hashes, refresh token
 * hashes or reset tokens — `publicUser` is the only shape that leaves here.
 */

const REFRESH_COOKIE = 'refreshToken';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction || config.crossSiteCookies,
    sameSite: config.crossSiteCookies ? 'none' : config.isProduction ? 'strict' : 'lax',
    maxAge: ttlToMs(config.auth.refreshTokenTtl),
    path: '/api/auth',
  };
}

const requestContext = (req) => ({
  userAgent: req.headers['user-agent'],
  ipAddress: clientIp(req),
});

/** POST /api/auth/register — student and parent self-registration only. */
export const register = asyncHandler(async (req, res) => {
  const setting = await queryOne("SELECT value FROM settings WHERE key = 'allow_public_registration'");
  if (setting && setting.value === false) {
    throw ApiError.forbidden('Self-registration is disabled. Ask your administrator for an account.');
  }

  const { name, email, password, role, phone } = req.body;
  const user = await authService.createUser({ name, email, password, role, phone: phone ?? null });

  const tokens = await authService.issueTokens(user, requestContext(req));
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());

  await recordAudit({
    req,
    userId: user.id,
    action: AUDIT_ACTIONS.REGISTER,
    entity: 'user',
    entityId: user.id,
    metadata: { role },
  });

  return sendCreated(
    res,
    {
      user: publicUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    },
    'Welcome to Smart Edu — your account is ready'
  );
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  let user;
  try {
    user = await authService.authenticate(email, password);
  } catch (error) {
    await recordAudit({
      req,
      userId: null,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entity: 'user',
      metadata: { email: email.toLowerCase() },
    });
    throw error;
  }

  const tokens = await authService.issueTokens(user, requestContext(req));
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());

  await recordAudit({
    req,
    userId: user.id,
    action: AUDIT_ACTIONS.LOGIN,
    entity: 'user',
    entityId: user.id,
    metadata: { role: user.role },
  });

  return sendSuccess(
    res,
    {
      user: publicUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    },
    `Welcome back, ${user.name.split(' ')[0]}`
  );
});

/** POST /api/auth/refresh — accepts the cookie or a body token. */
export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  if (!token) throw ApiError.unauthorized('No session to refresh');

  const { user, accessToken, refreshToken, expiresIn } = await authService.rotateRefreshToken(
    token,
    requestContext(req)
  );

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

  return sendSuccess(
    res,
    { user: publicUser(user), accessToken, refreshToken, expiresIn },
    'Session refreshed'
  );
});

/** POST /api/auth/logout */
export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  await authService.revokeRefreshToken(token);

  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });

  if (req.user) {
    await recordAudit({ req, action: AUDIT_ACTIONS.LOGOUT, entity: 'user', entityId: req.user.id });
  }

  return sendSuccess(res, null, 'Signed out successfully');
});

/** POST /api/auth/logout-all */
export const logoutEverywhere = asyncHandler(async (req, res) => {
  await authService.revokeAllSessions(req.user.id);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  return sendSuccess(res, null, 'Signed out of all devices');
});

/** GET /api/auth/me — the call the client makes right after login (§43). */
export const me = asyncHandler(async (req, res) => {
  const { user, profile, preferences } = await authService.getFullProfile(req.user.id);

  const { rows: permissionRows } = await query(
    `SELECT p.code
       FROM permissions p
       LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role = $2
       LEFT JOIN user_permissions up ON up.permission_id = p.id AND up.user_id = $1
      WHERE COALESCE(up.granted, rp.role IS NOT NULL)
        AND (rp.role IS NOT NULL OR up.user_id IS NOT NULL)`,
    [req.user.id, req.user.role]
  );

  return sendSuccess(
    res,
    {
      user: publicUser(user),
      profile,
      preferences,
      permissions: permissionRows.map((row) => row.code),
    },
    'Profile loaded'
  );
});

/**
 * POST /api/auth/forgot-password
 *
 * Always responds identically so the endpoint cannot be used to discover which
 * e-mail addresses have accounts.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await authService.createPasswordReset(email);

  if (result) {
    await recordAudit({
      req,
      userId: result.user.id,
      action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
      entity: 'user',
      entityId: result.user.id,
    });
  }

  const payload = {};

  // No mail transport is wired up in this build. Rather than silently dropping
  // the link, development surfaces it so the flow is testable end to end;
  // production never returns it.
  if (!config.isProduction && result) {
    payload.resetToken = result.token;
    payload.resetUrl = `${config.clientUrl}/reset-password/${result.token}`;
    payload.note = 'Returned in development only — in production this is e-mailed to the user.';
  }

  return sendSuccess(
    res,
    payload,
    'If an account exists for that e-mail, a password reset link has been sent.'
  );
});

/** POST /api/auth/reset-password */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const userId = await authService.resetPasswordWithToken(token, password);

  await recordAudit({
    req,
    userId,
    action: AUDIT_ACTIONS.PASSWORD_RESET,
    entity: 'user',
    entityId: userId,
  });

  return sendSuccess(res, null, 'Your password has been reset. Please sign in.');
});

/** POST /api/auth/change-password */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user.id, currentPassword, newPassword);

  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.PASSWORD_CHANGED,
    entity: 'user',
    entityId: req.user.id,
  });

  return sendSuccess(res, null, 'Password changed. Please sign in again.');
});

/** PATCH /api/auth/profile */
export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, avatarUrl, address, occupation, dateOfBirth } = req.body;

  const updates = [];
  const params = [];
  const push = (fragment, value) => {
    params.push(value);
    updates.push(`${fragment} = $${params.length}`);
  };

  if (name !== undefined) push('name', name.trim());
  if (phone !== undefined) push('phone', phone);
  if (avatarUrl !== undefined) push('avatar_url', avatarUrl);

  if (updates.length) {
    params.push(req.user.id);
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
  }

  // Role-specific fields land on the matching profile table.
  if (req.user.role === 'student' && (address !== undefined || dateOfBirth !== undefined)) {
    await query(
      `UPDATE student_profiles
          SET address = COALESCE($1, address),
              date_of_birth = COALESCE($2::date, date_of_birth)
        WHERE user_id = $3`,
      [address ?? null, dateOfBirth || null, req.user.id]
    );
  }
  if (req.user.role === 'parent' && (occupation !== undefined || address !== undefined)) {
    await query(
      `UPDATE parent_profiles
          SET occupation = COALESCE($1, occupation),
              address = COALESCE($2, address)
        WHERE user_id = $3`,
      [occupation ?? null, address ?? null, req.user.id]
    );
  }

  const { user, profile } = await authService.getFullProfile(req.user.id);
  return sendSuccess(res, { user: publicUser(user), profile }, 'Profile updated');
});

/** PATCH /api/auth/preferences */
export const updatePreferences = asyncHandler(async (req, res) => {
  const map = {
    emailNotifications: 'email_notifications',
    pushNotifications: 'push_notifications',
    attendanceAlerts: 'attendance_alerts',
    marksAlerts: 'marks_alerts',
    assignmentAlerts: 'assignment_alerts',
    noticeAlerts: 'notice_alerts',
    theme: 'theme',
  };

  const updates = [];
  const params = [];
  for (const [key, column] of Object.entries(map)) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${column} = $${params.length}`);
    }
  }

  if (!updates.length) throw ApiError.badRequest('Provide at least one preference to change');

  // Accounts created before preferences existed may not have a row yet.
  await query('INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [req.user.id]);

  params.push(req.user.id);
  const { rows: updated } = await query(
    `UPDATE user_preferences SET ${updates.join(', ')}, updated_at = NOW()
      WHERE user_id = $${params.length}
      RETURNING *`,
    params
  );

  return sendSuccess(res, updated[0], 'Preferences saved');
});

/** GET /api/auth/sessions — active devices for the signed-in user. */
export const listSessions = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, user_agent, ip_address, created_at, expires_at
       FROM refresh_tokens
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 20`,
    [req.user.id]
  );
  return sendSuccess(res, rows, 'Active sessions');
});

export default {
  register,
  login,
  refresh,
  logout,
  logoutEverywhere,
  me,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile,
  updatePreferences,
  listSessions,
};
