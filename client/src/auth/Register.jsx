import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { UserPlus, AlertCircle, GraduationCap, Users } from 'lucide-react';
import { AuthLayout } from './AuthLayout.jsx';
import { useAuth, dashboardPathFor } from '../context/AuthContext.jsx';
import { Button, Input, PasswordInput, Callout } from '../components/ui/index.js';
import { cn } from '../utils/cn.js';

/**
 * Self-registration (§4).
 *
 * Only student and parent accounts can be created this way — the backend
 * enforces the same rule, so the role picker here is convenience, not control.
 */
export function Register() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { role: 'student' } });

  const selectedRole = watch('role');
  const password = watch('password');

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const user = await registerUser(values);
      navigate(dashboardPathFor(user.role), { replace: true });
    } catch (error) {
      setServerError(error.message);
    }
  };

  const roles = [
    { value: 'student', label: 'Student', icon: GraduationCap, description: 'Track your own academics' },
    { value: 'parent', label: 'Parent', icon: Users, description: 'Follow your child’s progress' },
  ];

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join Smart Edu as a student or a parent."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {serverError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-danger-500/25 bg-danger-50 p-3.5 text-sm text-danger-700 dark:bg-danger-500/10 dark:text-danger-500"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        )}

        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-ink">I am a</legend>
          <div className="grid grid-cols-2 gap-3">
            {roles.map((role) => (
              <button
                key={role.value}
                type="button"
                onClick={() => setValue('role', role.value)}
                aria-pressed={selectedRole === role.value}
                className={cn(
                  'rounded-xl border p-3.5 text-left transition',
                  selectedRole === role.value
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20 dark:bg-brand-950/40'
                    : 'border-line bg-surface-raised hover:border-ink-subtle'
                )}
              >
                <role.icon
                  size={19}
                  className={cn(
                    'mb-2',
                    selectedRole === role.value ? 'text-brand-600' : 'text-ink-subtle'
                  )}
                  aria-hidden="true"
                />
                <span className="block text-sm font-semibold text-ink">{role.label}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{role.description}</span>
              </button>
            ))}
          </div>
          <input type="hidden" {...register('role')} />
        </fieldset>

        <Input
          label="Full name"
          autoComplete="name"
          placeholder="Ananya Sharma"
          error={errors.name?.message}
          required
          {...register('name', {
            required: 'Enter your full name',
            minLength: { value: 2, message: 'Name must be at least 2 characters' },
          })}
        />

        <Input
          label="E-mail address"
          type="email"
          autoComplete="email"
          placeholder="you@institution.edu"
          error={errors.email?.message}
          required
          {...register('email', {
            required: 'Enter your e-mail address',
            pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid e-mail address' },
          })}
        />

        <Input
          label="Phone number"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          hint="Optional"
          error={errors.phone?.message}
          {...register('phone')}
        />

        <PasswordInput
          label="Password"
          autoComplete="new-password"
          hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number"
          error={errors.password?.message}
          required
          {...register('password', {
            required: 'Choose a password',
            minLength: { value: 8, message: 'Password must be at least 8 characters' },
            validate: {
              hasUpper: (value) => /[A-Z]/.test(value) || 'Include at least one uppercase letter',
              hasLower: (value) => /[a-z]/.test(value) || 'Include at least one lowercase letter',
              hasNumber: (value) => /\d/.test(value) || 'Include at least one number',
            },
          })}
        />

        <PasswordInput
          label="Confirm password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          required
          {...register('confirmPassword', {
            required: 'Re-enter your password',
            validate: (value) => value === password || 'Passwords do not match',
          })}
        />

        <Button type="submit" size="lg" fullWidth icon={UserPlus} isLoading={isSubmitting}>
          {isSubmitting ? 'Creating your account…' : 'Create account'}
        </Button>

        <Callout tone="neutral">
          <p className="text-xs">
            Teacher and administrator accounts are created by your institution&apos;s administrator.
            If you are staff, ask them to provision your account.
          </p>
        </Callout>
      </form>
    </AuthLayout>
  );
}

export default Register;
