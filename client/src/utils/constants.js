/** Shared vocabulary: status colours, labels and thresholds used across the UI. */

export const ATTENDANCE_THRESHOLD = 75;

/** Chart palette. Ordered so adjacent series stay distinguishable. */
export const CHART_COLORS = [
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
];

export const SEMANTIC_COLORS = {
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  neutral: '#94a3b8',
};

export const RISK_COLORS = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
};

/** Badge tone per status value, keyed by domain. */
export const STATUS_TONES = {
  // Attendance
  present: 'success',
  absent: 'danger',
  late: 'warning',

  // Submissions
  pending: 'neutral',
  submitted: 'info',
  graded: 'success',
  overdue: 'danger',

  // Complaints
  under_review: 'warning',
  resolved: 'success',
  rejected: 'danger',

  // Leave
  approved: 'success',

  // Fees
  paid: 'success',
  partial: 'warning',

  // PTM
  requested: 'info',
  confirmed: 'success',
  rescheduled: 'warning',
  cancelled: 'neutral',
  completed: 'success',

  // Risk
  low: 'success',
  medium: 'warning',
  high: 'danger',

  // Priority
  urgent: 'danger',
  normal: 'info',
};

export const COMPLAINT_CATEGORIES = [
  { value: 'academic', label: 'Academic' },
  { value: 'bullying', label: 'Bullying or harassment' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'teacher_help', label: 'Teacher support' },
  { value: 'other', label: 'Other' },
];

export const LEAVE_TYPES = [
  { value: 'personal', label: 'Personal' },
  { value: 'medical', label: 'Medical' },
  { value: 'family', label: 'Family' },
  { value: 'academic', label: 'Academic' },
  { value: 'other', label: 'Other' },
];

export const ASSESSMENT_TYPES = [
  { value: 'internal', label: 'Internal assessment' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'midterm', label: 'Mid-term' },
  { value: 'final', label: 'Final' },
  { value: 'external', label: 'External' },
];

export const NOTICE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'academic', label: 'Academic' },
  { value: 'exam', label: 'Examination' },
  { value: 'event', label: 'Event' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'holiday', label: 'Holiday' },
];

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const WEEKDAYS = [
  { value: 'monday', label: 'Monday', short: 'Mon' },
  { value: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { value: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { value: 'thursday', label: 'Thursday', short: 'Thu' },
  { value: 'friday', label: 'Friday', short: 'Fri' },
  { value: 'saturday', label: 'Saturday', short: 'Sat' },
  { value: 'sunday', label: 'Sunday', short: 'Sun' },
];

export const BLOOM_LEVELS = [
  { value: 'remember', label: 'Remember' },
  { value: 'understand', label: 'Understand' },
  { value: 'apply', label: 'Apply' },
  { value: 'analyze', label: 'Analyse' },
  { value: 'evaluate', label: 'Evaluate' },
  { value: 'create', label: 'Create' },
  { value: 'mixed', label: 'Mixed' },
];

export const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / false' },
  { value: 'short_answer', label: 'Short answer' },
  { value: 'long_answer', label: 'Long answer' },
];

/** Colour for a percentage against the attendance threshold. */
export function attendanceTone(percentage) {
  if (percentage === null || percentage === undefined) return 'neutral';
  if (percentage >= 90) return 'success';
  if (percentage >= ATTENDANCE_THRESHOLD) return 'info';
  if (percentage >= 60) return 'warning';
  return 'danger';
}

/** Colour for an academic score. */
export function scoreTone(percentage) {
  if (percentage === null || percentage === undefined) return 'neutral';
  if (percentage >= 75) return 'success';
  if (percentage >= 50) return 'info';
  if (percentage >= 40) return 'warning';
  return 'danger';
}

export const GRADE_SCALE = [
  { grade: 'O', min: 90, point: 10 },
  { grade: 'A+', min: 80, point: 9 },
  { grade: 'A', min: 70, point: 8 },
  { grade: 'B+', min: 60, point: 7 },
  { grade: 'B', min: 50, point: 6 },
  { grade: 'C', min: 40, point: 5 },
  { grade: 'F', min: 0, point: 0 },
];

export function gradeFor(percentage) {
  if (percentage === null || percentage === undefined) return '—';
  return GRADE_SCALE.find((entry) => percentage >= entry.min)?.grade ?? 'F';
}
