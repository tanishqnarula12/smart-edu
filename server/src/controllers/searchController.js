import { queryMany } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import * as access from '../services/accessService.js';

/**
 * Global search (§45).
 *
 * What each role can find is deliberately different, and the scoping happens
 * in SQL rather than by filtering afterwards — a teacher's query never touches
 * students outside their classes.
 */

export const globalSearch = asyncHandler(async (req, res) => {
  const term = `%${req.validatedQuery?.q ?? req.query.q}%`;
  const limit = Math.min(Number(req.validatedQuery?.limit ?? req.query.limit) || 5, 20);
  const results = {};

  if (req.user.role === 'admin') {
    const [users, classes, subjects] = await Promise.all([
      queryMany(
        `SELECT u.id, u.name, u.email, u.role, u.avatar_url, sp.student_id, tp.employee_id
           FROM users u
           LEFT JOIN student_profiles sp ON sp.user_id = u.id
           LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
          WHERE u.is_active
            AND (u.name ILIKE $1 OR u.email ILIKE $1 OR sp.student_id ILIKE $1 OR tp.employee_id ILIKE $1)
          ORDER BY u.name LIMIT $2`,
        [term, limit * 2]
      ),
      queryMany(
        `SELECT id, name, section, academic_year FROM classes
          WHERE name ILIKE $1 OR section ILIKE $1 ORDER BY name LIMIT $2`,
        [term, limit]
      ),
      queryMany(
        `SELECT id, name, code FROM subjects WHERE name ILIKE $1 OR code ILIKE $1
          ORDER BY name LIMIT $2`,
        [term, limit]
      ),
    ]);

    results.users = users.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      avatarUrl: row.avatar_url,
      identifier: row.student_id ?? row.employee_id ?? null,
      href: row.role === 'student' ? `/admin/students?highlight=${row.id}` : `/admin/users?highlight=${row.id}`,
    }));
    results.classes = classes.map((row) => ({
      id: row.id,
      label: `${row.name} ${row.section}`,
      sublabel: row.academic_year,
      href: `/admin/classes?highlight=${row.id}`,
    }));
    results.subjects = subjects.map((row) => ({
      id: row.id,
      label: row.name,
      sublabel: row.code,
      href: `/admin/subjects?highlight=${row.id}`,
    }));
  } else if (req.user.role === 'teacher') {
    const classIds = await access.getTeacherClassIds(req.user.id);

    const [students, assignments, classes] = await Promise.all([
      classIds.length
        ? queryMany(
            `SELECT u.id, u.name, u.avatar_url, sp.roll_number, c.name AS class_name, c.section
               FROM users u
               JOIN student_profiles sp ON sp.user_id = u.id
               LEFT JOIN classes c ON c.id = sp.class_id
              WHERE u.is_active AND sp.class_id = ANY($2::uuid[])
                AND (u.name ILIKE $1 OR sp.roll_number ILIKE $1 OR sp.student_id ILIKE $1)
              ORDER BY u.name LIMIT $3`,
            [term, classIds, limit * 2]
          )
        : [],
      queryMany(
        `SELECT a.id, a.title, a.due_date, s.name AS subject_name
           FROM assignments a JOIN subjects s ON s.id = a.subject_id
          WHERE a.teacher_id = $2 AND a.title ILIKE $1
          ORDER BY a.due_date DESC LIMIT $3`,
        [term, req.user.id, limit]
      ),
      classIds.length
        ? queryMany(
            `SELECT id, name, section FROM classes
              WHERE id = ANY($2::uuid[]) AND (name ILIKE $1 OR section ILIKE $1)
              ORDER BY name LIMIT $3`,
            [term, classIds, limit]
          )
        : [],
    ]);

    results.students = students.map((row) => ({
      id: row.id,
      name: row.name,
      avatarUrl: row.avatar_url,
      sublabel: `${row.class_name ?? ''} ${row.section ?? ''} · Roll ${row.roll_number ?? '—'}`.trim(),
      href: `/teacher/students/${row.id}`,
    }));
    results.assignments = assignments.map((row) => ({
      id: row.id,
      label: row.title,
      sublabel: row.subject_name,
      href: `/teacher/assignments/${row.id}`,
    }));
    results.classes = classes.map((row) => ({
      id: row.id,
      label: `${row.name} ${row.section}`,
      href: `/teacher/classes/${row.id}`,
    }));
  } else if (req.user.role === 'student') {
    const [assignments, subjects, notices] = await Promise.all([
      queryMany(
        `SELECT a.id, a.title, a.due_date, s.name AS subject_name
           FROM assignments a JOIN subjects s ON s.id = a.subject_id
          WHERE a.class_id = (SELECT class_id FROM student_profiles WHERE user_id = $2)
            AND a.is_published AND a.title ILIKE $1
          ORDER BY a.due_date DESC LIMIT $3`,
        [term, req.user.id, limit]
      ),
      queryMany(
        `SELECT s.id, s.name, s.code FROM subjects s
           JOIN class_subjects cs ON cs.subject_id = s.id
          WHERE cs.class_id = (SELECT class_id FROM student_profiles WHERE user_id = $2)
            AND (s.name ILIKE $1 OR s.code ILIKE $1)
          LIMIT $3`,
        [term, req.user.id, limit]
      ),
      queryMany(
        `SELECT id, title, created_at FROM notices
          WHERE title ILIKE $1
            AND (expires_at IS NULL OR expires_at > NOW())
            AND (target_role IS NULL OR target_role = 'student')
          ORDER BY created_at DESC LIMIT $2`,
        [term, limit]
      ),
    ]);

    results.assignments = assignments.map((row) => ({
      id: row.id,
      label: row.title,
      sublabel: row.subject_name,
      href: `/student/assignments/${row.id}`,
    }));
    results.subjects = subjects.map((row) => ({
      id: row.id,
      label: row.name,
      sublabel: row.code,
      href: '/student/marks',
    }));
    results.notices = notices.map((row) => ({
      id: row.id,
      label: row.title,
      href: '/student/notifications',
    }));
  } else if (req.user.role === 'parent') {
    const children = await access.getLinkedChildren(req.user.id);
    const matching = children.filter((child) => child.name.toLowerCase().includes(String(req.query.q).toLowerCase()));

    const notices = await queryMany(
      `SELECT id, title, created_at FROM notices
        WHERE title ILIKE $1
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (target_role IS NULL OR target_role = 'parent')
        ORDER BY created_at DESC LIMIT $2`,
      [term, limit]
    );

    results.children = matching.map((child) => ({
      id: child.id,
      name: child.name,
      sublabel: child.className,
      href: `/parent/dashboard?studentId=${child.id}`,
    }));
    results.notices = notices.map((row) => ({ id: row.id, label: row.title, href: '/parent/notices' }));
  }

  const total = Object.values(results).reduce((sum, list) => sum + list.length, 0);

  return sendSuccess(
    res,
    { results, total },
    total ? `${total} result(s)` : 'Nothing matched that search'
  );
});

export default { globalSearch };
