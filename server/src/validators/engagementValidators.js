import { z } from 'zod';
import { uuid, optionalUuid, dateString, timeString, role, paginationQuery } from './common.js';

// ────────────────────────────── NOTICES ───────────────────────────────────

export const noticeSchema = z.object({
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(5, 'Write a little more detail').max(8000),
  targetRole: role.optional().nullable(),
  classId: optionalUuid,
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  category: z.enum(['general', 'exam', 'event', 'assignment', 'holiday', 'academic']).default('general'),
  isPinned: z.boolean().optional().default(false),
  expiresAt: z.string().optional().nullable(),
});

export const noticeQuerySchema = z.object({
  ...paginationQuery,
  category: z.string().max(40).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

// ─────────────────────────── NOTIFICATIONS ────────────────────────────────

export const notificationQuerySchema = z.object({
  ...paginationQuery,
  unreadOnly: z.enum(['true', 'false']).optional(),
  type: z.string().max(40).optional(),
});

// ───────────────────────────── COMPLAINTS ─────────────────────────────────

export const complaintSchema = z.object({
  category: z.enum(['academic', 'bullying', 'infrastructure', 'teacher_help', 'other'], {
    errorMap: () => ({ message: 'Choose a valid complaint category' }),
  }),
  subject: z.string().trim().min(4, 'Give your complaint a short title').max(200),
  description: z.string().trim().min(15, 'Please describe what happened in a little more detail').max(6000),
  isAnonymous: z.boolean().optional().default(false),
  attachmentUrl: z.string().max(500).optional().nullable(),
});

export const updateComplaintSchema = z
  .object({
    status: z.enum(['submitted', 'under_review', 'resolved', 'rejected']).optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    assignedTo: optionalUuid,
    response: z.string().max(4000).optional().nullable(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

// ─────────────────────────────── LEAVE ────────────────────────────────────

export const leaveSchema = z
  .object({
    startDate: dateString,
    endDate: dateString,
    reason: z.string().trim().min(10, 'Please give a reason of at least 10 characters').max(2000),
    leaveType: z.enum(['personal', 'medical', 'family', 'academic', 'other']).default('personal'),
    attachmentUrl: z.string().max(500).optional().nullable(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'The end date cannot be before the start date',
    path: ['endDate'],
  });

export const reviewLeaveSchema = z.object({
  status: z.enum(['approved', 'rejected'], {
    errorMap: () => ({ message: 'Decision must be approved or rejected' }),
  }),
  reviewNote: z.string().max(1000).optional().nullable(),
});

// ──────────────────────────────── FEES ────────────────────────────────────

export const feeStructureSchema = z.object({
  name: z.string().trim().min(3).max(160),
  classId: optionalUuid,
  academicYear: z.string().regex(/^\d{4}-\d{2}$/, 'Use the format 2025-26'),
  amount: z.coerce.number().min(0).max(10_000_000),
  description: z.string().max(1000).optional().nullable(),
  dueDate: dateString,
});

export const paymentSchema = z.object({
  feeRecordId: uuid,
  amount: z.coerce.number().positive('Enter an amount greater than zero'),
  method: z.enum(['card', 'upi', 'netbanking', 'cash', 'cheque', 'mock']).default('mock'),
});

export const verifyPaymentSchema = z.object({
  paymentId: uuid,
  providerPaymentId: z.string().max(120).optional(),
  providerSignature: z.string().max(240).optional(),
});

// ───────────────────────────────── PTM ────────────────────────────────────

export const ptmSlotSchema = z
  .object({
    date: dateString,
    startTime: timeString,
    endTime: timeString,
    mode: z.enum(['in_person', 'online', 'phone']).default('in_person'),
    location: z.string().max(120).optional().nullable(),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: 'End time must be after the start time',
    path: ['endTime'],
  });

export const ptmBookingSchema = z.object({
  slotId: uuid,
  studentId: uuid,
  agenda: z.string().max(1000).optional().nullable(),
});

export const ptmStatusSchema = z.object({
  status: z.enum(['requested', 'confirmed', 'rescheduled', 'cancelled', 'completed']),
  teacherNote: z.string().max(1000).optional().nullable(),
  slotId: uuid.optional(),
});

// ─────────────────────────────── PRIVACY ──────────────────────────────────

/**
 * The student's own privacy controls (§38). `parentId` narrows the change to
 * one parent link; omitting it applies the change to every linked parent.
 */
export const privacySchema = z
  .object({
    parentPermissionEnabled: z.boolean().optional(),
    parentId: uuid.optional(),
    canViewAttendance: z.boolean().optional(),
    canViewMarks: z.boolean().optional(),
    canViewAssignments: z.boolean().optional(),
    canViewCgpa: z.boolean().optional(),
    canViewReports: z.boolean().optional(),
    canViewFees: z.boolean().optional(),
  })
  .refine(
    (value) =>
      Object.entries(value).some(([key, field]) => key !== 'parentId' && field !== undefined),
    { message: 'Provide at least one privacy setting to change' }
  );

// ───────────────────────────── TEACHER REMARKS ────────────────────────────

export const remarkSchema = z.object({
  studentId: uuid,
  subjectId: optionalUuid,
  remark: z.string().trim().min(5).max(2000),
  sentiment: z.enum(['positive', 'neutral', 'concern']).default('neutral'),
});

export default {
  noticeSchema,
  noticeQuerySchema,
  notificationQuerySchema,
  complaintSchema,
  updateComplaintSchema,
  leaveSchema,
  reviewLeaveSchema,
  feeStructureSchema,
  paymentSchema,
  verifyPaymentSchema,
  ptmSlotSchema,
  ptmBookingSchema,
  ptmStatusSchema,
  privacySchema,
  remarkSchema,
};
