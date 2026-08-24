import { z } from 'zod';

/** Reusable primitives shared by every domain schema (§49). */

export const uuid = z.string().uuid('Must be a valid identifier');

export const optionalUuid = z
  .union([uuid, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === '' || value === undefined ? null : value));

export const email = z
  .string()
  .trim()
  .min(1, 'E-mail is required')
  .email('Enter a valid e-mail address')
  .max(180, 'E-mail is too long')
  .toLowerCase();

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

/** Applied to *new* passwords only, so existing demo logins keep working. */
export const strongPassword = password.refine(
  (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value),
  'Password must include an uppercase letter, a lowercase letter and a number'
);

export const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(120);

export const phone = z
  .string()
  .trim()
  .regex(/^[+]?[\d\s()-]{7,20}$/, 'Enter a valid phone number')
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null));

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a real date');

export const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use the format HH:MM');

export const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a valid date/time');

export const academicYear = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Use the format 2025-26');

export const role = z.enum(['admin', 'teacher', 'student', 'parent'], {
  errorMap: () => ({ message: 'Role must be admin, teacher, student or parent' }),
});

export const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

/** Coerced pagination + sorting, mixed into list query schemas. */
export const paginationQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.string().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  search: z.string().trim().max(120).optional(),
};

export const idParam = z.object({ id: uuid });
export const studentIdParam = z.object({ studentId: uuid });

/** Guard against a request that would update nothing. */
export const requireSomeField = (schema, message = 'Provide at least one field to update') =>
  schema.refine((value) => Object.values(value).some((field) => field !== undefined), { message });

export default {
  uuid,
  optionalUuid,
  email,
  password,
  strongPassword,
  name,
  phone,
  dateString,
  timeString,
  isoDateTime,
  academicYear,
  role,
  boolish,
  paginationQuery,
  idParam,
  studentIdParam,
  requireSomeField,
};
