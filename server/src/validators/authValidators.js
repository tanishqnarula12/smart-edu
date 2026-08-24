import { z } from 'zod';
import { email, password, strongPassword, name, phone, role, uuid } from './common.js';

/**
 * Self-registration. Only student and parent accounts may be created this way —
 * teacher and admin accounts are provisioned by an administrator (§4).
 */
export const registerSchema = z
  .object({
    name,
    email,
    password: strongPassword,
    confirmPassword: z.string(),
    role: z.enum(['student', 'parent'], {
      errorMap: () => ({ message: 'Only student and parent accounts can self-register' }),
    }),
    phone: phone.optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16, 'Reset link is invalid'),
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'Choose a password different from your current one',
    path: ['newPassword'],
  });

export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

export const updateProfileSchema = z
  .object({
    name: name.optional(),
    phone,
    avatarUrl: z.string().max(500).optional().nullable(),
    address: z.string().max(400).optional().nullable(),
    occupation: z.string().max(120).optional().nullable(),
    dateOfBirth: z.string().optional().nullable(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

export const preferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  attendanceAlerts: z.boolean().optional(),
  marksAlerts: z.boolean().optional(),
  assignmentAlerts: z.boolean().optional(),
  noticeAlerts: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});

/** Admin-provisioned account — any role, optional profile fields. */
export const adminCreateUserSchema = z.object({
  name,
  email,
  password: password.optional(),
  role,
  phone: phone.optional(),
  isActive: z.boolean().optional().default(true),
  // Role-specific extras, validated loosely here and checked by the service.
  classId: uuid.optional().nullable(),
  rollNumber: z.string().max(20).optional().nullable(),
  studentId: z.string().max(32).optional().nullable(),
  employeeId: z.string().max(32).optional().nullable(),
  departmentId: uuid.optional().nullable(),
  designation: z.string().max(80).optional().nullable(),
  occupation: z.string().max(120).optional().nullable(),
});

export default {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  refreshSchema,
  updateProfileSchema,
  preferencesSchema,
  adminCreateUserSchema,
};
