/**
 * Shapers that guarantee secret columns never leave the API (§5).
 *
 * Controllers pass rows through these instead of spreading raw query results,
 * so adding a sensitive column to a table cannot silently start leaking it.
 */

const SECRET_FIELDS = [
  'password_hash',
  'passwordHash',
  'token_hash',
  'tokenHash',
  'refresh_token',
  'reset_token',
];

/** Strip known-secret keys from any object or array of objects. */
export function stripSecrets(input) {
  if (Array.isArray(input)) return input.map(stripSecrets);
  if (!input || typeof input !== 'object') return input;

  const copy = { ...input };
  for (const field of SECRET_FIELDS) delete copy[field];
  return copy;
}

/** The canonical public shape of a user. */
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone ?? null,
    avatarUrl: row.avatar_url ?? null,
    isActive: row.is_active ?? true,
    lastLoginAt: row.last_login_at ?? null,
    createdAt: row.created_at,
  };
}

/** A user plus whichever role profile was joined in. */
export function userWithProfile(row) {
  if (!row) return null;
  const user = publicUser(row);

  const profile = {};
  const profileKeys = [
    'student_id',
    'roll_number',
    'class_id',
    'class_name',
    'section',
    'date_of_birth',
    'gender',
    'address',
    'guardian_name',
    'admission_year',
    'parent_permission_enabled',
    'employee_id',
    'department_id',
    'department_name',
    'designation',
    'qualification',
    'joined_on',
    'occupation',
    'alternate_email',
  ];

  for (const key of profileKeys) {
    if (row[key] !== undefined) {
      const camel = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      profile[camel] = row[key];
    }
  }

  return Object.keys(profile).length ? { ...user, profile } : user;
}

export default { stripSecrets, publicUser, userWithProfile };
