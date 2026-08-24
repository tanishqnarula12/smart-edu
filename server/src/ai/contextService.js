import { queryMany, queryOne } from '../db/pool.js';
import * as access from '../services/accessService.js';
import * as analytics from '../services/analyticsService.js';
import * as marksService from '../services/marksService.js';
import * as attendanceService from '../services/attendanceService.js';
import * as assignmentService from '../services/assignmentService.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * AI context retrieval — the authorization layer that runs BEFORE anything
 * reaches a model (§34).
 *
 * The rule this module exists to enforce: **the AI can never see data the same
 * user could not fetch through the REST API.** Every builder here resolves
 * access through `accessService`, the same module the controllers use. A
 * student asking "show me another student's marks" gets a context block that
 * simply does not contain them — there is nothing to leak, because the
 * unauthorised rows were never read.
 *
 * Output shape:
 *   { role, subject, facts: [{ topic, text, flag?, subject? }], documents: [] }
 */

const pct = (value) => `${Number(value ?? 0).toFixed(1)}%`;

// ═══════════════════════════ STUDENT CONTEXT ══════════════════════════════

async function buildStudentFacts(studentId, { includeIdentity = true } = {}) {
  const facts = [];

  const [profile, attendance, subjects, performance, rank, assignments, exams, timetable] =
    await Promise.all([
      queryOne(
        `SELECT u.name, sp.roll_number, sp.student_id, c.name AS class_name, c.section
           FROM users u
           JOIN student_profiles sp ON sp.user_id = u.id
           LEFT JOIN classes c ON c.id = sp.class_id
          WHERE u.id = $1`,
        [studentId]
      ),
      attendanceService.getStudentSummary(studentId),
      attendanceService.getStudentSubjectBreakdown(studentId),
      marksService.getStudentPerformance(studentId),
      marksService.getClassRank(studentId),
      assignmentService.getStudentAssignments(studentId, { limit: 60 }),
      queryMany(
        `SELECT e.name, e.exam_date, s.name AS subject_name, (e.exam_date - CURRENT_DATE) AS days_away
           FROM exams e JOIN subjects s ON s.id = e.subject_id
          WHERE e.class_id = (SELECT class_id FROM student_profiles WHERE user_id = $1)
            AND e.exam_date >= CURRENT_DATE
          ORDER BY e.exam_date LIMIT 5`,
        [studentId]
      ),
      queryMany(
        `SELECT t.day, t.start_time, t.end_time, s.name AS subject_name
           FROM timetable t JOIN subjects s ON s.id = t.subject_id
          WHERE t.class_id = (SELECT class_id FROM student_profiles WHERE user_id = $1)
          ORDER BY t.day, t.start_time LIMIT 40`,
        [studentId]
      ),
    ]);

  if (includeIdentity && profile) {
    facts.push({
      topic: 'identity',
      text: `Student ${profile.name}${profile.class_name ? ` is in class ${profile.class_name} ${profile.section}` : ''}${
        profile.roll_number ? `, roll number ${profile.roll_number}` : ''
      }.`,
    });
  }

  // Attendance
  if (attendance.totalClasses > 0) {
    facts.push({
      topic: 'attendance',
      text: `Overall attendance is ${pct(attendance.attendancePercentage)} (${attendance.presentCount} present, ${attendance.absentCount} absent, ${attendance.lateCount} late across ${attendance.totalClasses} classes). The requirement is ${attendance.threshold}%.`,
      flag: attendance.isBelowThreshold ? 'low' : 'ok',
    });

    const lowSubjects = subjects.filter((subject) => subject.isBelowThreshold);
    if (lowSubjects.length) {
      facts.push({
        topic: 'attendance',
        text: `Attendance is below the threshold in: ${lowSubjects
          .map((s) => `${s.subjectName} (${pct(s.attendancePercentage)})`)
          .join(', ')}.`,
        flag: 'low',
      });
    }
    const best = subjects[subjects.length - 1];
    if (best) {
      facts.push({
        topic: 'attendance',
        text: `Best attendance is in ${best.subjectName} at ${pct(best.attendancePercentage)}.`,
      });
    }
  } else {
    facts.push({ topic: 'attendance', text: 'No attendance has been recorded yet.' });
  }

  // Performance
  if (performance.subjectCount > 0) {
    facts.push({
      topic: 'performance',
      text: `Current CGPA is ${performance.cgpa} on a 10-point scale, with an overall average of ${pct(performance.overallAverage)} (grade ${performance.grade.grade}).`,
    });

    if (performance.strongest) {
      facts.push({
        topic: 'performance',
        text: `Strongest subject is ${performance.strongest.name} at ${pct(performance.strongest.average)}.`,
        subject: performance.strongest.name,
        flag: 'strong',
      });
    }
    if (performance.weakest && performance.weakest.name !== performance.strongest?.name) {
      facts.push({
        topic: 'performance',
        text: `Weakest subject is ${performance.weakest.name} at ${pct(performance.weakest.average)}.`,
        subject: performance.weakest.name,
        flag: performance.weakest.average < 50 ? 'weak' : 'ok',
      });
    }

    for (const subject of performance.subjects.slice(0, 8)) {
      const comparison =
        subject.classAverage != null
          ? ` (class average ${pct(subject.classAverage)})`
          : '';
      facts.push({
        topic: 'performance',
        text: `${subject.subjectName}: average ${pct(subject.averagePercentage)}, grade ${subject.grade}${comparison}.`,
        subject: subject.subjectName,
      });
    }

    if (rank.rank) {
      facts.push({
        topic: 'performance',
        text: `Class rank is ${rank.rank} of ${rank.total} (${rank.percentile} percentile).`,
      });
    }
  } else {
    facts.push({ topic: 'performance', text: 'No published assessment results yet.' });
  }

  // Assignments
  const pending = assignments.assignments.filter((row) =>
    ['pending', 'overdue'].includes(row.derived_status)
  );
  const overdue = assignments.assignments.filter((row) => row.derived_status === 'overdue');

  facts.push({
    topic: 'assignments',
    text: `${pending.length} assignment(s) outstanding, of which ${overdue.length} are past the deadline. ${
      assignments.assignments.filter((r) => r.derived_status === 'graded').length
    } have been graded.`,
    flag: pending.length > 0 ? 'pending' : 'ok',
  });

  for (const assignment of pending.slice(0, 5)) {
    facts.push({
      topic: 'assignments',
      text: `Outstanding: "${assignment.title}" (${assignment.subject_name}) due ${new Date(
        assignment.due_date
      ).toLocaleDateString()}.`,
      flag: 'pending',
    });
  }

  // Exams and schedule
  for (const exam of exams) {
    facts.push({
      topic: 'schedule',
      text: `Upcoming exam: ${exam.name} (${exam.subject_name}) on ${exam.exam_date}, ${exam.days_away} day(s) away.`,
    });
  }

  const byDay = timetable.reduce((acc, row) => {
    (acc[row.day] ??= []).push(`${row.subject_name} ${row.start_time.slice(0, 5)}`);
    return acc;
  }, {});
  for (const [day, entries] of Object.entries(byDay)) {
    facts.push({ topic: 'schedule', text: `${day}: ${entries.join(', ')}.` });
  }

  return facts;
}

// ═══════════════════════════ AGENT CONTEXTS ═══════════════════════════════

/** Context for a student asking about themselves — never anyone else. */
export async function buildStudentContext(user) {
  const facts = await buildStudentFacts(user.id, { includeIdentity: false });
  return { role: 'student', subject: 'your own academic record', facts, documents: [] };
}

/**
 * Context for a parent about one child.
 * Each category is fetched only if the student has shared it; a withheld
 * category becomes an explicit "not shared" fact so the assistant can say so
 * rather than inventing a number.
 */
export async function buildParentContext(user, studentId) {
  const children = await access.getLinkedChildren(user.id);
  const child = studentId ? children.find((c) => c.id === studentId) : children[0];

  if (!child) {
    return {
      role: 'parent',
      subject: 'your children',
      facts: [
        {
          topic: 'identity',
          text: 'No children are currently linked to this parent account.',
        },
      ],
      documents: [],
    };
  }

  const facts = [
    {
      topic: 'identity',
      text: `You are asking about your child ${child.name}${child.className ? `, class ${child.className}` : ''}.`,
    },
  ];

  if (!child.privacyEnabled) {
    facts.push({
      topic: 'privacy',
      text: `${child.name} has turned off parent access to their academic records, so no attendance, marks or assignment data is available.`,
    });
    return { role: 'parent', subject: child.name, facts, documents: [], child };
  }

  const { permissions } = child;

  if (permissions.attendance) {
    const [summary, subjects] = await Promise.all([
      attendanceService.getStudentSummary(child.id),
      attendanceService.getStudentSubjectBreakdown(child.id),
    ]);

    if (summary.totalClasses) {
      facts.push({
        topic: 'attendance',
        text: `${child.name}'s attendance is ${pct(summary.attendancePercentage)} (${summary.absentCount} absences across ${summary.totalClasses} classes). The requirement is ${summary.threshold}%.`,
        flag: summary.isBelowThreshold ? 'low' : 'ok',
      });

      const low = subjects.filter((s) => s.isBelowThreshold);
      if (low.length) {
        facts.push({
          topic: 'attendance',
          text: `Below the threshold in: ${low.map((s) => `${s.subjectName} (${pct(s.attendancePercentage)})`).join(', ')}.`,
          flag: 'low',
        });
      }
    } else {
      facts.push({ topic: 'attendance', text: 'No attendance has been recorded yet.' });
    }
  } else {
    facts.push({
      topic: 'attendance',
      text: `${child.name} has chosen not to share attendance records with you.`,
      flag: 'restricted',
    });
  }

  if (permissions.marks) {
    const performance = await marksService.getStudentPerformance(child.id);

    if (performance.subjectCount) {
      const cgpaText = permissions.cgpa ? ` CGPA is ${performance.cgpa}.` : '';
      facts.push({
        topic: 'performance',
        text: `Overall average is ${pct(performance.overallAverage)} across ${performance.subjectCount} subjects.${cgpaText}`,
      });

      for (const subject of performance.subjects.slice(0, 8)) {
        facts.push({
          topic: 'performance',
          text: `${subject.subjectName}: ${pct(subject.averagePercentage)}${
            subject.classAverage != null ? ` versus a class average of ${pct(subject.classAverage)}` : ''
          }.`,
          subject: subject.subjectName,
          flag: subject.averagePercentage < 50 ? 'weak' : 'ok',
        });
      }

      if (performance.weakest) {
        facts.push({
          topic: 'improvement',
          text: `The subject needing the most support is ${performance.weakest.name} at ${pct(performance.weakest.average)}.`,
          subject: performance.weakest.name,
          flag: 'weak',
        });
      }
    } else {
      facts.push({ topic: 'performance', text: 'No published results yet.' });
    }
  } else {
    facts.push({
      topic: 'performance',
      text: `${child.name} has chosen not to share marks with you.`,
      flag: 'restricted',
    });
  }

  if (permissions.assignments) {
    const { assignments } = await assignmentService.getStudentAssignments(child.id, { limit: 50 });
    const pending = assignments.filter((row) => ['pending', 'overdue'].includes(row.derived_status));

    facts.push({
      topic: 'assignments',
      text: `${pending.length} assignment(s) outstanding out of ${assignments.length} set this term.`,
      flag: pending.length ? 'pending' : 'ok',
    });

    for (const assignment of pending.slice(0, 4)) {
      facts.push({
        topic: 'assignments',
        text: `Outstanding: "${assignment.title}" (${assignment.subject_name}) due ${new Date(
          assignment.due_date
        ).toLocaleDateString()}.`,
        flag: 'pending',
      });
    }
  } else {
    facts.push({
      topic: 'assignments',
      text: `${child.name} has chosen not to share assignment information with you.`,
      flag: 'restricted',
    });
  }

  return { role: 'parent', subject: child.name, facts, documents: [], child };
}

/** Context for a teacher — limited to the classes they actually teach. */
export async function buildTeacherContext(user, { classId = null } = {}) {
  const classIds = await access.getTeacherClassIds(user.id);

  if (!classIds.length) {
    return {
      role: 'teacher',
      subject: 'your classes',
      facts: [{ topic: 'identity', text: 'No classes are currently assigned to this teacher account.' }],
      documents: [],
    };
  }

  // If a class was named, confirm the teacher actually teaches it.
  const scoped = classId ? (classIds.includes(classId) ? [classId] : null) : classIds;
  if (!scoped) throw ApiError.forbidden('That class is not assigned to you');

  const [overview, lowAttendance, declining, risk, assignments, classes] = await Promise.all([
    analytics.getTeacherOverview(user.id),
    attendanceService.getLowAttendanceStudents({ classIds: scoped, limit: 15 }),
    marksService.getDecliningStudents({ classIds: scoped, limit: 10 }),
    analytics.getRiskRegister({ classIds: scoped, limit: 15 }),
    assignmentService.getCompletionStats({ classIds: scoped }),
    queryMany(
      `SELECT c.name, c.section,
              (SELECT COUNT(*) FROM student_profiles sp WHERE sp.class_id = c.id)::int AS student_count
         FROM classes c WHERE c.id = ANY($1::uuid[]) ORDER BY c.name`,
      [scoped]
    ),
  ]);

  const facts = [
    {
      topic: 'identity',
      text: `You teach ${overview.totalClasses} class(es) covering ${overview.totalStudents} students across ${overview.totalSubjects} subject(s).`,
    },
    {
      topic: 'attendance',
      text: `Average attendance across your classes is ${pct(overview.averageAttendance)}; ${lowAttendance.length} student(s) are below 75%.`,
      flag: lowAttendance.length ? 'low' : 'ok',
    },
    {
      topic: 'performance',
      text: `Average assessment score across your classes is ${pct(overview.averageMarks)}.`,
    },
    {
      topic: 'assignments',
      text: `${overview.activeAssignments} assignment(s) are open and ${overview.ungradedSubmissions} submission(s) await grading. Completion rate is ${pct(assignments.completionRate)}.`,
      flag: overview.ungradedSubmissions ? 'pending' : 'ok',
    },
  ];

  for (const row of classes) {
    facts.push({
      topic: 'identity',
      text: `Class ${row.name} ${row.section} has ${row.student_count} students.`,
    });
  }

  for (const student of lowAttendance.slice(0, 8)) {
    facts.push({
      topic: 'attendance',
      text: `${student.name} (${student.class_name} ${student.section}, roll ${student.roll_number ?? '—'}) is at ${pct(student.attendance_percentage)} attendance with ${student.absent_count} absences.`,
      flag: 'low',
    });
  }

  for (const student of declining.slice(0, 6)) {
    facts.push({
      topic: 'performance',
      text: `${student.name} has declined in ${student.subjectName}: ${pct(student.previousScore)} → ${pct(student.currentScore)} (${student.change > 0 ? '+' : ''}${student.change} points, ${student.riskLevel} risk).`,
      subject: student.subjectName,
      flag: 'weak',
    });
  }

  facts.push({
    topic: 'risk',
    text: `Risk distribution across your students: ${risk.distribution.high} high, ${risk.distribution.medium} medium, ${risk.distribution.low} low.`,
  });

  return { role: 'teacher', subject: 'your classes', facts, documents: [] };
}

/** Context for an admin — institution-wide. */
export async function buildAdminContext() {
  const [overview, trend, subjects, classes, departments, risk] = await Promise.all([
    analytics.getInstitutionOverview(),
    analytics.getAttendanceTrend(6),
    analytics.getSubjectPerformance({ limit: 10 }),
    analytics.getClassComparison(),
    analytics.getDepartmentAttendance(),
    analytics.getRiskRegister({ limit: 20 }),
  ]);

  const facts = [
    {
      topic: 'identity',
      text: `The institution has ${overview.counts.students} students, ${overview.counts.teachers} teachers, ${overview.counts.parents} parents, ${overview.counts.classes} classes and ${overview.counts.subjects} subjects.`,
    },
    {
      topic: 'attendance',
      text: `Institution-wide attendance averages ${pct(overview.attendance.average)}; ${overview.attendance.belowThreshold} student(s) sit below the ${overview.attendance.threshold}% threshold.`,
      flag: overview.attendance.belowThreshold ? 'low' : 'ok',
    },
    {
      topic: 'performance',
      text: `Average academic performance is ${pct(overview.performance.average)} (grade ${overview.performance.grade.grade}).`,
    },
    {
      topic: 'assignments',
      text: `Assignment completion is ${pct(overview.assignments.completionRate)} with ${overview.assignments.pending} outstanding submissions.`,
    },
    {
      topic: 'risk',
      text: `Risk register: ${risk.distribution.high} high risk, ${risk.distribution.medium} medium, ${risk.distribution.low} low, out of ${risk.total} students assessed.`,
    },
    {
      topic: 'engagement',
      text: `${overview.counts.pending_complaints} complaint(s) and ${overview.counts.pending_leave} leave request(s) are awaiting action.`,
    },
  ];

  for (const month of trend) {
    facts.push({ topic: 'attendance', text: `${month.label}: attendance ${pct(month.percentage)} across ${month.total} records.` });
  }

  for (const subject of subjects.slice(0, 6)) {
    facts.push({
      topic: 'performance',
      text: `${subject.subject_name}: average ${pct(subject.average_percentage)}, pass rate ${pct(subject.pass_rate)}.`,
      subject: subject.subject_name,
    });
  }

  for (const row of classes.slice(0, 8)) {
    if (row.average_percentage == null) continue;
    facts.push({
      topic: 'performance',
      text: `Class ${row.class_name} ${row.section}: average ${pct(row.average_percentage)}, attendance ${pct(row.average_attendance)}.`,
    });
  }

  for (const dept of departments) {
    if (dept.average_attendance == null) continue;
    facts.push({
      topic: 'attendance',
      text: `Department ${dept.department_name}: ${dept.student_count} students, attendance ${pct(dept.average_attendance)}.`,
    });
  }

  return { role: 'admin', subject: 'the institution', facts, documents: [] };
}

/**
 * The single entry point agents use. Dispatches on role, so there is exactly
 * one place where "who is asking" maps to "what may be read".
 */
export async function buildContext(user, options = {}) {
  switch (user.role) {
    case 'student':
      return buildStudentContext(user);
    case 'parent':
      return buildParentContext(user, options.studentId);
    case 'teacher':
      return buildTeacherContext(user, options);
    case 'admin':
      return buildAdminContext();
    default:
      throw ApiError.forbidden('This role cannot use the AI assistant');
  }
}

export default {
  buildContext,
  buildStudentContext,
  buildParentContext,
  buildTeacherContext,
  buildAdminContext,
};
