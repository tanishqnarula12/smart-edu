import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  authed, ensureSchema, resetDatabase, closeDatabase, createTestUser,
  createAcademicFixture, enrollStudent, query,
} from './helpers.js';
import { calculateCGPA, calculateRiskScore, detectTrend, percentageToGrade } from '../src/utils/grades.js';

/** Attendance, marks and assignments (§68). */

beforeAll(async () => {
  await ensureSchema();
});

afterAll(async () => {
  await closeDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

const today = () => new Date().toISOString().slice(0, 10);

async function academicSetup(studentCount = 3) {
  const teacher = await createTestUser({ role: 'teacher' });
  const fixture = await createAcademicFixture({ teacherId: teacher.id });

  const students = [];
  for (let index = 0; index < studentCount; index += 1) {
    const student = await createTestUser({ role: 'student', name: `Student ${index + 1}` });
    await enrollStudent(student.id, fixture.classId, `R${index + 1}`);
    students.push(student);
  }

  return { teacher, students, ...fixture };
}

describe('Attendance', () => {
  it('records a register for a class', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(3);

    const response = await authed(teacher.accessToken).post('/api/attendance').send({
      classId,
      subjectId,
      date: today(),
      records: [
        { studentId: students[0].id, status: 'present' },
        { studentId: students[1].id, status: 'absent' },
        { studentId: students[2].id, status: 'late' },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.data.present).toBe(1);
    expect(response.body.data.absent).toBe(1);
    expect(response.body.data.late).toBe(1);
  });

  it('updates rather than duplicating when the same date is submitted twice (§59)', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);

    const payload = {
      classId,
      subjectId,
      date: today(),
      records: [{ studentId: students[0].id, status: 'absent' }],
    };

    await authed(teacher.accessToken).post('/api/attendance').send(payload);
    const second = await authed(teacher.accessToken)
      .post('/api/attendance')
      .send({ ...payload, records: [{ studentId: students[0].id, status: 'present' }] });

    expect(second.status).toBe(200);

    const { rows } = await query(
      'SELECT status FROM attendance WHERE student_id = $1 AND subject_id = $2 AND date = $3',
      [students[0].id, subjectId, today()]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('present');
  });

  it('refuses a student who is not enrolled in the class', async () => {
    const { teacher, classId, subjectId } = await academicSetup(1);
    const outsider = await createTestUser({ role: 'student' });

    const response = await authed(teacher.accessToken).post('/api/attendance').send({
      classId,
      subjectId,
      date: today(),
      records: [{ studentId: outsider.id, status: 'present' }],
    });

    expect(response.status).toBe(400);
  });

  it('refuses a future date', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);

    const future = new Date();
    future.setDate(future.getDate() + 3);

    const response = await authed(teacher.accessToken).post('/api/attendance').send({
      classId,
      subjectId,
      date: future.toISOString().slice(0, 10),
      records: [{ studentId: students[0].id, status: 'present' }],
    });

    expect(response.status).toBe(422);
  });

  it('rejects an invalid status', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);

    const response = await authed(teacher.accessToken).post('/api/attendance').send({
      classId,
      subjectId,
      date: today(),
      records: [{ studentId: students[0].id, status: 'maybe' }],
    });

    expect(response.status).toBe(422);
  });

  it('computes the attendance percentage, counting late as attended', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);
    const student = students[0];

    // 4 records: present, present, late, absent → 75%
    const statuses = ['present', 'present', 'late', 'absent'];
    for (const [index, status] of statuses.entries()) {
      const date = new Date();
      date.setDate(date.getDate() - index);

      await authed(teacher.accessToken).post('/api/attendance').send({
        classId,
        subjectId,
        date: date.toISOString().slice(0, 10),
        records: [{ studentId: student.id, status }],
      });
    }

    const response = await authed(student.accessToken).get('/api/attendance/summary');

    expect(response.status).toBe(200);
    expect(response.body.data.summary.totalClasses).toBe(4);
    expect(response.body.data.summary.attendancePercentage).toBe(75);
    expect(response.body.data.summary.lateCount).toBe(1);
  });

  it('flags a student below the 75% threshold', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);
    const student = students[0];

    // 1 present of 3 → 33%
    for (const [index, status] of ['present', 'absent', 'absent'].entries()) {
      const date = new Date();
      date.setDate(date.getDate() - index);

      await authed(teacher.accessToken).post('/api/attendance').send({
        classId,
        subjectId,
        date: date.toISOString().slice(0, 10),
        records: [{ studentId: student.id, status }],
      });
    }

    const summary = await authed(student.accessToken).get('/api/attendance/summary');
    expect(summary.body.data.summary.isBelowThreshold).toBe(true);

    const low = await authed(teacher.accessToken).get('/api/attendance/low');
    const ids = low.body.data.students.map((row) => row.studentId);
    expect(ids).toContain(student.id);
  });
});

describe('Marks', () => {
  async function createAssessment(teacher, classId, subjectId, maxMarks = 50) {
    const response = await authed(teacher.accessToken).post('/api/marks/assessments').send({
      name: 'Unit Test 1',
      subjectId,
      classId,
      type: 'internal',
      maxMarks,
      date: today(),
    });
    return response.body.data;
  }

  it('creates an assessment and enters marks', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(2);
    const assessment = await createAssessment(teacher, classId, subjectId);

    const response = await authed(teacher.accessToken)
      .post(`/api/marks/assessments/${assessment.id}/marks`)
      .send({
        records: [
          { studentId: students[0].id, marksObtained: 42 },
          { studentId: students[1].id, marksObtained: 31 },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.saved).toBe(2);
  });

  it('rejects marks above the assessment maximum (§22)', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);
    const assessment = await createAssessment(teacher, classId, subjectId, 50);

    const response = await authed(teacher.accessToken)
      .post(`/api/marks/assessments/${assessment.id}/marks`)
      .send({ records: [{ studentId: students[0].id, marksObtained: 65 }] });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/between 0 and 50/);
  });

  it('rejects negative marks', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);
    const assessment = await createAssessment(teacher, classId, subjectId);

    const response = await authed(teacher.accessToken)
      .post(`/api/marks/assessments/${assessment.id}/marks`)
      .send({ records: [{ studentId: students[0].id, marksObtained: -5 }] });

    expect(response.status).toBe(422);
  });

  it('hides unpublished marks from the student', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);
    const assessment = await createAssessment(teacher, classId, subjectId);

    await authed(teacher.accessToken)
      .post(`/api/marks/assessments/${assessment.id}/marks`)
      .send({ records: [{ studentId: students[0].id, marksObtained: 40 }] });

    const response = await authed(students[0].accessToken).get('/api/marks');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });

  it('refuses to publish while any mark is missing', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(3);
    const assessment = await createAssessment(teacher, classId, subjectId);

    // Only one of three students has a mark.
    await authed(teacher.accessToken)
      .post(`/api/marks/assessments/${assessment.id}/marks`)
      .send({ records: [{ studentId: students[0].id, marksObtained: 40 }] });

    const response = await authed(teacher.accessToken).post(
      `/api/marks/assessments/${assessment.id}/publish`
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/missing/i);
  });

  it('publishes when the sheet is complete, and the student then sees it', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(2);
    const assessment = await createAssessment(teacher, classId, subjectId, 50);

    await authed(teacher.accessToken)
      .post(`/api/marks/assessments/${assessment.id}/marks`)
      .send({
        records: [
          { studentId: students[0].id, marksObtained: 45 },
          { studentId: students[1].id, marksObtained: 30 },
        ],
      });

    const publish = await authed(teacher.accessToken).post(
      `/api/marks/assessments/${assessment.id}/publish`
    );
    expect(publish.status).toBe(200);

    const marks = await authed(students[0].accessToken).get('/api/marks');
    expect(marks.body.data).toHaveLength(1);
    expect(marks.body.data[0].marksObtained).toBe(45);
    expect(marks.body.data[0].percentage).toBe(90);
    expect(marks.body.data[0].grade).toBe('O');
  });

  it('notifies students when marks are published', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);
    const assessment = await createAssessment(teacher, classId, subjectId);

    await authed(teacher.accessToken)
      .post(`/api/marks/assessments/${assessment.id}/marks`)
      .send({ records: [{ studentId: students[0].id, marksObtained: 40 }] });

    await authed(teacher.accessToken).post(`/api/marks/assessments/${assessment.id}/publish`);

    const { rows } = await query(
      "SELECT id FROM notifications WHERE user_id = $1 AND type = 'marks'",
      [students[0].id]
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('computes performance and rank once marks are published', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(2);
    const assessment = await createAssessment(teacher, classId, subjectId, 100);

    await authed(teacher.accessToken)
      .post(`/api/marks/assessments/${assessment.id}/marks`)
      .send({
        records: [
          { studentId: students[0].id, marksObtained: 90 },
          { studentId: students[1].id, marksObtained: 50 },
        ],
      });
    await authed(teacher.accessToken).post(`/api/marks/assessments/${assessment.id}/publish`);

    const response = await authed(students[0].accessToken).get('/api/marks/performance');

    expect(response.status).toBe(200);
    expect(response.body.data.overallAverage).toBe(90);
    expect(response.body.data.rank.rank).toBe(1);
    expect(response.body.data.rank.total).toBe(2);
    expect(response.body.data.cgpa).toBeGreaterThan(0);
  });
});

describe('Assignments', () => {
  async function createAssignment(teacher, classId, subjectId, daysFromNow = 7) {
    const due = new Date();
    due.setDate(due.getDate() + daysFromNow);

    const response = await authed(teacher.accessToken).post('/api/assignments').send({
      title: 'Test Assignment',
      description: 'Do the thing',
      subjectId,
      classId,
      dueDate: due.toISOString(),
      maxMarks: 20,
    });

    return response.body.data;
  }

  it('creates an assignment and notifies the class', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(2);
    const assignment = await createAssignment(teacher, classId, subjectId);

    expect(assignment.title).toBe('Test Assignment');

    const { rows } = await query(
      "SELECT id FROM notifications WHERE user_id = $1 AND type = 'assignment'",
      [students[0].id]
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('lets a student submit and marks it submitted', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);
    const assignment = await createAssignment(teacher, classId, subjectId);

    const response = await authed(students[0].accessToken)
      .post(`/api/assignments/${assignment.id}/submit`)
      .send({ content: 'Here is my answer.' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('submitted');
  });

  it('flags a submission made after the deadline as late', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);
    const assignment = await createAssignment(teacher, classId, subjectId, -2);

    const response = await authed(students[0].accessToken)
      .post(`/api/assignments/${assignment.id}/submit`)
      .send({ content: 'Sorry this is late.' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('late');
  });

  it('refuses an empty submission', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);
    const assignment = await createAssignment(teacher, classId, subjectId);

    const response = await authed(students[0].accessToken)
      .post(`/api/assignments/${assignment.id}/submit`)
      .send({ content: '   ' });

    expect(response.status).toBe(422);
  });

  it('refuses a submission from a student in another class', async () => {
    const { teacher, classId, subjectId } = await academicSetup(1);
    const assignment = await createAssignment(teacher, classId, subjectId);

    const outsider = await createTestUser({ role: 'student' });
    const otherClass = await createAcademicFixture();
    await enrollStudent(outsider.id, otherClass.classId);

    const response = await authed(outsider.accessToken)
      .post(`/api/assignments/${assignment.id}/submit`)
      .send({ content: 'Not my class' });

    expect(response.status).toBe(403);
  });

  it('grades a submission and notifies the student', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);
    const assignment = await createAssignment(teacher, classId, subjectId);

    await authed(students[0].accessToken)
      .post(`/api/assignments/${assignment.id}/submit`)
      .send({ content: 'My answer' });

    const submissions = await authed(teacher.accessToken).get(
      `/api/assignments/${assignment.id}/submissions`
    );
    const submissionId = submissions.body.data.submissions[0].submissionId;

    const response = await authed(teacher.accessToken)
      .post(`/api/submissions/${submissionId}/grade`)
      .send({ marks: 18, feedback: 'Strong work.' });

    expect(response.status).toBe(200);
    expect(response.body.data.marks).toBe(18);
    expect(response.body.data.status).toBe('graded');

    const student = await authed(students[0].accessToken).get(`/api/assignments/${assignment.id}`);
    expect(student.body.data.submission.marks).toBe(18);
    expect(student.body.data.submission.feedback).toBe('Strong work.');
  });

  it('rejects a grade above the assignment maximum', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);
    const assignment = await createAssignment(teacher, classId, subjectId);

    await authed(students[0].accessToken)
      .post(`/api/assignments/${assignment.id}/submit`)
      .send({ content: 'My answer' });

    const submissions = await authed(teacher.accessToken).get(
      `/api/assignments/${assignment.id}/submissions`
    );
    const submissionId = submissions.body.data.submissions[0].submissionId;

    const response = await authed(teacher.accessToken)
      .post(`/api/submissions/${submissionId}/grade`)
      .send({ marks: 45 });

    expect(response.status).toBe(400);
  });

  it('stops a teacher grading a submission from another teacher’s class', async () => {
    const { teacher, students, classId, subjectId } = await academicSetup(1);
    const assignment = await createAssignment(teacher, classId, subjectId);

    await authed(students[0].accessToken)
      .post(`/api/assignments/${assignment.id}/submit`)
      .send({ content: 'My answer' });

    const submissions = await authed(teacher.accessToken).get(
      `/api/assignments/${assignment.id}/submissions`
    );
    const submissionId = submissions.body.data.submissions[0].submissionId;

    const otherTeacher = await createTestUser({ role: 'teacher' });
    await createAcademicFixture({ teacherId: otherTeacher.id });

    const response = await authed(otherTeacher.accessToken)
      .post(`/api/submissions/${submissionId}/grade`)
      .send({ marks: 20 });

    expect(response.status).toBe(403);
  });
});

describe('Timetable conflict detection (§12)', () => {
  it('refuses to double-book a teacher', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const teacher = await createTestUser({ role: 'teacher' });

    const first = await createAcademicFixture({ teacherId: teacher.id });
    const second = await createAcademicFixture({ teacherId: teacher.id });

    const slot = {
      teacherId: teacher.id,
      day: 'monday',
      startTime: '09:00',
      endTime: '10:00',
      academicYear: '2025-26',
    };

    const created = await authed(admin.accessToken)
      .post('/api/timetable')
      .send({ ...slot, classId: first.classId, subjectId: first.subjectId });
    expect(created.status).toBe(201);

    // Same teacher, same time, different class — must be refused.
    const clash = await authed(admin.accessToken)
      .post('/api/timetable')
      .send({ ...slot, classId: second.classId, subjectId: second.subjectId });

    expect(clash.status).toBe(409);
  });

  it('refuses two lessons for the same class at the same time', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const teacherA = await createTestUser({ role: 'teacher' });
    const teacherB = await createTestUser({ role: 'teacher' });

    const fixture = await createAcademicFixture({ teacherId: teacherA.id });
    const otherSubject = await createAcademicFixture({ teacherId: teacherB.id });

    const base = { day: 'tuesday', startTime: '11:00', endTime: '12:00', academicYear: '2025-26' };

    await authed(admin.accessToken)
      .post('/api/timetable')
      .send({ ...base, classId: fixture.classId, subjectId: fixture.subjectId, teacherId: teacherA.id });

    const clash = await authed(admin.accessToken).post('/api/timetable').send({
      ...base,
      classId: fixture.classId,
      subjectId: otherSubject.subjectId,
      teacherId: teacherB.id,
    });

    expect(clash.status).toBe(409);
  });

  it('allows a non-overlapping slot', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const teacher = await createTestUser({ role: 'teacher' });
    const fixture = await createAcademicFixture({ teacherId: teacher.id });

    const base = {
      classId: fixture.classId,
      subjectId: fixture.subjectId,
      teacherId: teacher.id,
      day: 'wednesday',
      academicYear: '2025-26',
    };

    await authed(admin.accessToken)
      .post('/api/timetable')
      .send({ ...base, startTime: '09:00', endTime: '10:00' });

    const second = await authed(admin.accessToken)
      .post('/api/timetable')
      .send({ ...base, startTime: '10:00', endTime: '11:00' });

    expect(second.status).toBe(201);
  });
});

describe('Grade and risk calculations (§36)', () => {
  it('maps percentages to the documented grades', () => {
    expect(percentageToGrade(95).grade).toBe('O');
    expect(percentageToGrade(85).grade).toBe('A+');
    expect(percentageToGrade(72).grade).toBe('A');
    expect(percentageToGrade(45).grade).toBe('C');
    expect(percentageToGrade(20).grade).toBe('F');
  });

  it('weights the CGPA by credits', () => {
    const cgpa = calculateCGPA([
      { average_percentage: 95, credits: 4 }, // 10 points
      { average_percentage: 45, credits: 1 }, // 5 points
    ]);

    // (10×4 + 5×1) / 5 = 9
    expect(cgpa).toBe(9);
  });

  it('returns 0 when nothing is graded', () => {
    expect(calculateCGPA([])).toBe(0);
  });

  it('blends the risk score from three signals and explains itself', () => {
    const healthy = calculateRiskScore({
      attendancePercentage: 95,
      averagePercentage: 85,
      assignmentCompletionRate: 100,
    });
    expect(healthy.level).toBe('low');
    expect(healthy.factors).toHaveLength(0);

    const struggling = calculateRiskScore({
      attendancePercentage: 50,
      averagePercentage: 30,
      assignmentCompletionRate: 40,
    });
    expect(struggling.level).toBe('high');
    expect(struggling.factors.length).toBeGreaterThan(0);
    expect(struggling.disclaimer).toMatch(/not a validated predictive model/i);
  });

  it('detects a declining trend', () => {
    const declining = detectTrend([
      { percentage: 80 },
      { percentage: 78 },
      { percentage: 55 },
      { percentage: 50 },
    ]);

    expect(declining.direction).toBe('declining');
    expect(declining.change).toBeLessThan(0);

    const improving = detectTrend([
      { percentage: 50 },
      { percentage: 55 },
      { percentage: 75 },
      { percentage: 80 },
    ]);
    expect(improving.direction).toBe('improving');
  });
});
