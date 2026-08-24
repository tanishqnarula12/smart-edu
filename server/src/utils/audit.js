import { query } from '../db/pool.js';

/**
 * Actions worth an audit row (§40). Kept as a frozen catalogue so call sites
 * cannot drift into free-form strings.
 */
export const AUDIT_ACTIONS = Object.freeze({
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  REGISTER: 'auth.register',
  PASSWORD_CHANGED: 'auth.password_changed',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_RESET: 'auth.password_reset',

  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_DISABLED: 'user.disabled',
  USER_ENABLED: 'user.enabled',
  USER_PASSWORD_RESET: 'user.password_reset_by_admin',
  PERMISSIONS_CHANGED: 'user.permissions_changed',

  ATTENDANCE_MARKED: 'attendance.marked',
  ATTENDANCE_UPDATED: 'attendance.updated',

  MARKS_ENTERED: 'marks.entered',
  MARKS_UPDATED: 'marks.updated',
  MARKS_PUBLISHED: 'marks.published',

  ASSIGNMENT_CREATED: 'assignment.created',
  ASSIGNMENT_UPDATED: 'assignment.updated',
  ASSIGNMENT_DELETED: 'assignment.deleted',
  SUBMISSION_GRADED: 'submission.graded',

  PRIVACY_UPDATED: 'privacy.updated',
  PARENT_LINKED: 'parent.linked',
  PARENT_UNLINKED: 'parent.unlinked',

  COMPLAINT_UPDATED: 'complaint.updated',
  LEAVE_REVIEWED: 'leave.reviewed',
  PAYMENT_RECORDED: 'payment.recorded',
  SETTINGS_UPDATED: 'settings.updated',
});

/** Best-effort client IP, honouring a proxy header when Express trusts one. */
export function clientIp(req) {
  return (
    req?.ip ||
    req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req?.socket?.remoteAddress ||
    null
  );
}

/**
 * Record a sensitive action. Auditing must never break the request it is
 * describing, so failures are logged and swallowed.
 */
export async function recordAudit({ req, userId, action, entity = null, entityId = null, metadata = {} }) {
  try {
    const actorId = userId ?? req?.user?.id ?? null;
    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        actorId,
        action,
        entity,
        entityId ? String(entityId) : null,
        JSON.stringify(metadata ?? {}),
        clientIp(req),
        req?.headers?.['user-agent']?.slice(0, 400) ?? null,
      ]
    );
  } catch (error) {
    console.error('[audit] failed to record entry:', error.message);
  }
}

export default { AUDIT_ACTIONS, recordAudit, clientIp };
