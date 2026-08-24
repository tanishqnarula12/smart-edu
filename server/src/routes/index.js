import { Router } from 'express';

import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import studentRoutes from './studentRoutes.js';
import parentRoutes from './parentRoutes.js';
import teacherRoutes from './teacherRoutes.js';
import { departmentRouter, classRouter, subjectRouter } from './academicRoutes.js';
import attendanceRoutes from './attendanceRoutes.js';
import marksRoutes from './marksRoutes.js';
import assignmentRoutes from './assignmentRoutes.js';
import submissionRoutes from './submissionRoutes.js';
import timetableRoutes from './timetableRoutes.js';
import examRoutes from './examRoutes.js';
import noticeRoutes from './noticeRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import complaintRoutes from './complaintRoutes.js';
import leaveRoutes from './leaveRoutes.js';
import { feeRouter, paymentRouter } from './feeRoutes.js';
import ptmRoutes from './ptmRoutes.js';
import privacyRoutes from './privacyRoutes.js';
import reportRoutes from './reportRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import searchRoutes from './searchRoutes.js';
import adminRoutes from './adminRoutes.js';
import aiRoutes from './aiRoutes.js';

/** The complete API surface (§41), mounted under /api. */
const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/students', studentRoutes);
router.use('/parents', parentRoutes);
router.use('/teachers', teacherRoutes);

router.use('/departments', departmentRouter);
router.use('/classes', classRouter);
router.use('/subjects', subjectRouter);

router.use('/attendance', attendanceRoutes);
router.use('/marks', marksRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/submissions', submissionRoutes);
router.use('/timetable', timetableRoutes);
router.use('/exams', examRoutes);

router.use('/notices', noticeRoutes);
router.use('/notifications', notificationRoutes);
router.use('/complaints', complaintRoutes);
router.use('/leave', leaveRoutes);
router.use('/fees', feeRouter);
router.use('/payments', paymentRouter);
router.use('/ptm', ptmRoutes);

router.use('/privacy', privacyRoutes);
router.use('/reports', reportRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/search', searchRoutes);
router.use('/admin', adminRoutes);
router.use('/ai', aiRoutes);

/** A machine-readable index of the API, handy for exploration. */
router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Smart Edu API',
      version: '1.0.0',
      endpoints: [
        '/api/auth', '/api/users', '/api/students', '/api/parents', '/api/teachers',
        '/api/departments', '/api/classes', '/api/subjects',
        '/api/attendance', '/api/marks', '/api/assignments', '/api/submissions',
        '/api/timetable', '/api/exams',
        '/api/notices', '/api/notifications', '/api/complaints', '/api/leave',
        '/api/fees', '/api/payments', '/api/ptm',
        '/api/privacy', '/api/reports', '/api/analytics', '/api/search',
        '/api/admin', '/api/ai',
      ],
      documentation: 'See docs/API.md',
    },
    message: 'Smart Edu API',
  });
});

export default router;
