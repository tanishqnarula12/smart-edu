import { z } from 'zod';
import { uuid, email, name, phone, role, password, paginationQuery } from './common.js';

export const userQuerySchema = z.object({
  ...paginationQuery,
  role: role.optional(),
  classId: uuid.optional(),
  departmentId: uuid.optional(),
  status: z.enum(['active', 'inactive', 'all']).optional(),
});

export const updateUserSchema = z
  .object({
    name: name.optional(),
    email: email.optional(),
    phone,
    role: role.optional(),
    isActive: z.boolean().optional(),
    avatarUrl: z.string().max(500).optional().nullable(),
    classId: uuid.optional().nullable(),
    rollNumber: z.string().max(20).optional().nullable(),
    departmentId: uuid.optional().nullable(),
    designation: z.string().max(80).optional().nullable(),
    occupation: z.string().max(120).optional().nullable(),
    address: z.string().max(400).optional().nullable(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

export const resetUserPasswordSchema = z.object({
  newPassword: password,
});

export const linkParentSchema = z.object({
  parentId: uuid,
  studentId: uuid,
  relationship: z.enum(['father', 'mother', 'guardian', 'other']).default('guardian'),
  isPrimary: z.boolean().optional().default(false),
});

export const permissionUpdateSchema = z.object({
  permissions: z
    .array(
      z.object({
        code: z.string().min(2).max(64),
        granted: z.boolean(),
      })
    )
    .min(1, 'Select at least one permission to change')
    .max(60),
});

export const settingSchema = z.object({
  value: z.any(),
  description: z.string().max(500).optional(),
});

export const auditQuerySchema = z.object({
  ...paginationQuery,
  action: z.string().max(80).optional(),
  entity: z.string().max(60).optional(),
  userId: uuid.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const analyticsQuerySchema = z.object({
  classId: uuid.optional(),
  departmentId: uuid.optional(),
  subjectId: uuid.optional(),
  academicYear: z.string().max(12).optional(),
  months: z.coerce.number().int().min(1).max(24).optional(),
});

export const reportQuerySchema = z.object({
  studentId: uuid.optional(),
  classId: uuid.optional(),
  teacherId: uuid.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Type at least two characters').max(120),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export default {
  userQuerySchema,
  updateUserSchema,
  resetUserPasswordSchema,
  linkParentSchema,
  permissionUpdateSchema,
  settingSchema,
  auditQuerySchema,
  analyticsQuerySchema,
  reportQuerySchema,
  searchQuerySchema,
};
