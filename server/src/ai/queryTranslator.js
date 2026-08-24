import { queryMany } from '../db/pool.js';
import * as access from '../services/accessService.js';
import { config } from '../config/env.js';

/**
 * Natural-language student search (§26).
 *
 * ── The security rule this module exists to enforce ──────────────────────
 * AI-generated SQL is NEVER executed. Not sanitised, not validated, not
 * parameterised — never executed at all.
 *
 * Instead, natural language is parsed into a small closed set of *intents*
 * with numeric arguments. Those intents map to a fixed catalogue of
 * hand-written, parameterised queries (QUERY_BUILDERS below). The only thing
 * the language layer can influence is which pre-written query runs and what
 * numbers go into its bound parameters.
 *
 * If a phrase matches no intent, the answer is "I couldn't interpret that",
 * not a generated query. That is the whole design: the failure mode is a
 * useless answer, never an unsafe one.
 */

// ───────────────────────── INTENT DEFINITIONS ─────────────────────────────

const INTENTS = [
  {
    name: 'low_attendance',
    description: 'Students below an attendance percentage',
    patterns: [
      /below\s+(\d+)\s*%?\s*(?:attendance|attendence)/i,
      /attendance\s+(?:below|under|less than)\s+(\d+)/i,
      /(?:low|poor|bad)\s+attendance/i,
      /(?:missing|skipping)\s+(?:classes|class|lectures)/i,
      /absent\s+(?:a lot|frequently|often)/i,
    ],
    extract: (match) => ({ threshold: Number(match?.[1]) || config.academic.attendanceThreshold }),
  },
  {
    name: 'struggling_in_subject',
    description: 'Students performing poorly, optionally in one subject',
    patterns: [
      /struggling\s+(?:in|with)\s+([a-z\s&]+?)(?:\?|$|\.)/i,
      /(?:weak|poor|failing|bad)\s+(?:in|at)\s+([a-z\s&]+?)(?:\?|$|\.)/i,
      /(?:who|which students?)\s+(?:is|are)\s+struggling/i,
      /failing\s+students?/i,
      /(?:low|poor)\s+(?:marks|scores|grades|performance)/i,
    ],
    extract: (match) => ({ subjectName: match?.[1]?.trim() || null, threshold: 50 }),
  },
  {
    name: 'marks_dropped',
    description: 'Students whose scores declined by more than N points',
    patterns: [
      /(?:marks|scores|grades|results)\s+(?:dropped|fell|declined|decreased)\s+(?:by\s+)?(?:more than\s+)?(\d+)/i,
      /(?:dropped|declined|fell)\s+(?:by\s+)?(?:more than\s+)?(\d+)\s*%?/i,
      /(?:declining|falling|worsening)\s+(?:marks|performance|grades|results)/i,
      /getting\s+worse/i,
    ],
    extract: (match) => ({ minDrop: Number(match?.[1]) || 10 }),
  },
  {
    name: 'pending_assignments',
    description: 'Students with outstanding assignment submissions',
    patterns: [
      /(?:pending|outstanding|missing|unsubmitted|incomplete)\s+assignments?/i,
      /(?:has|have|who has|who have)(?:n't| not)?\s+submitted/i,
      /not\s+(?:submitted|handed in|turned in)/i,
      /late\s+submissions?/i,
    ],
    extract: () => ({}),
  },
  {
    name: 'top_performers',
    description: 'Highest-scoring students',
    patterns: [
      /(?:top|best|highest|strongest)\s+(?:performing\s+)?students?/i,
      /(?:top|best)\s+(\d+)/i,
      /(?:doing|performing)\s+(?:well|best|great)/i,
      /(?:high|good)\s+(?:achievers|performers)/i,
    ],
    extract: (match) => ({ limit: Number(match?.[1]) || 10 }),
  },
  {
    name: 'at_risk',
    description: 'Students flagged by the academic risk indicator',
    patterns: [
      /at[\s-]?risk/i,
      /(?:need|needs|requiring|require)\s+(?:attention|help|support|intervention)/i,
      /(?:worried|concerned)\s+about/i,
      /red\s+flags?/i,
    ],
    extract: () => ({}),
  },
  {
    name: 'perfect_attendance',
    description: 'Students with excellent attendance',
    patterns: [
      /(?:perfect|full|excellent|100%?)\s+attendance/i,
      /never\s+(?:absent|missed)/i,
      /attendance\s+(?:above|over|greater than)\s+(\d+)/i,
    ],
    extract: (match) => ({ threshold: Number(match?.[1]) || 95 }),
  },
];

/**
 * Parse a phrase into an intent. Returns `null` when nothing matches —
 * deliberately, so the caller reports that rather than improvising.
 */
export function parseIntent(text) {
  const input = String(text ?? '').trim();

  for (const intent of INTENTS) {
    for (const pattern of intent.patterns) {
      const match = pattern.exec(input);
      if (match) {
        return {
          intent: intent.name,
          description: intent.description,
          params: intent.extract(match),
          matchedOn: pattern.source,
        };
      }
    }
  }

  return null;
}

// ───────────────────── FIXED, PARAMETERISED QUERIES ───────────────────────
// Every builder is hand-written SQL with bound parameters. `classIds` is the
// teacher's own scope (or null for an admin) and is applied in every one.

const QUERY_BUILDERS = {
  low_attendance: ({ threshold }, classIds) => ({
    sql: `SELECT u.id AS student_id, u.name, u.avatar_url, sp.roll_number,
                 c.name AS class_name, c.section,
                 v.attendance_percentage AS metric,
                 v.total_classes, v.absent_count
            FROM v_student_attendance_summary v
            JOIN student_profiles sp ON sp.user_id = v.student_id
            JOIN users u            ON u.id = v.student_id AND u.is_active
            LEFT JOIN classes c     ON c.id = sp.class_id
           WHERE v.attendance_percentage < $1
             AND v.total_classes > 0
             AND ($2::uuid[] IS NULL OR sp.class_id = ANY($2::uuid[]))
           ORDER BY v.attendance_percentage ASC
           LIMIT 50`,
    params: [threshold, classIds],
    metricLabel: 'Attendance',
    metricUnit: '%',
    summary: (rows) => `${rows.length} student(s) below ${threshold}% attendance`,
  }),

  perfect_attendance: ({ threshold }, classIds) => ({
    sql: `SELECT u.id AS student_id, u.name, u.avatar_url, sp.roll_number,
                 c.name AS class_name, c.section,
                 v.attendance_percentage AS metric,
                 v.total_classes, v.absent_count
            FROM v_student_attendance_summary v
            JOIN student_profiles sp ON sp.user_id = v.student_id
            JOIN users u            ON u.id = v.student_id AND u.is_active
            LEFT JOIN classes c     ON c.id = sp.class_id
           WHERE v.attendance_percentage >= $1
             AND ($2::uuid[] IS NULL OR sp.class_id = ANY($2::uuid[]))
           ORDER BY v.attendance_percentage DESC
           LIMIT 50`,
    params: [threshold, classIds],
    metricLabel: 'Attendance',
    metricUnit: '%',
    summary: (rows) => `${rows.length} student(s) at or above ${threshold}% attendance`,
  }),

  struggling_in_subject: ({ subjectName, threshold }, classIds) => ({
    sql: `SELECT u.id AS student_id, u.name, u.avatar_url, sp.roll_number,
                 c.name AS class_name, c.section,
                 ROUND(AVG(d.percentage), 2) AS metric,
                 STRING_AGG(DISTINCT d.subject_name, ', ') AS detail
            FROM v_student_marks_detail d
            JOIN student_profiles sp ON sp.user_id = d.student_id
            JOIN users u            ON u.id = d.student_id AND u.is_active
            LEFT JOIN classes c     ON c.id = sp.class_id
           WHERE d.is_published AND NOT d.is_absent
             AND ($1::text IS NULL OR d.subject_name ILIKE '%' || $1::text || '%')
             AND ($3::uuid[] IS NULL OR sp.class_id = ANY($3::uuid[]))
           GROUP BY u.id, u.name, u.avatar_url, sp.roll_number, c.name, c.section
          HAVING AVG(d.percentage) < $2
           ORDER BY metric ASC
           LIMIT 50`,
    params: [subjectName, threshold, classIds],
    metricLabel: 'Average score',
    metricUnit: '%',
    summary: (rows) =>
      `${rows.length} student(s) averaging below ${threshold}%${subjectName ? ` in ${subjectName}` : ''}`,
  }),

  top_performers: ({ limit }, classIds) => ({
    sql: `SELECT u.id AS student_id, u.name, u.avatar_url, sp.roll_number,
                 c.name AS class_name, c.section,
                 ROUND(AVG(d.percentage), 2) AS metric,
                 COUNT(d.id)::int AS detail
            FROM v_student_marks_detail d
            JOIN student_profiles sp ON sp.user_id = d.student_id
            JOIN users u            ON u.id = d.student_id AND u.is_active
            LEFT JOIN classes c     ON c.id = sp.class_id
           WHERE d.is_published AND NOT d.is_absent
             AND ($2::uuid[] IS NULL OR sp.class_id = ANY($2::uuid[]))
           GROUP BY u.id, u.name, u.avatar_url, sp.roll_number, c.name, c.section
           ORDER BY metric DESC
           LIMIT $1`,
    params: [Math.min(limit, 50), classIds],
    metricLabel: 'Average score',
    metricUnit: '%',
    summary: (rows) => `Top ${rows.length} student(s) by average score`,
  }),

  pending_assignments: (_params, classIds) => ({
    sql: `SELECT u.id AS student_id, u.name, u.avatar_url, sp.roll_number,
                 c.name AS class_name, c.section,
                 COUNT(a.id) FILTER (WHERE su.id IS NULL)::int AS metric,
                 COUNT(a.id)::int AS detail
            FROM student_profiles sp
            JOIN users u        ON u.id = sp.user_id AND u.is_active
            LEFT JOIN classes c ON c.id = sp.class_id
            JOIN assignments a  ON a.class_id = sp.class_id
                               AND a.is_published AND a.due_date < NOW()
            LEFT JOIN submissions su
                   ON su.assignment_id = a.id AND su.student_id = sp.user_id
                  AND su.status IN ('submitted','late','graded')
           WHERE ($1::uuid[] IS NULL OR sp.class_id = ANY($1::uuid[]))
           GROUP BY u.id, u.name, u.avatar_url, sp.roll_number, c.name, c.section
          HAVING COUNT(a.id) FILTER (WHERE su.id IS NULL) > 0
           ORDER BY metric DESC
           LIMIT 50`,
    params: [classIds],
    metricLabel: 'Missing submissions',
    metricUnit: '',
    summary: (rows) => `${rows.length} student(s) with outstanding assignments`,
  }),
};

// ──────────────────────────── EXECUTION ───────────────────────────────────

/**
 * Run a natural-language search.
 *
 * `marks_dropped` and `at_risk` are served by the existing analytics services
 * rather than a bespoke query, so the caller passes those in.
 */
export async function runNaturalLanguageSearch({ user, text, services = {} }) {
  const parsed = parseIntent(text);

  if (!parsed) {
    return {
      understood: false,
      query: text,
      message:
        "I couldn't interpret that as a student search. Try phrasing it like one of the examples below.",
      examples: [
        'Show students below 75% attendance',
        'Which students are struggling in mathematics?',
        'Show students whose marks dropped by more than 10%',
        'Who has pending assignments?',
        'Which students are at risk?',
        'Top 10 performers',
      ],
      results: [],
    };
  }

  // Teachers are scoped to their own classes; admins see everything.
  const classIds = user.role === 'teacher' ? await access.getTeacherClassIds(user.id) : null;

  if (Array.isArray(classIds) && classIds.length === 0) {
    return {
      understood: true,
      intent: parsed.intent,
      query: text,
      message: 'No classes are assigned to you yet, so there is nothing to search.',
      results: [],
    };
  }

  // Two intents delegate to services that already implement the logic.
  if (parsed.intent === 'marks_dropped') {
    const declining = await services.getDecliningStudents?.({
      classIds,
      minDrop: parsed.params.minDrop,
      limit: 50,
    });

    return {
      understood: true,
      intent: parsed.intent,
      interpretation: `Students whose recent scores fell by ${parsed.params.minDrop} points or more`,
      query: text,
      message: `${declining?.length ?? 0} student(s) show a decline of ${parsed.params.minDrop}+ points`,
      metricLabel: 'Change',
      metricUnit: ' pts',
      results: (declining ?? []).map((row) => ({
        studentId: row.studentId,
        name: row.name,
        avatarUrl: row.avatarUrl,
        rollNumber: row.rollNumber,
        className: row.className,
        metric: row.change,
        detail: `${row.subjectName}: ${row.previousScore}% → ${row.currentScore}%`,
        riskLevel: row.riskLevel,
      })),
    };
  }

  if (parsed.intent === 'at_risk') {
    const register = await services.getRiskRegister?.({ classIds, limit: 50 });
    const flagged = (register?.students ?? []).filter((student) => student.level !== 'low');

    return {
      understood: true,
      intent: parsed.intent,
      interpretation: 'Students flagged medium or high by the academic risk indicator',
      query: text,
      message: `${flagged.length} student(s) flagged for review`,
      metricLabel: 'Risk score',
      metricUnit: '',
      results: flagged.map((student) => ({
        studentId: student.studentId,
        name: student.name,
        avatarUrl: student.avatarUrl,
        rollNumber: student.rollNumber,
        className: student.className,
        metric: student.riskScore,
        detail: student.factors.map((factor) => factor.detail).join('; ') || 'No specific factors',
        riskLevel: student.level,
      })),
      caveat:
        'The risk indicator combines attendance, assessment averages and assignment completion. ' +
        'It highlights students for a human conversation — it is not a prediction.',
    };
  }

  const builder = QUERY_BUILDERS[parsed.intent];
  if (!builder) {
    return {
      understood: false,
      query: text,
      message: 'That search is recognised but not yet supported.',
      results: [],
    };
  }

  const { sql, params, metricLabel, metricUnit, summary } = builder(parsed.params, classIds);
  const rows = await queryMany(sql, params);

  return {
    understood: true,
    intent: parsed.intent,
    interpretation: parsed.description,
    query: text,
    message: summary(rows),
    metricLabel,
    metricUnit,
    results: rows.map((row) => ({
      studentId: row.student_id,
      name: row.name,
      avatarUrl: row.avatar_url,
      rollNumber: row.roll_number,
      className: row.class_name ? `${row.class_name} ${row.section}` : null,
      metric: Number(row.metric),
      detail: row.detail ?? (row.total_classes ? `${row.absent_count} absences of ${row.total_classes}` : null),
    })),
  };
}

export const SUPPORTED_INTENTS = INTENTS.map((intent) => ({
  name: intent.name,
  description: intent.description,
}));

export default { parseIntent, runNaturalLanguageSearch, SUPPORTED_INTENTS };
