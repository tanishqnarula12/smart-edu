import { query, queryOne, withTransaction } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  hashPassword,
  verifyPassword,
  equaliseTiming,
  createResetToken,
  ttlToMs,
} from '../utils/tokens.js';
import { config } from '../config/env.js';

/**
 * Authentication domain logic. Controllers stay thin; everything that touches
 * credentials lives here so the security rules have one home.
 */

/**
 * Sequence helper for generated identifiers like STU001.
 * `table`/`column` are always literals from the call sites below — never user
 * input — so interpolating them as identifiers is safe. The value is bound.
 */
async function nextSequentialId(client, prefix, table, column) {
  const { rows } = await client.query(
    `SELECT ${column} AS value FROM ${table} WHERE ${column} LIKE $1 ORDER BY ${column} DESC LIMIT 1`,
    [`${prefix}%`]
  );
  const last = rows[0]?.value;
  const lastNumber = last ? Number.parseInt(last.slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isFinite(lastNumber) ? lastNumber : 0) + 1).padStart(3, '0')}`;
}

/**
 * Create a user plus their role profile in one transaction (§60) — a user row
 * without its profile would be a broken account.
 */
export async function createUser(
  { name, email, password, role, phone = null, isActive = true, ...extra },
  client = null
) {
  const run = async (tx) => {
    const existing = await tx.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      throw ApiError.conflict('An account with this e-mail already exists');
    }

    const passwordHash = await hashPassword(password);

    const { rows } = await tx.query(
      `INSERT INTO users (name, email, password_hash, role, phone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, phone, avatar_url, is_active, created_at`,
      [name.trim(), email.toLowerCase(), passwordHash, role, phone, isActive]
    );
    const user = rows[0];

    await tx.query('INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);

    switch (role) {
      case 'student': {
        const studentId = extra.studentId || (await nextSequentialId(tx, 'STU', 'student_profiles', 'student_id'));
        await tx.query(
          `INSERT INTO student_profiles
             (user_id, student_id, class_id, roll_number, date_of_birth, gender, address, admission_year)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            user.id,
            studentId,
            extra.classId ?? null,
            extra.rollNumber ?? null,
            extra.dateOfBirth ?? null,
            extra.gender ?? null,
            extra.address ?? null,
            extra.admissionYear ?? new Date().getFullYear(),
          ]
        );
        // Keep enrollments in step when the account is created inside a class.
        if (extra.classId) {
          const { rows: classRows } = await tx.query('SELECT academic_year FROM classes WHERE id = $1', [
            extra.classId,
          ]);
          if (classRows[0]) {
            await tx.query(
              `INSERT INTO enrollments (student_id, class_id, academic_year)
               VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
              [user.id, extra.classId, classRows[0].academic_year]
            );
          }
        }
        break;
      }

      case 'parent':
        await tx.query(
          'INSERT INTO parent_profiles (user_id, occupation, phone, address) VALUES ($1, $2, $3, $4)',
          [user.id, extra.occupation ?? null, phone, extra.address ?? null]
        );
        break;

      case 'teacher': {
        const employeeId = extra.employeeId || (await nextSequentialId(tx, 'TCH', 'teacher_profiles', 'employee_id'));
        await tx.query(
          `INSERT INTO teacher_profiles (user_id, employee_id, department_id, designation, qualification, joined_on)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            user.id,
            employeeId,
            extra.departmentId ?? null,
            extra.designation ?? 'Assistant Professor',
            extra.qualification ?? null,
            extra.joinedOn ?? new Date().toISOString().slice(0, 10),
          ]
        );
        break;
      }

      case 'admin': {
        const employeeId = extra.employeeId || (await nextSequentialId(tx, 'ADM', 'admin_profiles', 'employee_id'));
        await tx.query(
          'INSERT INTO admin_profiles (user_id, employee_id, designation) VALUES ($1, $2, $3)',
          [user.id, employeeId, extra.designation ?? 'Administrator']
        );
        break;
      }

      default:
        throw ApiError.badRequest(`Unsupported role: ${role}`);
    }

    return user;
  };

  return client ? run(client) : withTransaction(run);
}

/** Verify credentials. Throws 401 with a deliberately vague message. */
export async function authenticate(email, password) {
  const user = await queryOne(
    'SELECT id, name, email, password_hash, role, phone, avatar_url, is_active FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (!user) {
    // Burn the same time a real bcrypt compare would, so response timing does
    // not reveal which e-mails are registered.
    await equaliseTiming(password);
    throw ApiError.unauthorized('Incorrect e-mail or password');
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) throw ApiError.unauthorized('Incorrect e-mail or password');

  if (!user.is_active) {
    throw ApiError.forbidden('This account has been deactivated. Contact your administrator.');
  }

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  delete user.password_hash;
  return user;
}

/** Mint an access/refresh pair and persist the refresh token's hash. */
export async function issueTokens(user, { userAgent = null, ipAddress = null } = {}) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken } = signRefreshToken(user);

  const expiresAt = new Date(Date.now() + ttlToMs(config.auth.refreshTokenTtl));

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, hashToken(refreshToken), expiresAt, userAgent?.slice(0, 400) ?? null, ipAddress]
  );

  return { accessToken, refreshToken, expiresIn: config.auth.accessTokenTtl };
}

/**
 * Exchange a refresh token for a new pair, rotating the old one.
 * A revoked or unknown token is rejected even when the JWT itself is valid —
 * that is what makes logout actually end a session.
 */
export async function rotateRefreshToken(refreshToken, context = {}) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await queryOne(
    'SELECT id, user_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash]
  );

  if (!stored) throw ApiError.unauthorized('Your session is no longer valid. Please sign in again.');
  if (stored.revoked_at) {
    // A revoked token being replayed suggests theft — drop every session for
    // that user rather than just refusing this one request.
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [
      stored.user_id,
    ]);
    throw ApiError.unauthorized('Session reuse detected. Please sign in again.');
  }
  if (new Date(stored.expires_at) < new Date()) {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }

  const user = await queryOne(
    'SELECT id, name, email, role, phone, avatar_url, is_active FROM users WHERE id = $1',
    [payload.userId]
  );
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.is_active) throw ApiError.forbidden('This account has been deactivated');

  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [stored.id]);
  const tokens = await issueTokens(user, context);

  return { user, ...tokens };
}

export async function revokeRefreshToken(refreshToken) {
  if (!refreshToken) return;
  await query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(refreshToken)]
  );
}

export async function revokeAllSessions(userId) {
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [
    userId,
  ]);
}

/**
 * Issue a password reset token.
 *
 * Returns `{ token }` only when the account exists; the controller responds
 * identically either way so the endpoint cannot be used to enumerate accounts.
 */
export async function createPasswordReset(email) {
  const user = await queryOne('SELECT id, name, email FROM users WHERE email = $1 AND is_active', [
    email.toLowerCase(),
  ]);
  if (!user) return null;

  // One live reset link at a time.
  await query('UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);

  const { token, tokenHash } = createResetToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
    user.id,
    tokenHash,
    expiresAt,
  ]);

  return { user, token, expiresAt };
}

/** Consume a reset token and set the new password. */
export async function resetPasswordWithToken(token, newPassword) {
  const tokenHash = hashToken(token);

  return withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at
         FROM password_resets pr
        WHERE pr.token_hash = $1
        FOR UPDATE`,
      [tokenHash]
    );
    const record = rows[0];

    if (!record) throw ApiError.badRequest('This reset link is not valid');
    if (record.used_at) throw ApiError.badRequest('This reset link has already been used');
    if (new Date(record.expires_at) < new Date()) {
      throw ApiError.badRequest('This reset link has expired. Request a new one.');
    }

    const passwordHash = await hashPassword(newPassword);
    await tx.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, record.user_id]);
    await tx.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [record.id]);
    // Changing a password ends every existing session.
    await tx.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [
      record.user_id,
    ]);

    return record.user_id;
  });
}

/** Change password for a signed-in user, after re-checking the current one. */
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await queryOne('SELECT id, password_hash FROM users WHERE id = $1', [userId]);
  if (!user) throw ApiError.notFound('Account not found');

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) throw ApiError.badRequest('Your current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
  await revokeAllSessions(userId);
}

/** Full profile for /api/auth/me — user row plus the matching role profile. */
export async function getFullProfile(userId) {
  const user = await queryOne(
    `SELECT u.id, u.name, u.email, u.role, u.phone, u.avatar_url, u.is_active,
            u.last_login_at, u.created_at
       FROM users u
      WHERE u.id = $1`,
    [userId]
  );
  if (!user) throw ApiError.notFound('Account not found');

  let profile = null;

  if (user.role === 'student') {
    profile = await queryOne(
      `SELECT sp.student_id, sp.roll_number, sp.class_id, sp.date_of_birth, sp.gender,
              sp.address, sp.guardian_name, sp.admission_year, sp.parent_permission_enabled,
              c.name AS class_name, c.section, c.academic_year, c.room,
              d.name AS department_name,
              ct.name AS class_teacher_name
         FROM student_profiles sp
         LEFT JOIN classes c     ON c.id = sp.class_id
         LEFT JOIN departments d ON d.id = c.department_id
         LEFT JOIN users ct      ON ct.id = c.class_teacher_id
        WHERE sp.user_id = $1`,
      [userId]
    );
  } else if (user.role === 'teacher') {
    profile = await queryOne(
      `SELECT tp.employee_id, tp.department_id, tp.designation, tp.qualification, tp.joined_on,
              d.name AS department_name,
              (SELECT COUNT(DISTINCT class_id) FROM teacher_subjects WHERE teacher_id = $1) AS class_count,
              (SELECT COUNT(DISTINCT subject_id) FROM teacher_subjects WHERE teacher_id = $1) AS subject_count
         FROM teacher_profiles tp
         LEFT JOIN departments d ON d.id = tp.department_id
        WHERE tp.user_id = $1`,
      [userId]
    );
  } else if (user.role === 'parent') {
    profile = await queryOne(
      `SELECT pp.occupation, pp.phone AS contact_phone, pp.address, pp.alternate_email,
              (SELECT COUNT(*) FROM parent_student WHERE parent_id = $1) AS children_count
         FROM parent_profiles pp
        WHERE pp.user_id = $1`,
      [userId]
    );
  } else if (user.role === 'admin') {
    profile = await queryOne(
      'SELECT ap.employee_id, ap.designation FROM admin_profiles ap WHERE ap.user_id = $1',
      [userId]
    );
  }

  const preferences = await queryOne('SELECT * FROM user_preferences WHERE user_id = $1', [userId]);

  return { user, profile: profile ?? {}, preferences: preferences ?? {} };
}

export default {
  createUser,
  authenticate,
  issueTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllSessions,
  createPasswordReset,
  resetPasswordWithToken,
  changePassword,
  getFullProfile,
};
