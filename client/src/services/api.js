import axios from 'axios';

/**
 * The single HTTP client (§43).
 *
 * Two behaviours matter here:
 *  1. The access token lives in memory, not localStorage, so a stray script
 *     cannot read it. The refresh token is an httpOnly cookie the browser
 *     handles for us.
 *  2. A 401 triggers exactly one refresh attempt, and every request that
 *     arrived during that window queues behind it — otherwise a dashboard
 *     firing eight parallel requests would fire eight refreshes.
 */

let accessToken = null;
let onUnauthorized = null;

export const setAccessToken = (token) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;

/** Registered by AuthContext so a hard 401 can clear the session. */
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

// Same-origin '/api' works for a combined deploy or the Vite dev proxy.
// A split deploy (client on Vercel, API elsewhere) sets VITE_API_URL at
// build time to the API's full origin, e.g. https://smart-edu-api.onrender.com/api
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  // Let the browser set the multipart boundary itself.
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// ── Refresh coordination ──────────────────────────────────────────────────
let refreshPromise = null;

async function refreshAccessToken() {
  // Reuse the in-flight refresh rather than starting a second one.
  refreshPromise ??= api
    .post('/auth/refresh', {})
    .then((response) => {
      const token = response.data?.data?.accessToken;
      if (!token) throw new Error('No token returned');
      setAccessToken(token);
      return token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;

    // Network failure or timeout — give the UI something it can display.
    if (!response) {
      return Promise.reject(
        Object.assign(new Error('Could not reach the server. Check your connection and try again.'), {
          isNetworkError: true,
          original: error,
        })
      );
    }

    const isAuthCall = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh');

    if (response.status === 401 && !config._retried && !isAuthCall) {
      config._retried = true;
      try {
        const token = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
        return api(config);
      } catch {
        setAccessToken(null);
        onUnauthorized?.();
      }
    }

    // Normalise the server's error envelope into a throwable Error.
    const message =
      response.data?.message ||
      (response.status === 403
        ? 'You do not have permission to do that'
        : response.status === 404
          ? 'Not found'
          : 'Something went wrong');

    return Promise.reject(
      Object.assign(new Error(message), {
        status: response.status,
        errors: response.data?.errors ?? [],
        data: response.data,
      })
    );
  }
);

/** Unwrap the `{ success, data, message }` envelope. */
const unwrap = (response) => response.data?.data;

export const http = {
  get: (url, config) => api.get(url, config).then(unwrap),
  post: (url, body, config) => api.post(url, body, config).then(unwrap),
  patch: (url, body, config) => api.patch(url, body, config).then(unwrap),
  put: (url, body, config) => api.put(url, body, config).then(unwrap),
  delete: (url, config) => api.delete(url, config).then(unwrap),

  /** Full envelope, for endpoints whose `meta` (pagination) matters. */
  getFull: (url, config) => api.get(url, config).then((response) => response.data),
};

export default api;
