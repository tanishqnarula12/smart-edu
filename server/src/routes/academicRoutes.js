import { Router } from 'express';
import * as controller from '../controllers/academicController.js';
import { authenticateToken, requireRole, requireAnyRole, requirePermission } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import {
  departmentSchema,
  classSchema,
  subjectSchema,
  assignTeacherSchema,
  enrollStudentSchema,
} from '../validators/academicValidators.js';

/**
 * Three related resources share this file because they are one conceptual
 * unit — the organisation chart. They are mounted at /api/departments,
 * /api/classes and /api/subjects respectively.
 */

// ── /api/departments ──────────────────────────────────────────────────────
export const departmentRouter = Router();
departmentRouter.use(authenticateToken);

departmentRouter.get('/', controller.listDepartments);
departmentRouter.post(
  '/',
  requireRole('admin'),
  requirePermission('manage_departments'),
  validateBody(departmentSchema),
  controller.createDepartment
);
departmentRouter.patch(
  '/:id',
  requireRole('admin'),
  requirePermission('manage_departments'),
  validateParams(idParam),
  validateBody(departmentSchema.partial()),
  controller.updateDepartment
);
departmentRouter.delete(
  '/:id',
  requireRole('admin'),
  requirePermission('manage_departments'),
  validateParams(idParam),
  controller.deleteDepartment
);

// ── /api/classes ──────────────────────────────────────────────────────────
export const classRouter = Router();
classRouter.use(authenticateToken);

classRouter.get('/', controller.listClasses);
classRouter.get('/:id', validateParams(idParam), controller.getClass);

classRouter.post(
  '/',
  requireRole('admin'),
  requirePermission('manage_classes'),
  validateBody(classSchema),
  controller.createClass
);
classRouter.patch(
  '/:id',
  requireRole('admin'),
  requirePermission('manage_classes'),
  validateParams(idParam),
  validateBody(classSchema.partial()),
  controller.updateClass
);
classRouter.delete(
  '/:id',
  requireRole('admin'),
  requirePermission('manage_classes'),
  validateParams(idParam),
  controller.deleteClass
);
classRouter.post(
  '/:id/students',
  requireRole('admin'),
  requirePermission('manage_classes'),
  validateParams(idParam),
  validateBody(enrollStudentSchema.partial({ classId: true, academicYear: true })),
  controller.enrollStudent
);

// ── /api/subjects ─────────────────────────────────────────────────────────
export const subjectRouter = Router();
subjectRouter.use(authenticateToken);

subjectRouter.get('/', controller.listSubjects);
subjectRouter.get('/assignments', requireAnyRole('admin', 'teacher'), controller.listAssignments);

subjectRouter.post(
  '/',
  requireRole('admin'),
  requirePermission('manage_subjects'),
  validateBody(subjectSchema),
  controller.createSubject
);
subjectRouter.post(
  '/assign',
  requireRole('admin'),
  requirePermission('manage_subjects'),
  validateBody(assignTeacherSchema),
  controller.assignTeacher
);
subjectRouter.delete(
  '/assign/:id',
  requireRole('admin'),
  requirePermission('manage_subjects'),
  validateParams(idParam),
  controller.unassignTeacher
);
subjectRouter.patch(
  '/:id',
  requireRole('admin'),
  requirePermission('manage_subjects'),
  validateParams(idParam),
  validateBody(subjectSchema.partial()),
  controller.updateSubject
);
subjectRouter.delete(
  '/:id',
  requireRole('admin'),
  requirePermission('manage_subjects'),
  validateParams(idParam),
  controller.deleteSubject
);

export default { departmentRouter, classRouter, subjectRouter };
