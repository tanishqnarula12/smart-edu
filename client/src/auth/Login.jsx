import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { LogIn, AlertCircle, Info } from 'lucide-react';
import { AuthLayout } from './AuthLayout.jsx';
import { useAuth, resolvePostLoginPath } from '../context/AuthContext.jsx';
import { Button, Input, PasswordInput, Checkbox, Callout } from '../components/ui/index.js';

/** Sign-in (§4). Redirects by role, or back to wherever the user was headed. */
export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [serverError, setServerError] = useState(null);
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '', rememberMe: true } });

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const user = await login(values);
      const destination = resolvePostLoginPath(location.state?.from?.pathname, user.role);
      navigate(destination, { replace: true });
    } catch (error) {
      setServerError(error.message);
    }
  };

  // Not named `use…` — that prefix is reserved for hooks and this is a plain
  // click handler.
  const fillDemoAccount = (email) => {
    setValue('email', email);
    setValue('password', 'Demo@12345');
    setShowDemoAccounts(false);
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your Smart Edu account."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            Create one
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

        <Input
          label="E-mail address"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="you@institution.edu"
          error={errors.email?.message}
          required
          {...register('email', {
            required: 'Enter your e-mail address',
            pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid e-mail address' },
          })}
        />

        <PasswordInput
          label="Password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          required
          {...register('password', { required: 'Enter your password' })}
        />

        <div className="flex items-center justify-between gap-3">
          <Checkbox label="Remember me" {...register('rememberMe')} />
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-brand-600 transition hover:text-brand-700"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" fullWidth icon={LogIn} isLoading={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {/* Demo credentials — clearly labelled, never presented as real accounts (§52). */}
      <div className="mt-8">
        <button
          type="button"
          onClick={() => setShowDemoAccounts((current) => !current)}
          className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-ink-muted transition hover:text-ink"
        >
          <Info size={13} aria-hidden="true" />
          {showDemoAccounts ? 'Hide demo accounts' : 'Use a demo account'}
        </button>

        {showDemoAccounts && (
          <Callout tone="neutral" className="mt-3 animate-fade-up">
            <p className="mb-2.5 text-xs">
              Seeded demo accounts. Password:{' '}
              <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-[11px]">
                Demo@12345
              </code>
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {[
                { role: 'Admin', email: 'admin@smartedu.demo' },
                { role: 'Teacher', email: 'teacher@smartedu.demo' },
                { role: 'Student', email: 'student@smartedu.demo' },
                { role: 'Parent', email: 'parent@smartedu.demo' },
              ].map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => fillDemoAccount(account.email)}
                  className="rounded-lg border border-line bg-surface-raised px-2.5 py-2 text-left text-xs transition hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/30"
                >
                  <span className="block font-semibold text-ink">{account.role}</span>
                  <span className="block truncate text-ink-muted">{account.email}</span>
                </button>
              ))}
            </div>
          </Callout>
        )}
      </div>
    </AuthLayout>
  );
}

export default Login;
