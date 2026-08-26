import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, dashboardPathFor } from '../context/AuthContext.jsx';
import { PageLoader } from '../components/ui/States.jsx';

/**
 * Frontend route guards (§43).
 *
 * These are a *usability* layer, not a security one — every protected API
 * enforces its own authentication and RBAC server-side. Their job is to stop a
 * user landing on a page that will only show them errors.
 */

/** Requires a signed-in user; optionally a specific set of roles. */
export function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, isLoading, role } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoader message="Checking your session…" />;

  if (!isAuthenticated) {
    // Remember where they were headed so login can return them there.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}

/** For /login and /register — a signed-in user is sent to their dashboard. */
export function PublicOnlyRoute() {
  const { isAuthenticated, isLoading, role } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoader />;

  if (isAuthenticated) {
    const destination = location.state?.from?.pathname ?? dashboardPathFor(role);
    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
}

/** `/` — dashboard when signed in, landing page otherwise. */
export function RootRedirect({ children }) {
  const { isAuthenticated, isLoading, role } = useAuth();

  if (isLoading) return <PageLoader />;
  if (isAuthenticated) return <Navigate to={dashboardPathFor(role)} replace />;

  return children;
}

export default ProtectedRoute;
