import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  api, authed, ensureSchema, resetDatabase, closeDatabase, createTestUser, query, TEST_PASSWORD,
} from './helpers.js';

/** Authentication (§68): registration, login, tokens and password handling. */

beforeAll(async () => {
  await ensureSchema();
});

afterAll(async () => {
  await closeDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('POST /api/auth/register', () => {
  it('creates a student account and returns tokens', async () => {
    const response = await api().post('/api/auth/register').send({
      name: 'Ananya Sharma',
      email: 'ananya@test.local',
      password: 'Str0ngPass',
      confirmPassword: 'Str0ngPass',
      role: 'student',
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('ananya@test.local');
    expect(response.body.data.accessToken).toBeTruthy();
  });

  it('creates the matching role profile in the same transaction', async () => {
    await api().post('/api/auth/register').send({
      name: 'Profile Check',
      email: 'profile@test.local',
      password: 'Str0ngPass',
      confirmPassword: 'Str0ngPass',
      role: 'student',
    });

    const { rows } = await query(
      `SELECT sp.student_id FROM student_profiles sp
         JOIN users u ON u.id = sp.user_id
        WHERE u.email = 'profile@test.local'`
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].student_id).toMatch(/^STU\d+/);
  });

  it('never returns the password hash', async () => {
    const response = await api().post('/api/auth/register').send({
      name: 'Hash Check',
      email: 'hash@test.local',
      password: 'Str0ngPass',
      confirmPassword: 'Str0ngPass',
      role: 'student',
    });

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('password_hash');
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('Str0ngPass');
  });

  it('stores the password bcrypt-hashed, never in plaintext', async () => {
    await api().post('/api/auth/register').send({
      name: 'Bcrypt Check',
      email: 'bcrypt@test.local',
      password: 'Str0ngPass',
      confirmPassword: 'Str0ngPass',
      role: 'student',
    });

    const { rows } = await query("SELECT password_hash FROM users WHERE email = 'bcrypt@test.local'");

    expect(rows[0].password_hash).not.toBe('Str0ngPass');
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects a weak password', async () => {
    const response = await api().post('/api/auth/register').send({
      name: 'Weak Password',
      email: 'weak@test.local',
      password: 'weak',
      confirmPassword: 'weak',
      role: 'student',
    });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
  });

  it('rejects mismatched passwords', async () => {
    const response = await api().post('/api/auth/register').send({
      name: 'Mismatch',
      email: 'mismatch@test.local',
      password: 'Str0ngPass',
      confirmPassword: 'Different1',
      role: 'student',
    });

    expect(response.status).toBe(422);
  });

  it('refuses to self-register a teacher or admin account', async () => {
    for (const role of ['teacher', 'admin']) {
      const response = await api().post('/api/auth/register').send({
        name: 'Escalation Attempt',
        email: `${role}-escalation@test.local`,
        password: 'Str0ngPass',
        confirmPassword: 'Str0ngPass',
        role,
      });

      expect(response.status).toBe(422);
    }
  });

  it('rejects a duplicate e-mail', async () => {
    const payload = {
      name: 'First',
      email: 'duplicate@test.local',
      password: 'Str0ngPass',
      confirmPassword: 'Str0ngPass',
      role: 'student',
    };

    await api().post('/api/auth/register').send(payload);
    const response = await api().post('/api/auth/register').send({ ...payload, name: 'Second' });

    expect(response.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with correct credentials', async () => {
    const user = await createTestUser({ role: 'student', email: 'login@test.local' });

    const response = await api()
      .post('/api/auth/login')
      .send({ email: 'login@test.local', password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(user.id);
    expect(response.body.data.accessToken).toBeTruthy();
  });

  it('rejects a wrong password with 401', async () => {
    await createTestUser({ role: 'student', email: 'wrongpass@test.local' });

    const response = await api()
      .post('/api/auth/login')
      .send({ email: 'wrongpass@test.local', password: 'NotThePassword1' });

    expect(response.status).toBe(401);
    expect(response.body.data).toBeUndefined();
  });

  it('gives the same error for an unknown account, so e-mails cannot be enumerated', async () => {
    await createTestUser({ role: 'student', email: 'known@test.local' });

    const wrongPassword = await api()
      .post('/api/auth/login')
      .send({ email: 'known@test.local', password: 'NotThePassword1' });

    const unknownEmail = await api()
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: 'NotThePassword1' });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
  });

  it('refuses a deactivated account', async () => {
    const user = await createTestUser({ role: 'student', email: 'disabled@test.local' });
    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [user.id]);

    const response = await api()
      .post('/api/auth/login')
      .send({ email: 'disabled@test.local', password: TEST_PASSWORD });

    expect(response.status).toBe(403);
  });

  it('records a failed attempt in the audit log', async () => {
    await createTestUser({ role: 'student', email: 'audited@test.local' });

    await api()
      .post('/api/auth/login')
      .send({ email: 'audited@test.local', password: 'WrongPassword1' });

    const { rows } = await query(
      "SELECT action FROM audit_logs WHERE action = 'auth.login_failed'"
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('JWT validation', () => {
  it('rejects a request with no token', async () => {
    const response = await api().get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const response = await api()
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    // A token that is structurally valid but signed by somebody else.
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJ1c2VySWQiOiJmYWtlIiwicm9sZSI6ImFkbWluIn0.' +
      'ZmFrZXNpZ25hdHVyZQ';

    const response = await api().get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(response.status).toBe(401);
  });

  it('accepts a valid token and returns the profile', async () => {
    const user = await createTestUser({ role: 'student' });
    const response = await authed(user.accessToken).get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(user.id);
    expect(response.body.data.permissions).toBeInstanceOf(Array);
  });

  it('re-reads the role from the database rather than trusting the token', async () => {
    const user = await createTestUser({ role: 'student' });

    // Deactivate after the token was issued — it must stop working at once.
    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [user.id]);

    const response = await authed(user.accessToken).get('/api/auth/me');
    expect(response.status).toBe(403);
  });
});

describe('Session lifecycle', () => {
  it('exchanges a refresh token for a new access token', async () => {
    const user = await createTestUser({ role: 'student' });

    const response = await api()
      .post('/api/auth/refresh')
      .send({ refreshToken: user.refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeTruthy();
  });

  it('invalidates the old refresh token after rotation', async () => {
    const user = await createTestUser({ role: 'student' });

    await api().post('/api/auth/refresh').send({ refreshToken: user.refreshToken });
    const replay = await api().post('/api/auth/refresh').send({ refreshToken: user.refreshToken });

    expect(replay.status).toBe(401);
  });

  it('stores the refresh token hashed, not in the clear', async () => {
    const user = await createTestUser({ role: 'student' });

    const { rows } = await query('SELECT token_hash FROM refresh_tokens WHERE user_id = $1', [
      user.id,
    ]);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].token_hash).not.toBe(user.refreshToken);
    expect(rows[0].token_hash).toHaveLength(64); // SHA-256 hex
  });

  it('ends the session on logout', async () => {
    const user = await createTestUser({ role: 'student' });

    await api().post('/api/auth/logout').send({ refreshToken: user.refreshToken });
    const response = await api().post('/api/auth/refresh').send({ refreshToken: user.refreshToken });

    expect(response.status).toBe(401);
  });
});

describe('Password management', () => {
  it('changes a password when the current one is correct', async () => {
    const user = await createTestUser({ role: 'student', email: 'change@test.local' });

    const response = await authed(user.accessToken).post('/api/auth/change-password').send({
      currentPassword: TEST_PASSWORD,
      newPassword: 'BrandNew1',
      confirmPassword: 'BrandNew1',
    });

    expect(response.status).toBe(200);

    const login = await api()
      .post('/api/auth/login')
      .send({ email: 'change@test.local', password: 'BrandNew1' });
    expect(login.status).toBe(200);
  });

  it('refuses to change a password without the correct current one', async () => {
    const user = await createTestUser({ role: 'student' });

    const response = await authed(user.accessToken).post('/api/auth/change-password').send({
      currentPassword: 'WrongCurrent1',
      newPassword: 'BrandNew1',
      confirmPassword: 'BrandNew1',
    });

    expect(response.status).toBe(400);
  });

  it('revokes every session after a password change', async () => {
    const user = await createTestUser({ role: 'student' });

    await authed(user.accessToken).post('/api/auth/change-password').send({
      currentPassword: TEST_PASSWORD,
      newPassword: 'BrandNew1',
      confirmPassword: 'BrandNew1',
    });

    const refresh = await api()
      .post('/api/auth/refresh')
      .send({ refreshToken: user.refreshToken });

    expect(refresh.status).toBe(401);
  });

  it('answers identically whether or not the account exists', async () => {
    await createTestUser({ role: 'student', email: 'exists@test.local' });

    const known = await api().post('/api/auth/forgot-password').send({ email: 'exists@test.local' });
    const unknown = await api()
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@test.local' });

    expect(known.status).toBe(unknown.status);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it('resets a password with a valid token and rejects reuse', async () => {
    await createTestUser({ role: 'student', email: 'reset@test.local' });

    const request = await api()
      .post('/api/auth/forgot-password')
      .send({ email: 'reset@test.local' });

    const token = request.body.data.resetToken;
    expect(token).toBeTruthy();

    const first = await api().post('/api/auth/reset-password').send({
      token,
      password: 'ResetPass1',
      confirmPassword: 'ResetPass1',
    });
    expect(first.status).toBe(200);

    const login = await api()
      .post('/api/auth/login')
      .send({ email: 'reset@test.local', password: 'ResetPass1' });
    expect(login.status).toBe(200);

    // A reset link is single-use.
    const second = await api().post('/api/auth/reset-password').send({
      token,
      password: 'AnotherPass1',
      confirmPassword: 'AnotherPass1',
    });
    expect(second.status).toBe(400);
  });
});
