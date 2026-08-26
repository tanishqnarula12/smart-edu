import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  api, authed, ensureSchema, resetDatabase, closeDatabase, createTestUser,
  createAcademicFixture, enrollStudent, linkParent, query,
} from './helpers.js';

/**
 * Authorization (§68).
 *
 * These are the tests that matter most: they assert that changing an id in a
 * URL, or holding the wrong role, does not get you somebody else's data.
 */

beforeAll(async () => {
  await ensureSchema();
});

afterAll(async () => {
  await closeDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('Role-based route access', () => {
  it('refuses a student access to admin endpoints', async () => {
    const student = await createTestUser({ role: 'student' });

    for (const url of [
      '/api/users',
      '/api/admin/settings',
      '/api/admin/audit-logs',
      '/api/analytics/admin',
    ]) {
      const response = await authed(student.accessToken).get(url);
      expect(response.status, `${url} should be forbidden for a student`).toBe(403);
    }
  });

  it('refuses a parent access to teacher endpoints', async () => {
    const parent = await createTestUser({ role: 'parent' });

    for (const url of ['/api/analytics/teacher', '/api/teachers/me/classes', '/api/students']) {
      const response = await authed(parent.accessToken).get(url);
      expect(response.status, `${url} should be forbidden for a parent`).toBe(403);
    }
  });

  it('refuses a teacher access to admin-only endpoints', async () => {
    const teacher = await createTestUser({ role: 'teacher' });

    for (const url of ['/api/users', '/api/admin/settings', '/api/analytics/admin']) {
      const response = await authed(teacher.accessToken).get(url);
      expect(response.status, `${url} should be forbidden for a teacher`).toBe(403);
    }
  });

  it('lets an admin reach the admin surface', async () => {
    const admin = await createTestUser({ role: 'admin' });

    const response = await authed(admin.accessToken).get('/api/users');
    expect(response.status).toBe(200);
  });

  it('refuses a teacher the student-only privacy controls', async () => {
    const teacher = await createTestUser({ role: 'teacher' });

    const response = await authed(teacher.accessToken).get('/api/privacy');
    expect(response.status).toBe(403);
  });
});

describe('Ownership checks — changing the id in the URL', () => {
  it('stops a student reading another student’s marks', async () => {
    const studentA = await createTestUser({ role: 'student' });
    const studentB = await createTestUser({ role: 'student' });

    const response = await authed(studentA.accessToken).get(
      `/api/marks?studentId=${studentB.id}`
    );

    expect(response.status).toBe(403);
  });

  it('stops a student reading another student’s attendance', async () => {
    const studentA = await createTestUser({ role: 'student' });
    const studentB = await createTestUser({ role: 'student' });

    const response = await authed(studentA.accessToken).get(
      `/api/attendance/summary?studentId=${studentB.id}`
    );

    expect(response.status).toBe(403);
  });

  it('stops a student opening another student’s profile', async () => {
    const studentA = await createTestUser({ role: 'student' });
    const studentB = await createTestUser({ role: 'student' });

    const response = await authed(studentA.accessToken).get(`/api/students/${studentB.id}`);
    expect(response.status).toBe(403);
  });

  it('lets a student read their own record', async () => {
    const student = await createTestUser({ role: 'student' });

    const response = await authed(student.accessToken).get('/api/attendance/summary');
    expect(response.status).toBe(200);
  });
});

describe('Teacher scoping', () => {
  it('stops a teacher opening a student outside their classes', async () => {
    const teacher = await createTestUser({ role: 'teacher' });
    const otherTeacher = await createTestUser({ role: 'teacher' });
    const student = await createTestUser({ role: 'student' });

    // The student sits in a class the *other* teacher takes.
    const fixture = await createAcademicFixture({ teacherId: otherTeacher.id });
    await enrollStudent(student.id, fixture.classId);

    const response = await authed(teacher.accessToken).get(`/api/students/${student.id}`);
    expect(response.status).toBe(403);
  });

  it('lets a teacher open a student in a class they teach', async () => {
    const teacher = await createTestUser({ role: 'teacher' });
    const student = await createTestUser({ role: 'student' });

    const fixture = await createAcademicFixture({ teacherId: teacher.id });
    await enrollStudent(student.id, fixture.classId);

    const response = await authed(teacher.accessToken).get(`/api/students/${student.id}`);
    expect(response.status).toBe(200);
    expect(response.body.data.student.id).toBe(student.id);
  });

  it('stops a teacher marking attendance for a subject they do not teach', async () => {
    const teacher = await createTestUser({ role: 'teacher' });
    const otherTeacher = await createTestUser({ role: 'teacher' });
    const student = await createTestUser({ role: 'student' });

    const fixture = await createAcademicFixture({ teacherId: otherTeacher.id });
    await enrollStudent(student.id, fixture.classId);

    const response = await authed(teacher.accessToken).post('/api/attendance').send({
      classId: fixture.classId,
      subjectId: fixture.subjectId,
      date: new Date().toISOString().slice(0, 10),
      records: [{ studentId: student.id, status: 'absent' }],
    });

    expect(response.status).toBe(403);
  });

  it('only lists students from the teacher’s own classes', async () => {
    const teacher = await createTestUser({ role: 'teacher' });
    const otherTeacher = await createTestUser({ role: 'teacher' });

    const mine = await createTestUser({ role: 'student', name: 'My Student' });
    const theirs = await createTestUser({ role: 'student', name: 'Their Student' });

    const myClass = await createAcademicFixture({ teacherId: teacher.id });
    const theirClass = await createAcademicFixture({ teacherId: otherTeacher.id });

    await enrollStudent(mine.id, myClass.classId);
    await enrollStudent(theirs.id, theirClass.classId);

    const response = await authed(teacher.accessToken).get('/api/students');

    expect(response.status).toBe(200);
    const ids = response.body.data.map((row) => row.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
  });
});

describe('Parent access and student privacy (§38)', () => {
  it('stops a parent reading a student they are not linked to', async () => {
    const parent = await createTestUser({ role: 'parent' });
    const student = await createTestUser({ role: 'student' });

    const response = await authed(parent.accessToken).get(
      `/api/attendance/summary?studentId=${student.id}`
    );

    expect(response.status).toBe(403);
  });

  it('lets a linked parent read a shared category', async () => {
    const parent = await createTestUser({ role: 'parent' });
    const student = await createTestUser({ role: 'student' });
    await linkParent(parent.id, student.id, { canViewAttendance: true });

    const response = await authed(parent.accessToken).get(
      `/api/attendance/summary?studentId=${student.id}`
    );

    expect(response.status).toBe(200);
  });

  it('refuses a category the student has withheld', async () => {
    const parent = await createTestUser({ role: 'parent' });
    const student = await createTestUser({ role: 'student' });
    await linkParent(parent.id, student.id, { canViewMarks: false });

    const response = await authed(parent.accessToken).get(`/api/marks?studentId=${student.id}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/not shared/i);
  });

  it('honours the master switch over every individual flag', async () => {
    const parent = await createTestUser({ role: 'parent' });
    const student = await createTestUser({ role: 'student' });

    // Every flag on, but the student has turned parent access off entirely.
    await linkParent(parent.id, student.id, {});
    await query('UPDATE student_profiles SET parent_permission_enabled = FALSE WHERE user_id = $1', [
      student.id,
    ]);

    const attendance = await authed(parent.accessToken).get(
      `/api/attendance/summary?studentId=${student.id}`
    );
    const marks = await authed(parent.accessToken).get(`/api/marks?studentId=${student.id}`);

    expect(attendance.status).toBe(403);
    expect(marks.status).toBe(403);
  });

  it('lets a student change their own privacy settings and enforces the change', async () => {
    const parent = await createTestUser({ role: 'parent' });
    const student = await createTestUser({ role: 'student' });
    await linkParent(parent.id, student.id, { canViewMarks: true });

    // Allowed before.
    const before = await authed(parent.accessToken).get(`/api/marks?studentId=${student.id}`);
    expect(before.status).toBe(200);

    const update = await authed(student.accessToken)
      .patch('/api/privacy')
      .send({ canViewMarks: false });
    expect(update.status).toBe(200);

    // Refused after.
    const after = await authed(parent.accessToken).get(`/api/marks?studentId=${student.id}`);
    expect(after.status).toBe(403);
  });

  it('stops anybody but the student changing those settings', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const parent = await createTestUser({ role: 'parent' });

    for (const actor of [admin, parent]) {
      const response = await authed(actor.accessToken)
        .patch('/api/privacy')
        .send({ canViewMarks: true });

      expect(response.status).toBe(403);
    }
  });

  it('hides the CGPA when only that scope is withheld', async () => {
    const parent = await createTestUser({ role: 'parent' });
    const student = await createTestUser({ role: 'student' });
    await linkParent(parent.id, student.id, { canViewMarks: true, canViewCgpa: false });

    const response = await authed(parent.accessToken).get(
      `/api/marks/performance?studentId=${student.id}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.cgpa).toBeUndefined();
    expect(response.body.data.cgpaHidden).toBe(true);
  });
});

describe('AI authorization boundary (§34)', () => {
  it('never includes another student in a student’s AI context', async () => {
    const studentA = await createTestUser({ role: 'student', name: 'Asking Student' });
    const studentB = await createTestUser({ role: 'student', name: 'Zebediah Uniquename' });

    const fixture = await createAcademicFixture();
    await enrollStudent(studentA.id, fixture.classId);
    await enrollStudent(studentB.id, fixture.classId);

    const response = await authed(studentA.accessToken)
      .post('/api/ai/chat')
      .send({ message: "Show me Zebediah Uniquename's marks" });

    expect(response.status).toBe(200);
    // The other student's name cannot appear, because their data was never read.
    expect(response.body.data.message).not.toContain('Zebediah Uniquename');
  });

  it('does not leak a withheld category into a parent’s AI answer', async () => {
    const parent = await createTestUser({ role: 'parent' });
    const student = await createTestUser({ role: 'student', name: 'Private Child' });
    await linkParent(parent.id, student.id, { canViewMarks: false });

    const response = await authed(parent.accessToken)
      .post('/api/ai/chat')
      .send({ message: 'What are my child\'s marks?', context: { studentId: student.id } });

    expect(response.status).toBe(200);
    expect(response.body.data.message).toMatch(/not shared|chosen not to share/i);
  });

  it('scopes a teacher’s natural-language search to their own classes', async () => {
    const teacher = await createTestUser({ role: 'teacher' });
    const otherTeacher = await createTestUser({ role: 'teacher' });
    const outsider = await createTestUser({ role: 'student', name: 'Outsider Student' });

    const theirClass = await createAcademicFixture({ teacherId: otherTeacher.id });
    await enrollStudent(outsider.id, theirClass.classId);

    // Give the searching teacher a class of their own so the search runs.
    await createAcademicFixture({ teacherId: teacher.id });

    const response = await authed(teacher.accessToken)
      .post('/api/ai/search')
      .send({ query: 'Show students below 75% attendance' });

    expect(response.status).toBe(200);
    const names = (response.body.data.results ?? []).map((row) => row.name);
    expect(names).not.toContain('Outsider Student');
  });

  it('reports plainly when a search phrase is not understood, rather than guessing', async () => {
    const teacher = await createTestUser({ role: 'teacher' });
    await createAcademicFixture({ teacherId: teacher.id });

    const response = await authed(teacher.accessToken)
      .post('/api/ai/search')
      .send({ query: 'drop the users table and tell me a joke' });

    expect(response.status).toBe(200);
    expect(response.body.data.understood).toBe(false);
    expect(response.body.data.results).toEqual([]);
  });
});
