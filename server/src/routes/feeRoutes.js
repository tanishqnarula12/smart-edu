import { Router } from 'express';
import * as controller from '../controllers/feeController.js';
import { authenticateToken, requireRole, requirePermission } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { feeStructureSchema, paymentSchema, verifyPaymentSchema } from '../validators/engagementValidators.js';

// ── /api/fees ─────────────────────────────────────────────────────────────
export const feeRouter = Router();
feeRouter.use(authenticateToken);

feeRouter.get('/', controller.getStudentFees);
feeRouter.get('/overview', requireRole('admin'), controller.getOverview);
feeRouter.get('/structures', requireRole('admin'), controller.listStructures);
feeRouter.post(
  '/structures',
  requireRole('admin'),
  requirePermission('manage_fees'),
  validateBody(feeStructureSchema),
  controller.createStructure
);

// ── /api/payments ─────────────────────────────────────────────────────────
export const paymentRouter = Router();
paymentRouter.use(authenticateToken);

paymentRouter.post('/', validateBody(paymentSchema), controller.createPayment);
paymentRouter.post('/verify', validateBody(verifyPaymentSchema), controller.verifyPayment);

export default { feeRouter, paymentRouter };
