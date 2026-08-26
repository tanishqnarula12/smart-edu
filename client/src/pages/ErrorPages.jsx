import { Component } from 'react';
import { useNavigate, useRouteError } from 'react-router-dom';
import {
  Home,
  ArrowLeft,
  SearchX,
  Lock,
  ServerCrash,
  RefreshCw,
} from 'lucide-react';
import { useAuth, dashboardPathFor } from '../context/AuthContext.jsx';
import { Button } from '../components/ui/Button.jsx';

/** 404, 403 and 500 pages (§62), plus the top-level error boundary. */

function ErrorShell({ code, icon: Icon, title, message, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-5 py-16">
      <div className="w-full max-w-md text-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-raised text-ink-subtle shadow-card">
          <Icon size={28} aria-hidden="true" />
        </span>

        <p className="mt-6 text-6xl font-extrabold tracking-tight text-ink-subtle/40">{code}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{message}</p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">{children}</div>
      </div>
    </div>
  );
}

export function NotFound() {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();

  return (
    <ErrorShell
      code="404"
      icon={SearchX}
      title="Page not found"
      message="That page does not exist, or it may have moved. Check the address, or head back to somewhere familiar."
    >
      <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(-1)}>
        Go back
      </Button>
      <Button to={isAuthenticated ? dashboardPathFor(role) : '/'} icon={Home}>
        {isAuthenticated ? 'My dashboard' : 'Home'}
      </Button>
    </ErrorShell>
  );
}

export function Forbidden() {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();

  return (
    <ErrorShell
      code="403"
      icon={Lock}
      title="You do not have access"
      message={
        isAuthenticated
          ? 'This area is restricted to a different role. If you think you should have access, ask your administrator.'
          : 'You need to sign in to view this page.'
      }
    >
      <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(-1)}>
        Go back
      </Button>
      <Button to={isAuthenticated ? dashboardPathFor(role) : '/login'} icon={Home}>
        {isAuthenticated ? 'My dashboard' : 'Sign in'}
      </Button>
    </ErrorShell>
  );
}

export function ServerError({ onRetry }) {
  return (
    <ErrorShell
      code="500"
      icon={ServerCrash}
      title="Something went wrong"
      message="An unexpected error occurred on our side. Try again — if it keeps happening, let your administrator know."
    >
      <Button icon={RefreshCw} onClick={onRetry ?? (() => window.location.reload())}>
        Try again
      </Button>
      <Button to="/" variant="secondary" icon={Home}>
        Home
      </Button>
    </ErrorShell>
  );
}

/** Router-level error element — catches loader and render failures. */
export function RouteError() {
  const error = useRouteError();

  if (error?.status === 404) return <NotFound />;
  if (error?.status === 403) return <Forbidden />;

  console.error('[router] unhandled route error:', error);
  return <ServerError />;
}

/**
 * Top-level error boundary.
 *
 * A render crash in one dashboard should not leave a blank white page — this
 * catches it, logs it, and offers a way out.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[boundary] render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-5 py-16">
        <div className="w-full max-w-lg text-center">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-raised text-danger-500 shadow-card">
            <ServerCrash size={28} aria-hidden="true" />
          </span>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">
            Smart Edu hit an unexpected error
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
            The page could not be rendered. Reloading usually clears it.
          </p>

          {/* Development only — a stack trace helps nobody in production. */}
          {import.meta.env.DEV && this.state.error && (
            <pre className="scrollbar-slim mt-6 max-h-48 overflow-auto rounded-xl bg-surface-raised p-4 text-left font-mono text-xs text-danger-600">
              {this.state.error.toString()}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button icon={RefreshCw} onClick={() => window.location.reload()}>
              Reload the page
            </Button>
            <Button
              variant="secondary"
              icon={Home}
              onClick={() => {
                window.location.href = '/';
              }}
            >
              Go home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default NotFound;
