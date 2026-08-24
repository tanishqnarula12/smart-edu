import { Router } from 'express';
import * as controller from '../controllers/adminController.js';
import { authenticateToken, requireRole, requirePermission } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { permissionUpdateSchema, settingSchema, auditQuerySchema } from '../validators/adminValidators.js';

const router = Router();
router.use(authenticateToken, requireRole('admin'));

// Permissions
router.get('/permissions', requirePermission('manage_permissions'), controller.listPermissions);
router.get('/permissions/:userId', requirePermission('manage_permissions'), controller.getUserPermissions);
router.patch(
  '/permissions/:userId',
  requirePermission('manage_permissions'),
  validateBody(permissionUpdateSchema),
  controller.updateUserPermissions
);

// Settings
router.get('/settings', controller.listSettings);
router.put(
  '/settings/:key',
  requirePermission('manage_settings'),
  validateBody(settingSchema),
  controller.updateSetting
);

// Audit trail
router.get(
  '/audit-logs',
  requirePermission('view_audit_logs'),
  validateQuery(auditQuerySchema),
  controller.listAuditLogs
);
router.get('/audit-logs/actions', requirePermission('view_audit_logs'), controller.listAuditActions);

// System
router.get('/system', controller.getSystemStatus);
router.post('/recalculate-fees', requirePermission('manage_fees'), controller.recalculateFeeStatuses);

export default router;
