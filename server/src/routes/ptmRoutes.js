import { Router } from 'express';
import * as controller from '../controllers/ptmController.js';
import { authenticateToken, requireRole, requireAnyRole } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { ptmSlotSchema, ptmBookingSchema, ptmStatusSchema } from '../validators/engagementValidators.js';

const router = Router();
router.use(authenticateToken);

router.get('/slots', requireAnyRole('parent', 'teacher', 'admin'), controller.listSlots);
router.post('/slots', requireRole('teacher'), validateBody(ptmSlotSchema), controller.createSlot);
router.delete(
  '/slots/:id',
  requireAnyRole('teacher', 'admin'),
  validateParams(idParam),
  controller.deleteSlot
);

router.get('/bookings', controller.listBookings);
router.post('/bookings', requireRole('parent'), validateBody(ptmBookingSchema), controller.bookSlot);
router.patch(
  '/bookings/:id',
  validateParams(idParam),
  validateBody(ptmStatusSchema),
  controller.updateBooking
);

export default router;
