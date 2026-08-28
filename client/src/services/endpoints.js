import { http } from './api.js';

/**
 * Typed-ish wrappers around the REST API.
 *
 * Components call these rather than building URLs, so a route rename is a
 * one-line change here instead of a hunt through the UI.
 */

export const authApi = {
  login: (payload) => http.post('/auth/login', payload),
  register: (payload) => http.post('/auth/register', payload),
  logout: () => http.post('/auth/logout', {}),
  me: () => http.get('/auth/me'),
  forgotPassword: (email) => http.post('/auth/forgot-password', { email }),
  resetPassword: (payload) => http.post('/auth/reset-password', payload),
  changePassword: (payload) => http.post('/auth/change-password', payload),
  updateProfile: (payload) => http.patch('/auth/profile', payload),
  updatePreferences: (payload) => http.patch('/auth/preferences', payload),
  sessions: () => http.get('/auth/sessions'),
};

export const analyticsApi = {
  student: (params) => http.get('/analytics/student', { params }),
  teacher: (params) => http.get('/analytics/teacher', { params }),
  admin: (params) => http.get('/analytics/admin', { params }),
  attendance: (params) => http.get('/analytics/attendance', { params }),
  academic: (params) => http.get('/analytics/academic', { params }),
  risk: (params) => http.get('/analytics/risk', { params }),
  studentRisk: (studentId) => http.get(`/analytics/student/${studentId}/risk`),
};

export const attendanceApi = {
  list: (params) => http.getFull('/attendance', { params }),
  summary: (params) => http.get('/attendance/summary', { params }),
  register: (params) => http.get('/attendance/register', { params }),
  mark: (payload) => http.post('/attendance', payload),
  update: (id, payload) => http.patch(`/attendance/${id}`, payload),
  classOverview: (classId) => http.get(`/attendance/class/${classId}`),
  low: (params) => http.get('/attendance/low', { params }),
};

export const marksApi = {
  list: (params) => http.get('/marks', { params }),
  performance: (params) => http.get('/marks/performance', { params }),
  assessments: (params) => http.get('/marks/assessments', { params }),
  createAssessment: (payload) => http.post('/marks/assessments', payload),
  sheet: (id) => http.get(`/marks/assessments/${id}/sheet`),
  enterMarks: (id, records) => http.post(`/marks/assessments/${id}/marks`, { records }),
  publish: (id) => http.post(`/marks/assessments/${id}/publish`, {}),
  classPerformance: (classId) => http.get(`/marks/class/${classId}`),
  declining: (params) => http.get('/marks/declining', { params }),
};

export const assignmentApi = {
  list: (params) => http.getFull('/assignments', { params }),
  get: (id) => http.get(`/assignments/${id}`),
  create: (payload) => http.post('/assignments', payload),
  update: (id, payload) => http.patch(`/assignments/${id}`, payload),
  remove: (id) => http.delete(`/assignments/${id}`),
  submit: (id, payload) => http.post(`/assignments/${id}/submit`, payload),
  submissions: (id) => http.get(`/assignments/${id}/submissions`),
  grade: (submissionId, payload) => http.post(`/submissions/${submissionId}/grade`, payload),
  stats: (params) => http.get('/assignments/stats', { params }),
};

export const academicApi = {
  departments: () => http.get('/departments'),
  createDepartment: (payload) => http.post('/departments', payload),
  updateDepartment: (id, payload) => http.patch(`/departments/${id}`, payload),
  deleteDepartment: (id) => http.delete(`/departments/${id}`),

  classes: (params) => http.get('/classes', { params }),
  classDetail: (id) => http.get(`/classes/${id}`),
  createClass: (payload) => http.post('/classes', payload),
  updateClass: (id, payload) => http.patch(`/classes/${id}`, payload),
  deleteClass: (id) => http.delete(`/classes/${id}`),
  enrollStudent: (classId, payload) => http.post(`/classes/${classId}/students`, payload),

  subjects: (params) => http.get('/subjects', { params }),
  createSubject: (payload) => http.post('/subjects', payload),
  updateSubject: (id, payload) => http.patch(`/subjects/${id}`, payload),
  deleteSubject: (id) => http.delete(`/subjects/${id}`),
  teachingAssignments: () => http.get('/subjects/assignments'),
  assignTeacher: (payload) => http.post('/subjects/assign', payload),
  unassignTeacher: (id) => http.delete(`/subjects/assign/${id}`),
};

export const timetableApi = {
  get: (params) => http.get('/timetable', { params }),
  today: (params) => http.get('/timetable/today', { params }),
  create: (payload) => http.post('/timetable', payload),
  update: (id, payload) => http.patch(`/timetable/${id}`, payload),
  remove: (id) => http.delete(`/timetable/${id}`),
  conflicts: () => http.get('/timetable/conflicts'),
};

export const examApi = {
  list: (params) => http.get('/exams', { params }),
  create: (payload) => http.post('/exams', payload),
  remove: (id) => http.delete(`/exams/${id}`),
};

export const noticeApi = {
  list: (params) => http.getFull('/notices', { params }),
  get: (id) => http.get(`/notices/${id}`),
  create: (payload) => http.post('/notices', payload),
  update: (id, payload) => http.patch(`/notices/${id}`, payload),
  remove: (id) => http.delete(`/notices/${id}`),
};

export const notificationApi = {
  list: (params) => http.getFull('/notifications', { params }),
  unreadCount: () => http.get('/notifications/unread-count'),
  markRead: (id) => http.patch(`/notifications/${id}/read`, {}),
  markAllRead: () => http.patch('/notifications/read-all', {}),
  remove: (id) => http.delete(`/notifications/${id}`),
  clearAll: () => http.delete('/notifications'),
};

export const studentApi = {
  list: (params) => http.getFull('/students', { params }),
  profile: (studentId) => http.get(`/students/${studentId}`),
  marks: (studentId) => http.get(`/students/${studentId}/marks`),
  attendance: (studentId) => http.get(`/students/${studentId}/attendance`),
  addRemark: (studentId, payload) => http.post(`/students/${studentId}/remarks`, payload),
};

export const parentApi = {
  children: () => http.get('/parents/children'),
  dashboard: (params) => http.get('/parents/dashboard', { params }),
  section: (studentId, section) => http.get(`/parents/children/${studentId}/${section}`),
};

export const teacherApi = {
  list: (params) => http.getFull('/teachers', { params }),
  get: (id) => http.get(`/teachers/${id}`),
  myClasses: (params) => http.get('/teachers/me/classes', { params }),
  myStudents: () => http.get('/teachers/me/students'),
};

export const userApi = {
  list: (params) => http.getFull('/users', { params }),
  get: (id) => http.get(`/users/${id}`),
  create: (payload) => http.post('/users', payload),
  update: (id, payload) => http.patch(`/users/${id}`, payload),
  remove: (id) => http.delete(`/users/${id}`),
  resetPassword: (id, newPassword) => http.post(`/users/${id}/reset-password`, { newPassword }),
  parentLinks: () => http.get('/users/parent-links'),
  linkParent: (payload) => http.post('/users/link-parent', payload),
  unlinkParent: (id) => http.delete(`/users/link-parent/${id}`),
};

export const complaintApi = {
  list: (params) => http.getFull('/complaints', { params }),
  create: (payload) => http.post('/complaints', payload),
  update: (id, payload) => http.patch(`/complaints/${id}`, payload),
  track: (code) => http.get(`/complaints/track/${code}`),
  stats: () => http.get('/complaints/stats'),
};

export const leaveApi = {
  list: (params) => http.getFull('/leave', { params }),
  apply: (payload) => http.post('/leave', payload),
  review: (id, payload) => http.patch(`/leave/${id}/review`, payload),
  cancel: (id) => http.delete(`/leave/${id}`),
};

export const feeApi = {
  mine: (params) => http.get('/fees', { params }),
  overview: () => http.get('/fees/overview'),
  structures: () => http.get('/fees/structures'),
  createStructure: (payload) => http.post('/fees/structures', payload),
  pay: (payload) => http.post('/payments', payload),
  verify: (payload) => http.post('/payments/verify', payload),
};

export const ptmApi = {
  slots: (params) => http.get('/ptm/slots', { params }),
  createSlot: (payload) => http.post('/ptm/slots', payload),
  removeSlot: (id) => http.delete(`/ptm/slots/${id}`),
  bookings: () => http.get('/ptm/bookings'),
  book: (payload) => http.post('/ptm/bookings', payload),
  updateBooking: (id, payload) => http.patch(`/ptm/bookings/${id}`, payload),
};

export const privacyApi = {
  get: () => http.get('/privacy'),
  update: (payload) => http.patch('/privacy', payload),
  unlinkParent: (parentId) => http.delete(`/privacy/parents/${parentId}`),
};

export const reportApi = {
  student: (studentId) => http.get(`/reports/student/${studentId}`),
  class: (classId) => http.get(`/reports/class/${classId}`),
  teacher: (teacherId) => http.get(`/reports/teacher/${teacherId}`),
  institution: () => http.get('/reports/institution'),
};

export const adminApi = {
  permissions: () => http.get('/admin/permissions'),
  userPermissions: (userId) => http.get(`/admin/permissions/${userId}`),
  updatePermissions: (userId, permissions) =>
    http.patch(`/admin/permissions/${userId}`, { permissions }),
  settings: () => http.get('/admin/settings'),
  updateSetting: (key, payload) => http.put(`/admin/settings/${key}`, payload),
  auditLogs: (params) => http.getFull('/admin/audit-logs', { params }),
  auditActions: () => http.get('/admin/audit-logs/actions'),
  system: () => http.get('/admin/system'),
  recalculateFees: () => http.post('/admin/recalculate-fees', {}),
};

export const aiApi = {
  status: () => http.get('/ai/status'),
  suggestions: () => http.get('/ai/suggestions'),
  chat: (payload) => http.post('/ai/chat', payload),
  conversations: () => http.get('/ai/conversations'),
  conversation: (id) => http.get(`/ai/conversations/${id}`),
  deleteConversation: (id) => http.delete(`/ai/conversations/${id}`),
  studyPlan: (days) => http.post('/ai/study-plan', { days }),
  insights: (params) => http.get('/ai/insights', { params }),
  generateQuiz: (payload) => http.post('/ai/quiz', payload),
  generateAssignment: (payload) => http.post('/ai/assignment', payload),
  generateQuestionPaper: (payload) => http.post('/ai/question-paper', payload),
  search: (payload) => http.post('/ai/search', payload),
  saved: (params) => http.get('/ai/generated', { params }),
  save: (payload) => http.post('/ai/generated', payload),
  deleteSaved: (id) => http.delete(`/ai/generated/${id}`),
  documents: (params) => http.get('/ai/documents', { params }),
  uploadDocument: (payload) => http.post('/ai/documents', payload),
  deleteDocument: (id) => http.delete(`/ai/documents/${id}`),
  retrieve: (payload) => http.post('/ai/retrieve', payload),
};

export const searchApi = {
  global: (q, limit = 5) => http.get('/search', { params: { q, limit } }),
};
