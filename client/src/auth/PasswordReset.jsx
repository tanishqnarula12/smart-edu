import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Mail, KeyRound, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { AuthLayout } from './AuthLayout.jsx';
import { authApi } from '../services/endpoints.js';
import { Button, Input, PasswordInput, Callout } from '../components/ui/index.js';

/**
 * Forgot / reset password.
 *
 * The request endpoint answers identically whether or not the account exists,
 * so this page never reveals which addresses are registered.
 */
export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState(null);
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm();

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const data = await authApi.forgotPassword(values.email);
      setSent(true);
      // In development the server returns the link rather than e-mailing it,
      // so the flow is testable end to end without a mail transport.
      if (data?.resetUrl) setDevLink(data.resetUrl);
    } catch (error) {
      setServerError(error.message);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your e-mail"
        subtitle={`If an account exists for ${getValues('email')}, we've sent a password reset link.`}
        footer={
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-success-500/25 bg-success-50 p-4 dark:bg-success-500/10">
            <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-success-600" aria-hidden="true" />
            <div className="text-sm text-success-800 dark:text-success-500">
              <p className="font-semibold">Reset link sent</p>
              <p className="mt-1">
                The link expires in one hour. Check your spam folder if it does not arrive shortly.
              </p>
            </div>
          </div>

          {devLink && (
            <Callout tone="warning" title="Development mode">
              <p className="text-xs">
                No mail transport is configured, so the reset link is shown here instead. This never
                happens in production.
              </p>
              <Link
                to={devLink.replace(/^https?:\/\/[^/]+/, '')}
                className="mt-2 block break-all rounded-lg bg-surface-raised px-2.5 py-2 font-mono text-[11px] text-brand-600 hover:underline"
              >
                {devLink}
              </Link>
            </Callout>
          )}

          <Button variant="secondary" fullWidth onClick={() => setSent(false)}>
            Use a different e-mail address
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your e-mail address and we'll send you a link to set a new password."
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:text-brand-700"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {serverError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-danger-500/25 bg-danger-50 p-3.5 text-sm text-danger-700 dark:bg-danger-500/10"
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

        <Button type="submit" size="lg" fullWidth icon={Mail} isLoading={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}

export function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm();

  const password = watch('password');

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      await authApi.resetPassword({ token, ...values });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2200);
    } catch (error) {
      setServerError(error.message);
    }
  };

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="You can now sign in with your new password.">
        <div className="flex items-start gap-3 rounded-xl border border-success-500/25 bg-success-50 p-4 dark:bg-success-500/10">
          <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-success-600" aria-hidden="true" />
          <div className="text-sm text-success-800 dark:text-success-500">
            <p className="font-semibold">All done</p>
            <p className="mt-1">
              For your security you have been signed out everywhere. Taking you to sign in…
            </p>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something you haven't used before."
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {serverError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-danger-500/25 bg-danger-50 p-3.5 text-sm text-danger-700 dark:bg-danger-500/10"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        )}

        <PasswordInput
          label="New password"
          autoComplete="new-password"
          autoFocus
          hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number"
          error={errors.password?.message}
          required
          {...register('password', {
            required: 'Choose a new password',
            minLength: { value: 8, message: 'Password must be at least 8 characters' },
            validate: {
              hasUpper: (value) => /[A-Z]/.test(value) || 'Include at least one uppercase letter',
              hasLower: (value) => /[a-z]/.test(value) || 'Include at least one lowercase letter',
              hasNumber: (value) => /\d/.test(value) || 'Include at least one number',
            },
          })}
        />

        <PasswordInput
          label="Confirm new password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          required
          {...register('confirmPassword', {
            required: 'Re-enter your new password',
            validate: (value) => value === password || 'Passwords do not match',
          })}
        />

        <Button type="submit" size="lg" fullWidth icon={KeyRound} isLoading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}

export default ForgotPassword;
