import { z } from 'zod';
import {
  uuid,
  optionalUuid,
  dateString,
  timeString,
  isoDateTime,
  academicYear,
  paginationQuery,
} from './common.js';

// ───────────────────────────── ORGANISATION ───────────────────────────────

export const departmentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(20).toUpperCase(),
  headId: optionalUuid,
});

export const classSchema = z.object({
  name: z.string().trim().min(1).max(80),
  section: z.string().trim().min(1).max(10).default('A'),
  academicYear,
  departmentId: optionalUuid,
  classTeacherId: optionalUuid,
  room: z.string().trim().max(40).optional().nullable(),
});

export const subjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(24).toUpperCase(),
  credits: z.coerce.number().min(0.5).max(20).default(4),
  departmentId: optionalUuid,
  description: z.string().max(600).optional().nullable(),
});

export const assignTeacherSchema = z.object({
  teacherId: uuid,
  subjectId: uuid,
  classId: uuid,
  academicYear,
});

export const enrollStudentSchema = z.object({
  studentId: uuid,
  classId: uuid,
  academicYear,
  rollNumber: z.string().max(20).optional().nullable(),
});

// ────────────────────────────── ATTENDANCE ────────────────────────────────

const attendanceStatus = z.enum(['present', 'absent', 'late'], {
  errorMap: () => ({ message: 'Status must be present, absent or late' }),
});

export const markAttendanceSchema = z.object({
  classId: uuid,
  subjectId: uuid,
  date: dateString.refine(
    (value) => new Date(value) <= new Date(new Date().setHours(23, 59, 59, 999)),
    'Attendance cannot be recorded for a future date'
  ),
  records: z
    .array(
      z.object({
        studentId: uuid,
        status: attendanceStatus,
        remarks: z.string().max(300).optional().nullable(),
      })
    )
    .min(1, 'Mark at least one student')
    .max(300, 'Too many records in a single submission')
    .refine(
      (records) => new Set(records.map((r) => r.studentId)).size === records.length,
      'The same student appears more than once'
    ),
});

export const updateAttendanceSchema = z.object({
  status: attendanceStatus,
  remarks: z.string().max(300).optional().nullable(),
});

export const attendanceQuerySchema = z.object({
  ...paginationQuery,
  studentId: uuid.optional(),
  classId: uuid.optional(),
  subjectId: uuid.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  status: attendanceStatus.optional(),
});

// ─────────────────────────── ASSESSMENTS & MARKS ──────────────────────────

export const assessmentSchema = z.object({
  name: z.string().trim().min(2).max(160),
  subjectId: uuid,
  classId: uuid,
  type: z.enum(['internal', 'external', 'quiz', 'assignment', 'midterm', 'final']).default('internal'),
  maxMarks: z.coerce.number().positive('Maximum marks must be greater than zero').max(1000),
  weightage: z.coerce.number().min(0).max(100).default(100),
  date: dateString,
});

/**
 * Bulk marks entry. `marksObtained` is validated against the assessment's
 * `max_marks` in the service, which is the only place that knows it (§22).
 */
export const enterMarksSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: uuid,
        marksObtained: z.coerce.number().min(0, 'Marks cannot be negative').nullable().optional(),
        isAbsent: z.boolean().optional().default(false),
        remarks: z.string().max(300).optional().nullable(),
      })
    )
    .min(1, 'Enter marks for at least one student')
    .max(300)
    .refine(
      (records) => new Set(records.map((r) => r.studentId)).size === records.length,
      'The same student appears more than once'
    ),
});

export const marksQuerySchema = z.object({
  ...paginationQuery,
  studentId: uuid.optional(),
  classId: uuid.optional(),
  subjectId: uuid.optional(),
  assessmentId: uuid.optional(),
  type: z.enum(['internal', 'external', 'quiz', 'assignment', 'midterm', 'final']).optional(),
});

// ───────────────────────────── ASSIGNMENTS ────────────────────────────────

// Structured question shown as its own answer box on the student side —
// populated only when an assignment is published from AI-generated content.
// Never carries an answer/explanation field; those stay out of student view.
const assignmentQuestionSchema = z.object({
  number: z.coerce.number().optional(),
  question: z.string().max(2000),
  marks: z.coerce.number().optional(),
  options: z.array(z.string().max(500)).optional(),
  guidance: z.string().max(1000).optional(),
  section: z.string().max(200).optional(),
});

export const assignmentSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().max(4000).optional().nullable(),
  instructions: z.string().max(6000).optional().nullable(),
  subjectId: uuid,
  classId: uuid,
  dueDate: isoDateTime,
  maxMarks: z.coerce.number().positive().max(1000).default(100),
  attachmentUrl: z.string().max(500).optional().nullable(),
  questions: z.array(assignmentQuestionSchema).max(100).optional().nullable(),
  isPublished: z.boolean().optional().default(true),
});

export const updateAssignmentSchema = assignmentSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one field to update'
);

export const submitAssignmentSchema = z
  .object({
    content: z.string().max(20000).optional().nullable(),
    submissionUrl: z.string().max(500).optional().nullable(),
  })
  .refine(
    (value) => Boolean(value.content?.trim()) || Boolean(value.submissionUrl),
    'Attach a file or write your answer before submitting'
  );

export const gradeSubmissionSchema = z.object({
  marks: z.coerce.number().min(0, 'Marks cannot be negative'),
  feedback: z.string().max(2000).optional().nullable(),
});

export const assignmentQuerySchema = z.object({
  ...paginationQuery,
  classId: uuid.optional(),
  subjectId: uuid.optional(),
  status: z.enum(['pending', 'submitted', 'late', 'graded', 'upcoming', 'overdue']).optional(),
});

// ────────────────────────────── TIMETABLE ─────────────────────────────────

export const timetableSchema = z
  .object({
    classId: uuid,
    subjectId: uuid,
    teacherId: uuid,
    day: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    startTime: timeString,
    endTime: timeString,
    room: z.string().max(40).optional().nullable(),
    academicYear,
  })
  .refine((value) => value.endTime > value.startTime, {
    message: 'End time must be after the start time',
    path: ['endTime'],
  });

// ──────────────────────────────── EXAMS ───────────────────────────────────

export const examSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    classId: uuid,
    subjectId: uuid,
    examDate: dateString,
    startTime: timeString.optional().nullable(),
    endTime: timeString.optional().nullable(),
    room: z.string().max(40).optional().nullable(),
    maxMarks: z.coerce.number().positive().max(1000).default(100),
    syllabus: z.string().max(4000).optional().nullable(),
  })
  .refine(
    (value) => !value.startTime || !value.endTime || value.endTime > value.startTime,
    { message: 'End time must be after the start time', path: ['endTime'] }
  );

export default {
  departmentSchema,
  classSchema,
  subjectSchema,
  assignTeacherSchema,
  enrollStudentSchema,
  markAttendanceSchema,
  updateAttendanceSchema,
  attendanceQuerySchema,
  assessmentSchema,
  enterMarksSchema,
  marksQuerySchema,
  assignmentSchema,
  updateAssignmentSchema,
  submitAssignmentSchema,
  gradeSubmissionSchema,
  assignmentQuerySchema,
  timetableSchema,
  examSchema,
};
