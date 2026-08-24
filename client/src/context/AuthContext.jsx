import { createContext, useContext, useCallback, useEffect, useMemo, useReducer } from 'react';
import { api, setAccessToken, setUnauthorizedHandler } from '../services/api.js';
import { authApi } from '../services/endpoints.js';

/**
 * Authentication state (§43).
 *
 * The flow on load: try to refresh (the httpOnly cookie survives a reload),
 * then fetch /auth/me. Until that settles the app shows a splash rather than
 * flashing the login page at an already-signed-in user.
 */

const AuthContext = createContext(null);

const initialState = {
  user: null,
  profile: null,
  preferences: null,
  permissions: [],
  status: 'loading', // loading | authenticated | anonymous
  error: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'AUTHENTICATED':
      return {
        ...state,
        user: action.payload.user,
        profile: action.payload.profile ?? null,
        preferences: action.payload.preferences ?? null,
        permissions: action.payload.permissions ?? [],
        status: 'authenticated',
        error: null,
      };
    case 'ANONYMOUS':
      return { ...initialState, status: 'anonymous', error: action.error ?? null };
    case 'PROFILE_UPDATED':
      return {
        ...state,
        user: { ...state.user, ...action.payload.user },
        profile: action.payload.profile ?? state.profile,
      };
    case 'PREFERENCES_UPDATED':
      return { ...state, preferences: { ...state.preferences, ...action.payload } };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadSession = useCallback(async () => {
    const data = await authApi.me();
    dispatch({ type: 'AUTHENTICATED', payload: data });
    return data;
  }, []);

  // On mount: exchange the refresh cookie for an access token, then load
  // the profile. A failure here simply means "not signed in".
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await api.post('/auth/refresh', {});
        const token = response.data?.data?.accessToken;
        if (!token) throw new Error('No session');

        setAccessToken(token);
        if (cancelled) return;
        await loadSession();
      } catch {
        if (!cancelled) dispatch({ type: 'ANONYMOUS' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadSession]);

  // A 401 that survives a refresh attempt ends the session.
  useEffect(() => {
    setUnauthorizedHandler(() => dispatch({ type: 'ANONYMOUS' }));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(
    async (credentials) => {
      const data = await authApi.login(credentials);
      setAccessToken(data.accessToken);
      const session = await loadSession();
      return session.user;
    },
    [loadSession]
  );

  const register = useCallback(
    async (payload) => {
      const data = await authApi.register(payload);
      setAccessToken(data.accessToken);
      const session = await loadSession();
      return session.user;
    },
    [loadSession]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the server call fails, the local session must end.
    }
    setAccessToken(null);
    dispatch({ type: 'ANONYMOUS' });
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const data = await authApi.updateProfile(payload);
    dispatch({ type: 'PROFILE_UPDATED', payload: data });
    return data;
  }, []);

  const updatePreferences = useCallback(async (payload) => {
    const data = await authApi.updatePreferences(payload);
    dispatch({ type: 'PREFERENCES_UPDATED', payload: data });
    return data;
  }, []);

  const hasPermission = useCallback(
    (code) => state.permissions.includes(code),
    [state.permissions]
  );

  const value = useMemo(
    () => ({
      ...state,
      isAuthenticated: state.status === 'authenticated',
      isLoading: state.status === 'loading',
      role: state.user?.role ?? null,
      login,
      register,
      logout,
      refresh: loadSession,
      updateProfile,
      updatePreferences,
      hasPermission,
    }),
    [state, login, register, logout, loadSession, updateProfile, updatePreferences, hasPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}

/** Where each role lands after signing in (§43). */
export const dashboardPathFor = (role) =>
  ({
    student: '/student/dashboard',
    parent: '/parent/dashboard',
    teacher: '/teacher/dashboard',
    admin: '/admin/dashboard',
  })[role] ?? '/';

export default AuthContext;
