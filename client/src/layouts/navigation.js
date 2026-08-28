import {
  LayoutDashboard, CalendarCheck, GraduationCap, ClipboardList, CalendarDays,
  FileText, TrendingUp, Sparkles, BookOpenCheck, MessageSquareWarning, PlaneTakeoff,
  Bell, ShieldCheck, User, Users, UserCog, School, BookMarked, Building2,
  Wallet, BarChart3, Settings, ScrollText, KeyRound, FileSpreadsheet, HeartHandshake,
  ClipboardCheck, FlaskConical, Baby, Archive,
} from 'lucide-react';

/**
 * Sidebar navigation per role (§44).
 *
 * One definition drives the sidebar, the mobile bottom bar and the breadcrumb
 * labels, so a route never appears in one place and not another.
 * `primary: true` marks the items that surface in the mobile bottom bar.
 */

export const NAVIGATION = {
  student: [
    { to: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard, primary: true },
    { to: '/student/attendance', label: 'My Attendance', icon: CalendarCheck, primary: true },
    { to: '/student/marks', label: 'Marks & CGPA', icon: GraduationCap, primary: true },
    { to: '/student/assignments', label: 'Assignments', icon: ClipboardList, primary: true },
    { to: '/student/timetable', label: 'Timetable', icon: CalendarDays },
    { to: '/student/exams', label: 'Exams', icon: FileText },
    { to: '/student/calendar', label: 'Calendar', icon: CalendarDays },
    { to: '/student/progress', label: 'Progress', icon: TrendingUp },
    { to: '/student/ai-tutor', label: 'AI Tutor', icon: Sparkles, highlight: true, primary: true },
    { to: '/student/study-plan', label: 'Study Plan', icon: BookOpenCheck },
    { to: '/student/complaints', label: 'Complaints', icon: MessageSquareWarning },
    { to: '/student/leave', label: 'Leave', icon: PlaneTakeoff },
    { to: '/student/notifications', label: 'Notifications', icon: Bell },
    { to: '/student/privacy', label: 'Privacy', icon: ShieldCheck },
    { to: '/student/profile', label: 'Profile', icon: User },
  ],

  parent: [
    { to: '/parent/dashboard', label: 'Dashboard', icon: LayoutDashboard, primary: true },
    { to: '/parent/children', label: 'My Children', icon: Baby, primary: true },
    { to: '/parent/attendance', label: 'Attendance', icon: CalendarCheck, primary: true },
    { to: '/parent/marks', label: 'Marks', icon: GraduationCap, primary: true },
    { to: '/parent/assignments', label: 'Assignments', icon: ClipboardList },
    { to: '/parent/performance', label: 'Performance', icon: TrendingUp },
    { to: '/parent/calendar', label: 'Calendar', icon: CalendarDays },
    { to: '/parent/notices', label: 'Notices', icon: FileText },
    { to: '/parent/fees', label: 'Fees', icon: Wallet },
    { to: '/parent/ptm', label: 'PTM', icon: HeartHandshake },
    { to: '/parent/ai-assistant', label: 'AI Assistant', icon: Sparkles, highlight: true, primary: true },
    { to: '/parent/notifications', label: 'Notifications', icon: Bell },
    { to: '/parent/profile', label: 'Profile', icon: User },
  ],

  teacher: [
    { to: '/teacher/dashboard', label: 'Dashboard', icon: LayoutDashboard, primary: true },
    { to: '/teacher/classes', label: 'My Classes', icon: School, primary: true },
    { to: '/teacher/students', label: 'Students', icon: Users, primary: true },
    { to: '/teacher/attendance', label: 'Attendance', icon: CalendarCheck, primary: true },
    { to: '/teacher/marks', label: 'Marks', icon: GraduationCap },
    { to: '/teacher/assignments', label: 'Assignments', icon: ClipboardList },
    { to: '/teacher/quizzes', label: 'Quizzes', icon: FlaskConical },
    { to: '/teacher/question-papers', label: 'Question Papers', icon: FileSpreadsheet },
    { to: '/teacher/assignments-library', label: 'Saved Assignments', icon: Archive },
    { to: '/teacher/reports', label: 'Reports', icon: BarChart3 },
    { to: '/teacher/timetable', label: 'Timetable', icon: CalendarDays },
    { to: '/teacher/notices', label: 'Notices', icon: FileText },
    { to: '/teacher/ai-tools', label: 'AI Tools', icon: Sparkles, highlight: true, primary: true },
    { to: '/teacher/notifications', label: 'Notifications', icon: Bell },
    { to: '/teacher/profile', label: 'Profile', icon: User },
  ],

  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, primary: true },
    { section: 'People' },
    { to: '/admin/users', label: 'Users', icon: UserCog, primary: true },
    { to: '/admin/students', label: 'Students', icon: GraduationCap, primary: true },
    { to: '/admin/teachers', label: 'Teachers', icon: Users },
    { to: '/admin/parents', label: 'Parents', icon: Baby },
    { section: 'Academics' },
    { to: '/admin/classes', label: 'Classes', icon: School },
    { to: '/admin/subjects', label: 'Subjects', icon: BookMarked },
    { to: '/admin/departments', label: 'Departments', icon: Building2 },
    { to: '/admin/attendance', label: 'Attendance', icon: CalendarCheck },
    { to: '/admin/marks', label: 'Marks', icon: ClipboardCheck },
    { to: '/admin/assignments', label: 'Assignments', icon: ClipboardList },
    { to: '/admin/timetable', label: 'Timetable', icon: CalendarDays },
    { section: 'Engagement' },
    { to: '/admin/notices', label: 'Notices', icon: FileText },
    { to: '/admin/complaints', label: 'Complaints', icon: MessageSquareWarning },
    { to: '/admin/fees', label: 'Fees', icon: Wallet },
    { section: 'Insights' },
    { to: '/admin/reports', label: 'Reports', icon: FileSpreadsheet },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, primary: true },
    { to: '/admin/ai-assistant', label: 'AI Assistant', icon: Sparkles, highlight: true, primary: true },
    { section: 'System' },
    { to: '/admin/permissions', label: 'Permissions', icon: KeyRound },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
    { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
    { to: '/admin/profile', label: 'Profile', icon: User },
  ],
};

/** The 4–5 destinations that appear in the mobile bottom bar (§47). */
export function primaryNavigation(role) {
  return (NAVIGATION[role] ?? []).filter((item) => item.primary).slice(0, 5);
}

/** Human label for a path, used for breadcrumbs and the document title. */
export function labelForPath(role, pathname) {
  const items = NAVIGATION[role] ?? [];
  const exact = items.find((item) => item.to === pathname);
  if (exact) return exact.label;

  // Fall back to the longest matching prefix, so /student/assignments/:id
  // still reports "Assignments".
  const prefix = items
    .filter((item) => item.to && pathname.startsWith(item.to))
    .sort((a, b) => b.to.length - a.to.length)[0];

  return prefix?.label ?? null;
}

export const ROLE_LABELS = {
  student: 'Student',
  parent: 'Parent',
  teacher: 'Teacher',
  admin: 'Administrator',
};

export default NAVIGATION;
