import { Router } from 'express';
import * as controller from '../controllers/complaintController.js';
import { authenticateToken, requireRole, requireAnyRole, requirePermission } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { upload, uploadTo } from '../middleware/upload.js';
import { idParam } from '../validators/common.js';
import { complaintSchema, updateComplaintSchema } from '../validators/engagementValidators.js';

const router = Router();
router.use(authenticateToken);

router.get('/', requireAnyRole('student', 'admin'), controller.listComplaints);
router.get('/stats', requireRole('admin'), controller.getStats);
router.get('/track/:code', controller.trackComplaint);

router.post(
  '/',
  requireRole('student'),
  uploadTo('complaints'),
  upload.single('attachment'),
  validateBody(complaintSchema),
  controller.createComplaint
);

router.patch(
  '/:id',
  requireRole('admin'),
  requirePermission('manage_complaints'),
  validateParams(idParam),
  validateBody(updateComplaintSchema),
  controller.updateComplaint
);

export default router;
