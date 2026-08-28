import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ProtectedRoute, PublicOnlyRoute, RootRedirect } from './auth/ProtectedRoute.jsx';
import { DashboardLayout } from './layouts/DashboardLayout.jsx';
import { PageLoader } from './components/ui/States.jsx';
import { ErrorBoundary, NotFound, Forbidden, ServerError } from './pages/ErrorPages.jsx';

// ── Eagerly loaded: the entry points a first-time visitor hits ────────────
import { Landing } from './pages/Landing.jsx';
import { Login } from './auth/Login.jsx';
import { Register } from './auth/Register.jsx';
import { ForgotPassword, ResetPassword } from './auth/PasswordReset.jsx';

/*
 * Everything behind a login is code-split by role, so a student never
 * downloads the admin bundle. The Suspense fallback keeps the shell visible
 * while a chunk loads.
 */

// Shared pages
const Profile = lazy(() => import('./pages/Profile.jsx').then((m) => ({ default: m.Profile })));
const Notifications = lazy(() =>
  import('./pages/Notifications.jsx').then((m) => ({ default: m.Notifications }))
);
const Timetable = lazy(() => import('./pages/Timetable.jsx').then((m) => ({ default: m.Timetable })));
const Exams = lazy(() => import('./pages/Exams.jsx').then((m) => ({ default: m.Exams })));
const Calendar = lazy(() => import('./pages/Calendar.jsx').then((m) => ({ default: m.Calendar })));
const StudentDirectory = lazy(() =>
  import('./pages/StudentDirectory.jsx').then((m) => ({ default: m.StudentDirectory }))
);
const StudentProfilePage = lazy(() =>
  import('./pages/StudentProfilePage.jsx').then((m) => ({ default: m.StudentProfilePage }))
);
const NoticesManager = lazy(() =>
  import('./pages/NoticesManager.jsx').then((m) => ({ default: m.NoticesManager }))
);
const Reports = lazy(() => import('./pages/Reports.jsx').then((m) => ({ default: m.Reports })));

// Student
const StudentDashboard = lazy(() =>
  import('./dashboards/student/StudentDashboard.jsx').then((m) => ({ default: m.StudentDashboard }))
);
const StudentAttendance = lazy(() =>
  import('./dashboards/student/StudentAttendance.jsx').then((m) => ({ default: m.StudentAttendance }))
);
const StudentMarks = lazy(() =>
  import('./dashboards/student/StudentMarks.jsx').then((m) => ({ default: m.StudentMarks }))
);
const StudentAssignments = lazy(() =>
  import('./dashboards/student/StudentAssignments.jsx').then((m) => ({ default: m.StudentAssignments }))
);
const StudentQuizzes = lazy(() =>
  import('./dashboards/student/StudentAssignments.jsx').then((m) => ({ default: m.StudentQuizzes }))
);
const StudentAssignmentDetail = lazy(() =>
  import('./dashboards/student/StudentAssignments.jsx').then((m) => ({
    default: m.StudentAssignmentDetail,
  }))
);
const StudentProgress = lazy(() =>
  import('./dashboards/student/StudentProgress.jsx').then((m) => ({ default: m.StudentProgress }))
);
const StudentAITutor = lazy(() =>
  import('./dashboards/student/StudentAI.jsx').then((m) => ({ default: m.StudentAITutor }))
);
const StudentStudyPlan = lazy(() =>
  import('./dashboards/student/StudentAI.jsx').then((m) => ({ default: m.StudentStudyPlan }))
);
const StudentComplaints = lazy(() =>
  import('./dashboards/student/StudentComplaints.jsx').then((m) => ({ default: m.StudentComplaints }))
);
const StudentLeave = lazy(() =>
  import('./dashboards/student/StudentLeave.jsx').then((m) => ({ default: m.StudentLeave }))
);
const StudentPrivacy = lazy(() =>
  import('./dashboards/student/StudentPrivacy.jsx').then((m) => ({ default: m.StudentPrivacy }))
);

// Parent
const ParentDashboard = lazy(() =>
  import('./dashboards/parent/ParentDashboard.jsx').then((m) => ({ default: m.ParentDashboard }))
);
const ParentChildren = lazy(() =>
  import('./dashboards/parent/ParentSections.jsx').then((m) => ({ default: m.ParentChildren }))
);
const ParentAttendance = lazy(() =>
  import('./dashboards/parent/ParentSections.jsx').then((m) => ({ default: m.ParentAttendance }))
);
const ParentMarks = lazy(() =>
  import('./dashboards/parent/ParentSections.jsx').then((m) => ({ default: m.ParentMarks }))
);
const ParentAssignments = lazy(() =>
  import('./dashboards/parent/ParentSections.jsx').then((m) => ({ default: m.ParentAssignments }))
);
const ParentPerformance = lazy(() =>
  import('./dashboards/parent/ParentSections.jsx').then((m) => ({ default: m.ParentPerformance }))
);
const ParentCalendar = lazy(() =>
  import('./dashboards/parent/ParentSections.jsx').then((m) => ({ default: m.ParentCalendar }))
);
const Fees = lazy(() => import('./dashboards/parent/ParentFees.jsx').then((m) => ({ default: m.Fees })));
const ParentPTM = lazy(() =>
  import('./dashboards/parent/ParentPTM.jsx').then((m) => ({ default: m.ParentPTM }))
);

// Teacher
const TeacherDashboard = lazy(() =>
  import('./dashboards/teacher/TeacherDashboard.jsx').then((m) => ({ default: m.TeacherDashboard }))
);
const TeacherAttendance = lazy(() =>
  import('./dashboards/teacher/TeacherAttendance.jsx').then((m) => ({ default: m.TeacherAttendance }))
);
const TeacherMarks = lazy(() =>
  import('./dashboards/teacher/TeacherMarks.jsx').then((m) => ({ default: m.TeacherMarks }))
);
const TeacherAssignments = lazy(() =>
  import('./dashboards/teacher/TeacherAssignments.jsx').then((m) => ({ default: m.TeacherAssignments }))
);
const TeacherQuizProgress = lazy(() =>
  import('./dashboards/teacher/TeacherAssignments.jsx').then((m) => ({ default: m.TeacherQuizProgress }))
);
const TeacherClasses = lazy(() =>
  import('./dashboards/teacher/TeacherClasses.jsx').then((m) => ({ default: m.TeacherClasses }))
);
const TeacherClassDetail = lazy(() =>
  import('./dashboards/teacher/TeacherClasses.jsx').then((m) => ({ default: m.TeacherClassDetail }))
);
const TeacherAITools = lazy(() =>
  import('./dashboards/teacher/TeacherAITools.jsx').then((m) => ({ default: m.TeacherAITools }))
);
const TeacherLibrary = lazy(() =>
  import('./dashboards/teacher/TeacherAITools.jsx').then((m) => ({ default: m.TeacherLibrary }))
);
const TeacherMeetings = lazy(() =>
  import('./dashboards/teacher/TeacherMeetings.jsx').then((m) => ({ default: m.TeacherMeetings }))
);
const TeacherDocuments = lazy(() =>
  import('./dashboards/teacher/TeacherDocuments.jsx').then((m) => ({ default: m.TeacherDocuments }))
);

// Admin
const AdminDashboard = lazy(() =>
  import('./dashboards/admin/AdminDashboard.jsx').then((m) => ({ default: m.AdminDashboard }))
);
const AdminUsers = lazy(() =>
  import('./dashboards/admin/AdminUsers.jsx').then((m) => ({ default: m.AdminUsers }))
);
const AdminParents = lazy(() =>
  import('./dashboards/admin/AdminUsers.jsx').then((m) => ({ default: m.AdminParents }))
);
const AdminClasses = lazy(() =>
  import('./dashboards/admin/AdminAcademics.jsx').then((m) => ({ default: m.AdminClasses }))
);
const AdminSubjects = lazy(() =>
  import('./dashboards/admin/AdminAcademics.jsx').then((m) => ({ default: m.AdminSubjects }))
);
const AdminDepartments = lazy(() =>
  import('./dashboards/admin/AdminAcademics.jsx').then((m) => ({ default: m.AdminDepartments }))
);
const AdminTimetable = lazy(() =>
  import('./dashboards/admin/AdminTimetable.jsx').then((m) => ({ default: m.AdminTimetable }))
);
const AdminComplaints = lazy(() =>
  import('./dashboards/admin/AdminComplaints.jsx').then((m) => ({ default: m.AdminComplaints }))
);
const AdminAnalytics = lazy(() =>
  import('./dashboards/admin/AdminAnalytics.jsx').then((m) => ({ default: m.AdminAnalytics }))
);
const AdminPermissions = lazy(() =>
  import('./dashboards/admin/AdminSystem.jsx').then((m) => ({ default: m.AdminPermissions }))
);
const AdminSettings = lazy(() =>
  import('./dashboards/admin/AdminSystem.jsx').then((m) => ({ default: m.AdminSettings }))
);
const AdminAuditLogs = lazy(() =>
  import('./dashboards/admin/AdminSystem.jsx').then((m) => ({ default: m.AdminAuditLogs }))
);
const AdminFees = lazy(() =>
  import('./dashboards/admin/AdminFees.jsx').then((m) => ({ default: m.AdminFees }))
);
const AIAssistantPage = lazy(() =>
  import('./pages/AIAssistantPage.jsx').then((m) => ({ default: m.AIAssistantPage }))
);
const LeaveManager = lazy(() =>
  import('./pages/LeaveManager.jsx').then((m) => ({ default: m.LeaveManager }))
);
const AdminMarksOverview = lazy(() =>
  import('./dashboards/admin/AdminOverviews.jsx').then((m) => ({ default: m.AdminMarksOverview }))
);
const AdminAttendanceOverview = lazy(() =>
  import('./dashboards/admin/AdminOverviews.jsx').then((m) => ({ default: m.AdminAttendanceOverview }))
);
const AdminAssignmentsOverview = lazy(() =>
  import('./dashboards/admin/AdminOverviews.jsx').then((m) => ({ default: m.AdminAssignmentsOverview }))
);

const Loading = () => <PageLoader message="Loading…" />;

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <Suspense fallback={<Loading />}>
                <Routes>
                  {/* ── Public ─────────────────────────────────────────── */}
                  <Route
                    path="/"
                    element={
                      <RootRedirect>
                        <Landing />
                      </RootRedirect>
                    }
                  />

                  <Route element={<PublicOnlyRoute />}>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password/:token" element={<ResetPassword />} />
                  </Route>

                  {/* ── Student ────────────────────────────────────────── */}
                  <Route element={<ProtectedRoute allowedRoles={['student']} />}>
                    <Route path="/student" element={<DashboardLayout />}>
                      <Route index element={<Navigate to="/student/dashboard" replace />} />
                      <Route path="dashboard" element={<StudentDashboard />} />
                      <Route path="attendance" element={<StudentAttendance />} />
                      <Route path="marks" element={<StudentMarks />} />
                      <Route path="assignments" element={<StudentAssignments />} />
                      <Route path="assignments/:id" element={<StudentAssignmentDetail />} />
                      <Route path="quizzes" element={<StudentQuizzes />} />
                      <Route path="timetable" element={<Timetable />} />
                      <Route path="exams" element={<Exams />} />
                      <Route path="calendar" element={<Calendar />} />
                      <Route path="progress" element={<StudentProgress />} />
                      <Route path="ai-tutor" element={<StudentAITutor />} />
                      <Route path="study-plan" element={<StudentStudyPlan />} />
                      <Route path="complaints" element={<StudentComplaints />} />
                      <Route path="leave" element={<StudentLeave />} />
                      <Route path="notifications" element={<Notifications />} />
                      <Route path="privacy" element={<StudentPrivacy />} />
                      <Route path="profile" element={<Profile />} />
                    </Route>
                  </Route>

                  {/* ── Parent ─────────────────────────────────────────── */}
                  <Route element={<ProtectedRoute allowedRoles={['parent']} />}>
                    <Route path="/parent" element={<DashboardLayout />}>
                      <Route index element={<Navigate to="/parent/dashboard" replace />} />
                      <Route path="dashboard" element={<ParentDashboard />} />
                      <Route path="children" element={<ParentChildren />} />
                      <Route path="attendance" element={<ParentAttendance />} />
                      <Route path="marks" element={<ParentMarks />} />
                      <Route path="assignments" element={<ParentAssignments />} />
                      <Route path="performance" element={<ParentPerformance />} />
                      <Route path="calendar" element={<ParentCalendar />} />
                      <Route path="notices" element={<Notifications defaultTab="notices" />} />
                      <Route path="fees" element={<Fees forParent />} />
                      <Route path="ptm" element={<ParentPTM />} />
                      <Route path="ai-assistant" element={<AIAssistantPage />} />
                      <Route path="notifications" element={<Notifications />} />
                      <Route path="profile" element={<Profile />} />
                    </Route>
                  </Route>

                  {/* ── Teacher ────────────────────────────────────────── */}
                  <Route element={<ProtectedRoute allowedRoles={['teacher']} />}>
                    <Route path="/teacher" element={<DashboardLayout />}>
                      <Route index element={<Navigate to="/teacher/dashboard" replace />} />
                      <Route path="dashboard" element={<TeacherDashboard />} />
                      <Route path="classes" element={<TeacherClasses />} />
                      <Route path="classes/:id" element={<TeacherClassDetail />} />
                      <Route path="students" element={<StudentDirectory />} />
                      <Route path="students/:studentId" element={<StudentProfilePage />} />
                      <Route path="attendance" element={<TeacherAttendance />} />
                      <Route path="marks" element={<TeacherMarks />} />
                      <Route path="assignments" element={<TeacherAssignments />} />
                      <Route path="quiz-progress" element={<TeacherQuizProgress />} />
                      <Route
                        path="quizzes"
                        element={
                          <TeacherLibrary
                            kind="quiz"
                            title="Quiz library"
                            description="Quizzes you have generated and saved."
                          />
                        }
                      />
                      <Route
                        path="question-papers"
                        element={
                          <TeacherLibrary
                            kind="question_paper"
                            title="Question papers"
                            description="Examination papers you have generated and saved."
                          />
                        }
                      />
                      <Route
                        path="assignments-library"
                        element={
                          <TeacherLibrary
                            kind="assignment"
                            title="Saved assignments"
                            description="Assignments you have generated and saved — publish any of them to a class."
                          />
                        }
                      />
                      <Route path="reports" element={<Reports />} />
                      <Route path="timetable" element={<Timetable />} />
                      <Route path="meetings" element={<TeacherMeetings />} />
                      <Route path="notices" element={<NoticesManager />} />
                      <Route path="leave" element={<LeaveManager />} />
                      <Route path="ai-tools" element={<TeacherAITools />} />
                      <Route path="documents" element={<TeacherDocuments />} />
                      <Route path="notifications" element={<Notifications />} />
                      <Route path="profile" element={<Profile />} />
                    </Route>
                  </Route>

                  {/* ── Admin ──────────────────────────────────────────── */}
                  <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                    <Route path="/admin" element={<DashboardLayout />}>
                      <Route index element={<Navigate to="/admin/dashboard" replace />} />
                      <Route path="dashboard" element={<AdminDashboard />} />
                      <Route path="users" element={<AdminUsers />} />
                      <Route
                        path="students"
                        element={
                          <AdminUsers
                            fixedRole="student"
                            title="Students"
                            description="Every student account in the institution."
                          />
                        }
                      />
                      <Route path="students/:studentId" element={<StudentProfilePage />} />
                      <Route
                        path="teachers"
                        element={
                          <AdminUsers
                            fixedRole="teacher"
                            title="Teachers"
                            description="Teaching staff and their departments."
                          />
                        }
                      />
                      <Route path="parents" element={<AdminParents />} />
                      <Route path="classes" element={<AdminClasses />} />
                      <Route path="subjects" element={<AdminSubjects />} />
                      <Route path="departments" element={<AdminDepartments />} />
                      <Route path="attendance" element={<AdminAttendanceOverview />} />
                      <Route path="marks" element={<AdminMarksOverview />} />
                      <Route path="assignments" element={<AdminAssignmentsOverview />} />
                      <Route path="timetable" element={<AdminTimetable />} />
                      <Route path="notices" element={<NoticesManager />} />
                      <Route path="complaints" element={<AdminComplaints />} />
                      <Route path="leave" element={<LeaveManager />} />
                      <Route path="fees" element={<AdminFees />} />
                      <Route path="reports" element={<Reports />} />
                      <Route path="analytics" element={<AdminAnalytics />} />
                      <Route path="ai-assistant" element={<AIAssistantPage />} />
                      <Route path="permissions" element={<AdminPermissions />} />
                      <Route path="settings" element={<AdminSettings />} />
                      <Route path="audit-logs" element={<AdminAuditLogs />} />
                      <Route path="notifications" element={<Notifications />} />
                      <Route path="profile" element={<Profile />} />
                    </Route>
                  </Route>

                  {/* ── Errors ─────────────────────────────────────────── */}
                  <Route path="/403" element={<Forbidden />} />
                  <Route path="/500" element={<ServerError />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
