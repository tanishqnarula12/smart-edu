import { queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import * as access from '../services/accessService.js';
import * as marksService from '../services/marksService.js';
import * as attendanceService from '../services/attendanceService.js';
import * as assignmentService from '../services/assignmentService.js';

/**
 * Parent-facing endpoints (§17).
 *
 * Every panel is assembled scope by scope. When a student has withheld a
 * category the field comes back as `null` alongside an explicit reason, so the
 * dashboard can say "your child has not shared this" instead of showing a
 * broken or, worse, a misleading zero.
 */

/** GET /api/parents/children — the child selector. */
export const listChildren = asyncHandler(async (req, res) => {
  const children = await access.getLinkedChildren(req.user.id);
  return sendSuccess(res, children, children.length ? 'Your children' : 'No children linked yet');
});

/** GET /api/parents/dashboard — everything for one child, privacy-filtered. */
export const getDashboard = asyncHandler(async (req, res) => {
  const children = await access.getLinkedChildren(req.user.id);
  if (!children.length) {
    return sendSuccess(
      res,
      { children: [], selectedChild: null },
      'No children are linked to your account yet. Ask your administrator to link them.'
    );
  }

  const requestedId = req.query.studentId;
  const child = requestedId ? children.find((c) => c.id === requestedId) : children[0];
  if (!child) throw ApiError.forbidden('That student is not linked to your account');

  const { permissions } = child;

  // Only fetch what the parent is allowed to see — unauthorised data is never
  // loaded, not merely hidden after the fact.
  const [attendance, subjectAttendance, monthlyTrend, performance, trend, rank, assignments] =
    await Promise.all([
      permissions.attendance ? attendanceService.getStudentSummary(child.id) : null,
      permissions.attendance ? attendanceService.getStudentSubjectBreakdown(child.id) : null,
      permissions.attendance ? attendanceService.getMonthlyTrend(child.id, 6) : null,
      permissions.marks ? marksService.getStudentPerformance(child.id) : null,
      permissions.marks ? marksService.getPerformanceTrend(child.id, 10) : null,
      permissions.cgpa ? marksService.getClassRank(child.id) : null,
      permissions.assignments
        ? assignmentService.getStudentAssignments(child.id, { limit: 50 })
        : null,
    ]);

  const performancePayload = performance ? { ...performance, trend, rank } : null;
  if (performancePayload && !permissions.cgpa) {
    delete performancePayload.cgpa;
    performancePayload.cgpaHidden = true;
  }

  const upcomingExams = permissions.marks
    ? await queryMany(
        `SELECT e.id, e.name, e.exam_date, e.start_time, e.room, s.name AS subject_name,
                (e.exam_date - CURRENT_DATE) AS days_away
           FROM exams e
           JOIN subjects s ON s.id = e.subject_id
          WHERE e.class_id = (SELECT class_id FROM student_profiles WHERE user_id = $1)
            AND e.exam_date >= CURRENT_DATE
          ORDER BY e.exam_date LIMIT 5`,
        [child.id]
      )
    : [];

  const assignmentSummary = assignments
    ? {
        pending: assignments.assignments.filter((row) =>
          ['pending', 'overdue'].includes(row.derived_status)
        ).length,
        submitted: assignments.assignments.filter((row) => row.derived_status === 'submitted').length,
        graded: assignments.assignments.filter((row) => row.derived_status === 'graded').length,
        recent: assignments.assignments.slice(0, 5).map((row) => ({
          id: row.id,
          title: row.title,
          subjectName: row.subject_name,
          dueDate: row.due_date,
          status: row.derived_status,
          marks: row.marks,
        })),
      }
    : null;

  // A parent's notices are the ones aimed at their child's class or at parents.
  const notices = await queryMany(
    `SELECT n.id, n.title, n.content, n.priority, n.category, n.created_at, u.name AS author_name
       FROM notices n
       LEFT JOIN users u ON u.id = n.created_by
      WHERE (n.expires_at IS NULL OR n.expires_at > NOW())
        AND (n.target_role IS NULL OR n.target_role = 'parent')
        AND (n.class_id IS NULL OR n.class_id = $1)
      ORDER BY n.is_pinned DESC, n.created_at DESC
      LIMIT 5`,
    [child.classId]
  );

  const restrictions = Object.entries(permissions)
    .filter(([, allowed]) => !allowed)
    .map(([scope]) => scope);

  return sendSuccess(
    res,
    {
      children,
      selectedChild: child,
      permissions,
      restrictions,
      privacyNote: child.privacyEnabled
        ? restrictions.length
          ? `${child.name} has chosen not to share: ${restrictions.join(', ')}.`
          : null
        : `${child.name} has turned off parent access to their academic records.`,
      kpis: {
        attendancePercentage: attendance?.attendancePercentage ?? null,
        attendanceBelowThreshold: attendance?.isBelowThreshold ?? null,
        cgpa: permissions.cgpa ? (performance?.cgpa ?? null) : null,
        overallAverage: performance?.overallAverage ?? null,
        pendingAssignments: assignmentSummary?.pending ?? null,
        classRank: rank?.rank ?? null,
        classSize: rank?.total ?? null,
      },
      attendance: attendance
        ? { summary: attendance, subjects: subjectAttendance, monthlyTrend }
        : null,
      performance: performancePayload,
      assignments: assignmentSummary,
      upcomingExams,
      notices,
    },
    'Parent dashboard'
  );
});

/**
 * GET /api/parents/children/:studentId/:section
 * Detail pages (attendance, marks, assignments, performance) share one shape.
 */
export const getChildSection = asyncHandler(async (req, res) => {
  const { studentId, section } = req.params;

  const scopeForSection = {
    attendance: 'attendance',
    marks: 'marks',
    assignments: 'assignments',
    performance: 'reports',
  }[section];

  if (!scopeForSection) throw ApiError.badRequest(`Unknown section: ${section}`);
  await access.assertParentCanView(req.user.id, studentId, scopeForSection);

  switch (section) {
    case 'attendance': {
      const [summary, subjects, monthlyTrend, records] = await Promise.all([
        attendanceService.getStudentSummary(studentId),
        attendanceService.getStudentSubjectBreakdown(studentId),
        attendanceService.getMonthlyTrend(studentId, 12),
        attendanceService.getStudentRecords(studentId, { limit: 60 }),
      ]);
      return sendSuccess(res, { summary, subjects, monthlyTrend, records: records.records }, 'Attendance');
    }

    case 'marks': {
      const marks = await marksService.getStudentMarks(studentId, { limit: 100 });
      return sendSuccess(res, marks, 'Marks');
    }

    case 'assignments': {
      const { assignments } = await assignmentService.getStudentAssignments(studentId, { limit: 100 });
      return sendSuccess(
        res,
        assignments.map((row) => ({
          id: row.id,
          title: row.title,
          subjectName: row.subject_name,
          teacherName: row.teacher_name,
          dueDate: row.due_date,
          maxMarks: row.max_marks,
          status: row.derived_status,
          submittedAt: row.submitted_at,
          marks: row.marks,
          feedback: row.feedback,
        })),
        'Assignments'
      );
    }

    case 'performance': {
      const cgpaAllowed = (await access.parentCanView(req.user.id, studentId, 'cgpa')).allowed;
      const [performance, trend, rank] = await Promise.all([
        marksService.getStudentPerformance(studentId),
        marksService.getPerformanceTrend(studentId, 12),
        cgpaAllowed ? marksService.getClassRank(studentId) : null,
      ]);

      const payload = { ...performance, trend, rank };
      if (!cgpaAllowed) {
        delete payload.cgpa;
        payload.cgpaHidden = true;
      }
      return sendSuccess(res, payload, 'Performance');
    }

    default:
      throw ApiError.badRequest('Unknown section');
  }
});

export default { listChildren, getDashboard, getChildSection };
