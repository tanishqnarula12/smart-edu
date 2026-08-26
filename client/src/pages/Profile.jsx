import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  User,
  KeyRound,
  Bell,
  Monitor,
  Save,
  LogOut,
  Shield,
} from 'lucide-react';
import { authApi } from '../services/endpoints.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader } from '../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  Tabs,
  Button,
  Input,
  PasswordInput,
  Avatar,
  Badge,
  Toggle,
  Select,
  Callout,
  LoadingSkeleton,
  ConfirmDialog,
} from '../components/ui/index.js';
import { formatDate, formatRelative } from '../utils/format.js';
import { ROLE_LABELS } from '../layouts/navigation.js';

/** Profile, password, preferences and sessions (§4) — shared by every role. */
export function Profile() {
  const { user, profile, preferences, role, updateProfile, updatePreferences, logout } = useAuth();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const toast = useToast();

  const [tab, setTab] = useState('profile');
  const [confirmSignOutAll, setConfirmSignOutAll] = useState(false);

  const { data: sessions } = useApi(() => authApi.sessions(), []);

  const profileForm = useForm({
    defaultValues: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      address: profile?.address ?? '',
      occupation: profile?.occupation ?? '',
    },
  });

  const passwordForm = useForm();

  const saveProfile = async (values) => {
    try {
      await updateProfile(values);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const changePassword = async (values) => {
    try {
      await authApi.changePassword(values);
      toast.success('Password changed. Please sign in again.');
      passwordForm.reset();
      // Changing a password revokes every session, including this one.
      setTimeout(logout, 1600);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const savePreference = async (key, value) => {
    try {
      await updatePreferences({ [key]: value });
    } catch (error) {
      toast.error(error.message);
    }
  };

  const signOutEverywhere = async () => {
    try {
      await authApi.logout();
      toast.success('Signed out of all devices');
      logout();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const newPassword = passwordForm.watch('newPassword');

  return (
    <>
      <PageHeader title="Profile" description="Your account, security and notification settings." />

      {/* Identity card */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={user?.name} src={user?.avatarUrl} size="xl" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-ink">{user?.name}</h2>
              <Badge tone="brand">{ROLE_LABELS[role]}</Badge>
              {!user?.isActive && <Badge tone="danger">Inactive</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-ink-muted">{user?.email}</p>

            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-ink-muted">
              {profile?.studentId && (
                <div className="flex gap-1.5">
                  <dt>Student ID</dt>
                  <dd className="font-medium text-ink">{profile.studentId}</dd>
                </div>
              )}
              {profile?.employeeId && (
                <div className="flex gap-1.5">
                  <dt>Employee ID</dt>
                  <dd className="font-medium text-ink">{profile.employeeId}</dd>
                </div>
              )}
              {profile?.className && (
                <div className="flex gap-1.5">
                  <dt>Class</dt>
                  <dd className="font-medium text-ink">
                    {profile.className} {profile.section}
                  </dd>
                </div>
              )}
              {profile?.rollNumber && (
                <div className="flex gap-1.5">
                  <dt>Roll no.</dt>
                  <dd className="font-medium text-ink">{profile.rollNumber}</dd>
                </div>
              )}
              {profile?.departmentName && (
                <div className="flex gap-1.5">
                  <dt>Department</dt>
                  <dd className="font-medium text-ink">{profile.departmentName}</dd>
                </div>
              )}
              {user?.createdAt && (
                <div className="flex gap-1.5">
                  <dt>Joined</dt>
                  <dd className="font-medium text-ink">{formatDate(user.createdAt)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </Card>

      <Tabs
        tabs={[
          { value: 'profile', label: 'Details', icon: User },
          { value: 'security', label: 'Security', icon: KeyRound },
          { value: 'notifications', label: 'Notifications', icon: Bell },
          { value: 'appearance', label: 'Appearance', icon: Monitor },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'profile' && (
        <Card className="max-w-2xl">
          <CardHeader title="Personal details" icon={User} />

          <form onSubmit={profileForm.handleSubmit(saveProfile)} className="mt-5 space-y-4">
            <Input
              label="Full name"
              error={profileForm.formState.errors.name?.message}
              {...profileForm.register('name', {
                required: 'Your name cannot be empty',
                minLength: { value: 2, message: 'At least 2 characters' },
              })}
            />

            <Input
              label="E-mail address"
              value={user?.email ?? ''}
              disabled
              hint="Contact your administrator to change the e-mail on your account."
            />

            <Input
              label="Phone number"
              type="tel"
              placeholder="+91 98765 43210"
              error={profileForm.formState.errors.phone?.message}
              {...profileForm.register('phone')}
            />

            {(role === 'student' || role === 'parent') && (
              <Input label="Address" {...profileForm.register('address')} />
            )}

            {role === 'parent' && (
              <Input label="Occupation" {...profileForm.register('occupation')} />
            )}

            <Button type="submit" icon={Save} isLoading={profileForm.formState.isSubmitting}>
              Save changes
            </Button>
          </form>
        </Card>
      )}

      {tab === 'security' && (
        <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Change password" icon={KeyRound} />

            <form onSubmit={passwordForm.handleSubmit(changePassword)} className="mt-5 space-y-4">
              <PasswordInput
                label="Current password"
                autoComplete="current-password"
                error={passwordForm.formState.errors.currentPassword?.message}
                required
                {...passwordForm.register('currentPassword', {
                  required: 'Enter your current password',
                })}
              />

              <PasswordInput
                label="New password"
                autoComplete="new-password"
                hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number"
                error={passwordForm.formState.errors.newPassword?.message}
                required
                {...passwordForm.register('newPassword', {
                  required: 'Choose a new password',
                  minLength: { value: 8, message: 'At least 8 characters' },
                  validate: {
                    hasUpper: (value) => /[A-Z]/.test(value) || 'Include an uppercase letter',
                    hasLower: (value) => /[a-z]/.test(value) || 'Include a lowercase letter',
                    hasNumber: (value) => /\d/.test(value) || 'Include a number',
                  },
                })}
              />

              <PasswordInput
                label="Confirm new password"
                autoComplete="new-password"
                error={passwordForm.formState.errors.confirmPassword?.message}
                required
                {...passwordForm.register('confirmPassword', {
                  required: 'Re-enter your new password',
                  validate: (value) => value === newPassword || 'Passwords do not match',
                })}
              />

              <Callout tone="warning">
                <p className="text-xs">
                  Changing your password signs you out of every device, including this one.
                </p>
              </Callout>

              <Button type="submit" icon={KeyRound} isLoading={passwordForm.formState.isSubmitting}>
                Change password
              </Button>
            </form>
          </Card>

          <Card>
            <CardHeader
              title="Active sessions"
              subtitle="Devices currently signed in to your account"
              icon={Shield}
            />

            <div className="mt-5 space-y-3">
              {!sessions ? (
                <LoadingSkeleton count={2} height="h-16" />
              ) : sessions.length === 0 ? (
                <p className="text-sm text-ink-muted">No other active sessions.</p>
              ) : (
                sessions.map((session) => (
                  <div key={session.id} className="rounded-xl border border-line p-3">
                    <p className="truncate text-sm font-medium text-ink">
                      {parseUserAgent(session.user_agent)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {session.ip_address ?? 'Unknown address'} · signed in{' '}
                      {formatRelative(session.created_at)}
                    </p>
                  </div>
                ))
              )}

              <Button
                variant="secondary"
                icon={LogOut}
                fullWidth
                onClick={() => setConfirmSignOutAll(true)}
              >
                Sign out of all devices
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'notifications' && (
        <Card className="max-w-2xl">
          <CardHeader
            title="Notification preferences"
            subtitle="Choose what you want to be told about"
            icon={Bell}
          />

          <div className="mt-5 space-y-5">
            {[
              {
                key: 'attendanceAlerts',
                label: 'Attendance alerts',
                description: 'When you are marked absent or fall below the threshold',
              },
              {
                key: 'marksAlerts',
                label: 'Marks published',
                description: 'When new assessment results are released',
              },
              {
                key: 'assignmentAlerts',
                label: 'Assignment reminders',
                description: 'New assignments, approaching deadlines and grading',
              },
              {
                key: 'noticeAlerts',
                label: 'Notices',
                description: 'Announcements from your institution',
              },
              {
                key: 'emailNotifications',
                label: 'E-mail notifications',
                description: 'Also send these to your e-mail address',
              },
            ].map((option) => (
              <Toggle
                key={option.key}
                label={option.label}
                description={option.description}
                checked={preferences?.[toSnake(option.key)] ?? true}
                onChange={(value) => savePreference(option.key, value)}
              />
            ))}
          </div>
        </Card>
      )}

      {tab === 'appearance' && (
        <Card className="max-w-2xl">
          <CardHeader title="Appearance" subtitle="How Smart Edu looks on this device" icon={Monitor} />

          <div className="mt-5 max-w-xs">
            <Select
              label="Theme"
              value={themePreference}
              onChange={(event) => setThemePreference(event.target.value)}
              options={[
                { value: 'system', label: 'Match my system' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              hint="Saved on this device only."
            />
          </div>
        </Card>
      )}

      <ConfirmDialog
        isOpen={confirmSignOutAll}
        onClose={() => setConfirmSignOutAll(false)}
        onConfirm={signOutEverywhere}
        title="Sign out everywhere?"
        message="You will be signed out on every device, including this one, and will need to sign in again."
        confirmLabel="Sign out everywhere"
      />
    </>
  );
}

const toSnake = (value) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/** Turn a user-agent string into something a person can recognise. */
function parseUserAgent(userAgent) {
  if (!userAgent) return 'Unknown device';

  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : 'Browser';

  const platform =
    /Windows/.test(userAgent) ? 'Windows'
    : /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad/.test(userAgent) ? 'iOS'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : 'Unknown platform';

  return `${browser} on ${platform}`;
}

export default Profile;
