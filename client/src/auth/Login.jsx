import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { LogIn, AlertCircle } from 'lucide-react';
import { AuthLayout } from './AuthLayout.jsx';
import { useAuth, dashboardPathFor } from '../context/AuthContext.jsx';
import { Button, Input, PasswordInput, Checkbox } from '../components/ui/index.js';

/** Sign-in (§4). Redirects by role, or back to wherever the user was headed. */
export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '', rememberMe: true } });

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const user = await login(values);
      const destination = location.state?.from?.pathname ?? dashboardPathFor(user.role);
      navigate(destination, { replace: true });
    } catch (error) {
      setServerError(error.message);
    }
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
    </AuthLayout>
  );
}

export default Login;
